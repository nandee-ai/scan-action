import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@nandee-ai/ci-core": fileURLToPath(new URL("./core/src/index.ts", import.meta.url)) } },
  test: {
    include: ["core/test/**/*.test.ts", "cli/test/**/*.test.ts", "github-action/test/**/*.test.ts", "gitlab/test/**/*.test.ts"],
    environment: "node",
    coverage: { provider: "v8", include: ["core/src/**", "cli/src/**", "github-action/src/**", "gitlab/src/**"] },
  },
});
