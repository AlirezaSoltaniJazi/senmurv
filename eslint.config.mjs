import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'dist/**',
      'release/**',
      'coverage/**',
      'node_modules/**',
      '*.config.*',
      'scripts/**',
    ],
  },
  eslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        chrome: 'readonly',
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        XMLHttpRequest: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        CustomEvent: 'readonly',
        Event: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        crypto: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        queueMicrotask: 'readonly',
        ProgressEvent: 'readonly',
        XMLHttpRequestEventTarget: 'readonly',
        XMLHttpRequestUpload: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      eqeqeq: ['error', 'always'],
      'no-throw-literal': 'error',
      // Forbid dynamic code generation everywhere except the one sanctioned
      // MAIN-world script runner (see src/background/service-worker.ts), which
      // disables this inline. See agents.md → Security.
      'no-new-func': 'error',
      'no-undef': 'off',
    },
  },
  {
    // Deliberately plain JS, not TS — this is a static asset copied verbatim
    // into dist-firefox/ by scripts/build-firefox.mjs, never passed through
    // Vite. `browser` is Firefox's native global, not the webextension-polyfill
    // import, since this file must stay import-free (see the file for why).
    files: ['src/content/picker-loader.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        browser: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-undef': 'off',
    },
  },
  prettier,
];
