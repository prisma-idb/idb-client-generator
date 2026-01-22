import prettier from "eslint-config-prettier";
import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import ts from "typescript-eslint";

export default ts.config(
  {
    ignores: [
      // Build outputs
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/.svelte-kit/**",
      // Dependencies
      "**/node_modules/**",
      // Testing outputs
      "**/coverage/**",
      "**/test-results/**",
      "**/playwright-report/**",
      // Env files
      ".env*",
      // Component libraries (from usage package)
      "**/src/lib/components/ui/**",
      // Turbo cache
      ".turbo/**",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parser: ts.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
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
    },
  },
  // Svelte-specific config
  ...svelte.configs["flat/recommended"],
  {
    files: ["**/*.svelte"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parser: svelte.parser,
      parserOptions: {
        parser: ts.parser,
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
  },
  // Prettier config - must be last
  prettier,
  ...svelte.configs["flat/prettier"],
);
