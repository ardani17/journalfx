import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;
const BASE = `http://localhost:${PORT}`;
const aiProviderMode = process.env.AI_JOURNAL_E2E_MODE ?? "mock";
const mockProviderOrigin = "http://127.0.0.1:3216";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "production",
      ...(aiProviderMode === "live" ? {} : {
        AI_BASE_URL: aiProviderMode === "mock" ? `${mockProviderOrigin}/v1` : "",
        AI_API_KEY: aiProviderMode === "mock" ? "mock-provider-key" : "",
        AI_MODEL: aiProviderMode === "mock" ? "mock-provider-model" : "",
      }),
    },
  },
});
