import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const backendDir = path.join(repoRoot, "backend");
const frontendUrl = process.env.FRONTEND_URL ?? "http://127.0.0.1:5173";

const demoUsers = [
  {
    email: "owner@example.com",
    password: "LabelHubOwner123!",
    heading: /负责人任务/,
  },
  {
    email: "labeler@example.com",
    password: "LabelHubLabeler123!",
    heading: /标注任务/,
  },
  {
    email: "reviewer@example.com",
    password: "LabelHubReviewer123!",
    heading: /审核队列/,
  },
];

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

test("seeded demo users can sign in and reach their role home", async ({ page }) => {
  runSeedCommand(["demo-users"]);

  for (const user of demoUsers) {
    await page.goto(frontendUrl);
    await page.evaluate(() => window.localStorage.clear());
    await page.goto(`${frontendUrl}/login`);
    await page.getByLabel("邮箱").fill(user.email);
    await page.getByLabel("密码").fill(user.password);
    await page.getByRole("button", { name: /登\s*录/ }).click();

    await expect(page.getByRole("heading", { name: user.heading })).toBeVisible();
    await expect(page.getByRole("button", { name: "退出登录" })).toBeVisible();
  }
});
