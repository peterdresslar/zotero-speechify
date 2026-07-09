import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: [
            "packages/**/tests/unit/**/*.test.ts",
            "apps/**/src/**/*.test.ts"
          ],
          exclude: ["**/node_modules/**", "**/wire/**"]
        }
      },
      {
        test: {
          name: "wire",
          environment: "node",
          include: ["packages/**/tests/wire/**/*.test.ts"],
          exclude: ["**/node_modules/**"]
        }
      }
    ]
  }
});
