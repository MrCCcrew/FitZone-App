import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "__tests__/class-transfer-integration.test.ts",
      "__tests__/integration/**/*.test.ts",
    ],
    setupFiles: ["__tests__/integration/openai-fetch-mock.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
