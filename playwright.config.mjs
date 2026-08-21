import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const localBrowserLibraries = path.join(
  os.homedir(),
  ".local/share/playwright-libs/usr/lib/x86_64-linux-gnu",
);

export default defineConfig({
  testDir: "./app/e2e",
  fullyParallel: true,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    launchOptions: {
      env: {
        ...process.env,
        LD_LIBRARY_PATH: [process.env.LD_LIBRARY_PATH, localBrowserLibraries]
          .filter(Boolean)
          .join(":"),
      },
    },
  },
  webServer: {
    command: "npm run app",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
    },
  ],
});
