import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Allow intentionally-unused identifiers prefixed with underscore
      // (e.g. Next.js route handler params kept for signature parity).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Tool output dirs (gstack browse-audit jsonl 等)
    ".gstack/**",
    ".claude/**",
    "data/**",
    "drizzle/**",
    // standalone 打包产物(node_modules 内为第三方 bundle,非项目代码)
    "release/**",
    // 测试/报告产物(vitest coverage、playwright report 与 trace、单测试结果)
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
