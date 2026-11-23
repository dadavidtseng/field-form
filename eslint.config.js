// One lint config for every workspace: Expo's official rules (React, hooks, React Native,
// TypeScript), with Prettier owning all formatting so the two tools never disagree.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['**/node_modules/**', '**/.expo/**', '**/dist/**', 'server/data/**', 'app/expo-env.d.ts'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // A zod schema and its inferred type share one name (`const Wall` + `type Wall`), which
      // TypeScript allows; the compiler already reports genuine redeclarations.
      '@typescript-eslint/no-redeclare': 'off',
    },
  },
]);
