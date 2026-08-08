import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default defineConfig([
  {
    // Explicit, in addition to workspace scoping (pnpm-workspace.yaml only
    // lists framework/) and tsconfig's include — belt and suspenders so
    // this config never touches examples/ (Java, unrelated) or research/
    // (gitignored third-party clones) even if invoked from the repo root.
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '../examples/**', '../research/**'],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Root-level config files aren't covered by tsconfig.json's
        // include (src, tests only) — allowDefaultProject lints them
        // without requiring full type-aware project membership.
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'tsdown.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  eslintConfigPrettier,
]);
