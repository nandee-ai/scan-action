import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["core/test/**/*.test.ts", "cli/test/**/*.test.ts", "github-action/test/**/*.test.ts", "gitlab/test/**/*.test.ts"],
    environment: "node",
    coverage: { provider: "v8", include: ["core/src/**", "cli/src/**", "github-action/src/**", "gitlab/src/**"] },
  },
});
