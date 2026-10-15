import svelte from "eslint-plugin-svelte";
import globals from "globals";
import ts from "typescript-eslint";

export default ts.config(
  {
    ignores: ["**/node_modules/", "**/dist/", "**/build/", "**/.svelte-kit/", "**/.astro/", "release/", ".local/", "generated/", "notes/", "shots/"],
  },
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // The app is served from the root, and many of its links lead to pages outside it.
      "svelte/no-navigation-without-resolve": "off",
      // A leading underscore marks a value that is taken apart on purpose and not used.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: { parser: ts.parser, extraFileExtensions: [".svelte"] },
    },
  },
);
