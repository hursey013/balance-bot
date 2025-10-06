import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

const baseJavaScript = {
  ...js.configs.recommended,
  languageOptions: {
    ...js.configs.recommended.languageOptions,
    ecmaVersion: 2024,
    sourceType: 'module',
  },
};

export default [
  {
    ignores: ['apprise/**', 'data/**', 'apps/frontend/dist/**'],
  },
  baseJavaScript,
  prettier,
  {
    files: ['apps/backend/**/*.{js,mjs}'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: [
      'apps/frontend/**/*.{js,jsx,ts,tsx}',
      'apps/frontend/*.config.{js,ts,mjs}',
    ],
    languageOptions: {
      ...baseJavaScript.languageOptions,
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/prop-types': 'off',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
];
