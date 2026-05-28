import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
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
    heading: /Owner Tasks/i,
  },
  {
    email: "labeler@example.com",
    password: "LabelHubLabeler123!",
    heading: /Labeler Tasks/i,
  },
  {
    email: "reviewer@example.com",
    password: "LabelHubReviewer123!",
    heading: /Review Queue/i,
  },
];

function runSeedCommand(args: string[]) {
  return execFileSync("./.venv313/bin/python", ["scripts/seed_e2e_data.py", ...args], {
    cwd: backendDir,
    encoding: "utf-8",
    env: process.env,
  });
}

test("seeded demo users can sign in and reach their role home", async ({ page }) => {
  runSeedCommand(["demo-users"]);

  for (const user of demoUsers) {
    await page.goto(frontendUrl);
    await page.evaluate(() => window.localStorage.clear());
    await page.goto(`${frontendUrl}/login`);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("heading", { name: user.heading })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  }
});
