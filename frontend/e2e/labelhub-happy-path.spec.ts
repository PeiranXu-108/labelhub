import { expect, request, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const backendDir = path.join(repoRoot, "backend");
const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
const frontendUrl = process.env.FRONTEND_URL ?? "http://127.0.0.1:5173";

type RoleName = "owner" | "labeler" | "reviewer";

type TokenPayload = {
  tokens: Record<RoleName, { subject: string; token: string }>;
};

function runSeedCommand(args: string[]) {
  return execFileSync("./.venv313/bin/python", ["scripts/seed_e2e_data.py", ...args], {
    cwd: backendDir,
    encoding: "utf-8",
    env: process.env,
  });
}

async function apiContext(role: RoleName, tokens: TokenPayload) {
  return request.newContext({
    baseURL: backendUrl,
    extraHTTPHeaders: {
      Authorization: `Bearer ${tokens.tokens[role].token}`,
    },
  });
}

test("owner to labeler to AI review to reviewer to export happy path", async ({ page }) => {
  const tokens = JSON.parse(runSeedCommand(["tokens"])) as TokenPayload;
  const ownerApi = await apiContext("owner", tokens);
  const labelerApi = await apiContext("labeler", tokens);
  const reviewerApi = await apiContext("reviewer", tokens);

  await test.step("backend is healthy", async () => {
    const health = await ownerApi.get("/health");
    await expect(health).toBeOK();
    await expect(await health.json()).toEqual({ status: "ok" });
  });

  const created = await test.step("owner creates task, item, template, and publishes", async () => {
    const taskResponse = await ownerApi.post("/tasks", {
      data: {
        name: `E2E Support QA ${Date.now()}`,
        description: "Playwright smoke task covering the LabelHub MVP flow.",
        distribution_strategy: "manual",
        quota_per_labeler: 5,
      },
    });
    await expect(taskResponse).toBeOK();
    const task = await taskResponse.json();

    const importResponse = await ownerApi.post(`/tasks/${task.id}/items/import`, {
      data: {
        items: [
          {
            external_id: `ticket-${Date.now()}`,
            payload: {
              text: "Customer says the agent solved the billing issue quickly.",
              channel: "email",
            },
          },
        ],
      },
    });
    await expect(importResponse).toBeOK();

    const templateResponse = await ownerApi.post(`/tasks/${task.id}/template/draft`, {
      data: {
        schema: {
          version: 1,
          title: "Support quality review",
          layout: { type: "single", groups: [] },
          fields: [
            {
              id: "raw_text",
              type: "show_item",
              label: "Original text",
              source: "item.payload.text",
            },
            {
              id: "sentiment",
              type: "radio",
              label: "Sentiment",
              required: true,
              options: [
                { label: "Positive", value: "positive" },
                { label: "Neutral", value: "neutral" },
                { label: "Negative", value: "negative" },
              ],
            },
            {
              id: "summary",
              type: "textarea",
              label: "Summary",
              required: true,
            },
          ],
          llmTools: [],
          validations: [],
          visibilityRules: [],
        },
      },
    });
    await expect(templateResponse).toBeOK();

    await expect(ownerApi.post(`/tasks/${task.id}/template/publish`)).resolves.toBeOK();
    await expect(
      ownerApi.put(`/tasks/${task.id}/review-config`, {
        data: {
          prompt_template: "Review annotation quality.",
          criteria: [{ key: "accuracy", label: "Accuracy", maxScore: 5 }],
          pass_threshold: 80,
          return_threshold: 40,
          manual_review_threshold: 60,
          model_name: "static-e2e-model",
          temperature: 0,
          max_retries: 1,
        },
      }),
    ).resolves.toBeOK();
    await expect(ownerApi.post(`/tasks/${task.id}/publish`)).resolves.toBeOK();

    return { task };
  });

  const submitted = await test.step("labeler claims and submits annotation", async () => {
    const marketplace = await labelerApi.get("/labeler/tasks");
    await expect(marketplace).toBeOK();
    expect((await marketplace.json()).map((task: { id: string }) => task.id)).toContain(created.task.id);

    const claimResponse = await labelerApi.post(`/labeler/tasks/${created.task.id}/claim`);
    await expect(claimResponse).toBeOK();
    const claim = await claimResponse.json();

    const assignmentResponse = await labelerApi.get(`/labeler/assignments/${claim.id}`);
    await expect(assignmentResponse).toBeOK();
    const assignment = await assignmentResponse.json();
    expect(assignment.template_schema.schema_payload.title).toBe("Support quality review");

    const submitResponse = await labelerApi.post(`/labeler/assignments/${claim.id}/submit`, {
      data: {
        answer_payload: {
          sentiment: "positive",
          summary: "The response solved the customer's billing problem quickly.",
        },
      },
    });
    await expect(submitResponse).toBeOK();
    const submission = await submitResponse.json();
    expect(submission.status).toBe("submitted");
    return { assignment, submission };
  });

  await test.step("AI review runs with deterministic structured output", async () => {
    const reviewOutput = JSON.parse(runSeedCommand(["ai-review", submitted.submission.id]));
    expect(reviewOutput.ai_review.decision).toBe("pass");
    expect(reviewOutput.ai_review.overall_score).toBe(94);
  });

  await test.step("reviewer filters queue, opens detail, and approves", async () => {
    const queue = await reviewerApi.get(
      `/review/queue?task_id=${created.task.id}&ai_decision=pass&min_score=90`,
    );
    await expect(queue).toBeOK();
    const queueItems = await queue.json();
    expect(queueItems.map((item: { submission: { id: string } }) => item.submission.id)).toContain(
      submitted.submission.id,
    );

    const detail = await reviewerApi.get(`/review/submissions/${submitted.submission.id}`);
    await expect(detail).toBeOK();
    const detailPayload = await detail.json();
    expect(detailPayload.template_schema.id).toBe(submitted.assignment.template_schema.id);
    expect(detailPayload.ai_reviews[0].overall_score).toBe(94);
    expect(detailPayload.previous_attempts).toHaveLength(0);

    const approve = await reviewerApi.post(`/review/submissions/${submitted.submission.id}/approve`);
    await expect(approve).toBeOK();
    expect((await approve.json()).status).toBe("approved");
  });

  await test.step("owner exports approved data and downloads JSONL", async () => {
    const exportResponse = await ownerApi.post(`/tasks/${created.task.id}/exports`, {
      data: {
        format: "jsonl",
        field_mapping: {
          "item.external_id": "external_id",
          "answers.sentiment": "sentiment",
          "answers.summary": "summary",
        },
        include_review_metadata: true,
      },
    });
    await expect(exportResponse).toBeOK();
    const exportJob = await exportResponse.json();

    const exportOutput = JSON.parse(runSeedCommand(["run-export", exportJob.id]));
    expect(exportOutput.export_job.status).toBe("succeeded");

    const download = await ownerApi.get(`/exports/${exportJob.id}/download`);
    await expect(download).toBeOK();
    const body = await download.text();
    expect(body).toContain("positive");
    expect(body).toContain("billing problem");
  });

  await test.step("frontend role routes render against the running API", async () => {
    await page.goto(frontendUrl);
    await page.evaluate((token) => window.localStorage.setItem("labelhub.accessToken", token), tokens.tokens.owner.token);
    await page.goto(`${frontendUrl}/owner/tasks`);
    await expect(page.getByRole("heading", { name: /Owner Tasks/i })).toBeVisible();
    await expect(page.getByText(created.task.name)).toBeVisible();

    await page.evaluate((token) => window.localStorage.setItem("labelhub.accessToken", token), tokens.tokens.labeler.token);
    await page.goto(`${frontendUrl}/labeler/tasks`);
    await expect(page.getByRole("heading", { name: /Labeler Tasks/i })).toBeVisible();
    await expect(page.getByText(created.task.name).first()).toBeVisible();

    await page.evaluate((token) => window.localStorage.setItem("labelhub.accessToken", token), tokens.tokens.reviewer.token);
    await page.goto(`${frontendUrl}/review/queue`);
    await expect(page.getByRole("heading", { name: /Review Queue/i })).toBeVisible();
  });

  await ownerApi.dispose();
  await labelerApi.dispose();
  await reviewerApi.dispose();
});
