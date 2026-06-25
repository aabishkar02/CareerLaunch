// ============================================================
// TUTORING PLATFORM — Root ESLint Config
// Applies to both frontend and backend.
// Each sub-package can extend or override this.
// ============================================================

module.exports = {
  root: true,

  // Base parser — overridden per environment below
  parser: '@babel/eslint-parser',

  env: {
    es2022: true,
    node: true,
  },

  extends: [
    'eslint:recommended',
    'plugin:import/recommended',
    'prettier', // Must be last — disables rules that conflict with Prettier
  ],

  plugins: ['import'],

  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
    },
  },

  rules: {
    // ── Errors ──────────────────────────────────────────────
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    'no-debugger': 'error',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-var': 'error',
    'prefer-const': 'error',

    // ── Imports ─────────────────────────────────────────────
    'import/order': [
      'warn',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'import/no-duplicates': 'error',
    'import/no-unresolved': 'error',

    // ── Style ────────────────────────────────────────────────
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'arrow-body-style': ['warn', 'as-needed'],
  },

  // ── Per-environment overrides ────────────────────────────
  overrides: [
    // Frontend (React + JSX)
    {
      files: ['frontend/**/*.{js,jsx}'],
      env: {
        browser: true,
        node: false,
      },
      extends: [
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
        'plugin:jsx-a11y/recommended',
      ],
      plugins: ['react', 'react-hooks', 'jsx-a11y'],
      settings: {
        react: { version: 'detect' },
      },
      rules: {
        'react/react-in-jsx-scope': 'off', // Not needed in React 17+
        'react/prop-types': 'off',         // Using JSDoc or TypeScript later
        'react/display-name': 'off',
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'warn',
      },
    },

    // Backend (Node.js / Express)
    {
      files: ['backend/**/*.js'],
      env: {
        node: true,
        browser: false,
      },
      rules: {
        'no-process-exit': 'error',
        'handle-callback-err': 'error',
      },
    },

    // Config files at root
    {
      files: ['*.config.js', '*.config.cjs', '.eslintrc.js'],
      env: { node: true },
      rules: {
        'no-console': 'off',
      },
    },

    // Test files
    {
      files: ['**/*.test.js', '**/*.spec.js', '**/__tests__/**/*.js'],
      env: {
        jest: true,
        node: true,
      },
      rules: {
        'no-console': 'off',
      },
    },
  ],
};