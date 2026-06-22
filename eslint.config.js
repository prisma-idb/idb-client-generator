import prettier from "eslint-config-prettier";
import { fileURLToPath } from "node:url";
import { defineConfig } from "eslint/config";
import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import ts from "typescript-eslint";
import nextVitals from "eslint-config-next/core-web-vitals";

const gitignorePath = fileURLToPath(new URL("./.gitignore", import.meta.url));

export default defineConfig([
  includeIgnoreFile(gitignorePath),
  { ignores: ["**/src/lib/components/ui/**"] },
  // Prisma Next emits generated contract & migration artifacts under the
  // app's prisma/ and migrations/ folders. They're checked in for
  // reproducibility but shouldn't be linted (they use `{}` etc. by design).
  {
    ignores: [
      // contract emit artifacts (contract.json + contract.d.ts)
      "**/src/lib/prisma/contract.d.ts",
      "**/src/lib/prisma/contract.json",
      // migration package artifacts — all *.d.ts and *.json files inside
      // migrations/<space>/<pkg>/; migration.ts is intentionally left lintable
      // since it's the human-editable scaffold.
      "**/migrations/**/*.d.ts",
      "**/migrations/**/*.json",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-undef": "off",
    },
  },
  // Svelte-specific config
  {
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: [".svelte"],
        parser: ts.parser,
      },
    },
  },
  // Next.js/React config for docs and benchmark apps only (scoped with files property)
  ...nextVitals.map((config) => {
    const files = config.files ?? ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"];
    return {
      ...config,
      files: files.map((pattern) => `apps/{docs,benchmark}/src/${pattern}`),
    };
  }),
]);
