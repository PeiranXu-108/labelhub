import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const backendDir = path.join(repoRoot, "backend");
const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

type RoleName = "owner" | "labeler" | "reviewer";

type TokenPayload = {
  tokens: Record<RoleName, { subject: string; email: string; token: string }>;
};

function runSeedCommand(args: string[]) {
  const result = spawnSync("./.venv313/bin/python", ["scripts/seed_e2e_data.py", ...args], {
    cwd: backendDir,
    encoding: "utf-8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `seed_e2e_data.py exited with status ${result.status}`);
  }
  return result.stdout;
}

type ApiClient = {
  get: (path: string) => Promise<Response>;
  post: (path: string, options?: { data?: unknown }) => Promise<Response>;
  put: (path: string, options?: { data?: unknown }) => Promise<Response>;
  dispose: () => Promise<void>;
};

function apiContext(role: RoleName, tokens: TokenPayload): ApiClient {
  async function send(method: string, requestPath: string, data?: unknown) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${tokens.tokens[role].token}`,
      Connection: "close",
    };
    let body: string | undefined;
    if (data !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(data);
    }
    return fetch(new URL(requestPath, backendUrl), { method, headers, body });
  }

  return {
    get: (path: string) => send("GET", path),
    post: (path: string, options: { data?: unknown } = {}) => send("POST", path, options.data),
    put: (path: string, options: { data?: unknown } = {}) => send("PUT", path, options.data),
    dispose: async () => {},
  };
}

async function expectApiOk(response: Response) {
  const body = await response.clone().text();
  expect(response.ok, `${response.status} ${response.statusText}: ${body}`).toBe(true);
}

test("owner to labeler to AI review to reviewer to export happy path", async () => {
  const tokens = JSON.parse(runSeedCommand(["tokens"])) as TokenPayload;
  const ownerApi = apiContext("owner", tokens);
  const labelerApi = apiContext("labeler", tokens);
  const reviewerApi = apiContext("reviewer", tokens);

  await test.step("backend is healthy", async () => {
    const health = await ownerApi.get("/health");
    await expectApiOk(health);
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
    await expectApiOk(taskResponse);
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
    await expectApiOk(importResponse);

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
    await expectApiOk(templateResponse);

    await expectApiOk(await ownerApi.post(`/tasks/${task.id}/template/publish`));
    await expectApiOk(
      await ownerApi.put(`/tasks/${task.id}/review-config`, {
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
    );
    await expectApiOk(await ownerApi.post(`/tasks/${task.id}/publish`));

    return { task };
  });

  const submitted = await test.step("labeler claims and submits annotation", async () => {
    const marketplace = await labelerApi.get("/labeler/tasks");
    await expectApiOk(marketplace);
    expect((await marketplace.json()).map((task: { id: string }) => task.id)).toContain(created.task.id);

    const claimResponse = await labelerApi.post(`/labeler/tasks/${created.task.id}/claim`);
    await expectApiOk(claimResponse);
    const claim = await claimResponse.json();

    const assignmentResponse = await labelerApi.get(`/labeler/assignments/${claim.id}`);
    await expectApiOk(assignmentResponse);
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
    await expectApiOk(submitResponse);
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
    await expectApiOk(queue);
    const queueItems = await queue.json();
    expect(queueItems.map((item: { submission: { id: string } }) => item.submission.id)).toContain(
      submitted.submission.id,
    );

    const detail = await reviewerApi.get(`/review/submissions/${submitted.submission.id}`);
    await expectApiOk(detail);
    const detailPayload = await detail.json();
    expect(detailPayload.template_schema.id).toBe(submitted.assignment.template_schema.id);
    expect(detailPayload.ai_reviews[0].overall_score).toBe(94);
    expect(detailPayload.previous_attempts).toHaveLength(0);

    const approve = await reviewerApi.post(`/review/submissions/${submitted.submission.id}/approve`);
    await expectApiOk(approve);
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
    await expectApiOk(exportResponse);
    const exportJob = await exportResponse.json();

    const exportOutput = JSON.parse(runSeedCommand(["run-export", exportJob.id]));
    expect(exportOutput.export_job.status).toBe("succeeded");

    const download = await ownerApi.get(`/exports/${exportJob.id}/download`);
    await expectApiOk(download);
    const body = await download.text();
    expect(body).toContain("positive");
    expect(body).toContain("billing problem");
  });

  await ownerApi.dispose();
  await labelerApi.dispose();
  await reviewerApi.dispose();
});
