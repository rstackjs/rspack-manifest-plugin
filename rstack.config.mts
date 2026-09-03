// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib({
  bundle: false,
  dts: true,
  format: 'cjs',
  syntax: 'es2023',
});

define.fmt({
  singleQuote: true,
  sortPackageJson: true,
  ignorePatterns: [
    '.github/ISSUE_TEMPLATE/**',
    '.github/ISSUE_TEMPLATE.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
    'packages/json/test/fixtures/garbage/*',
    'packages/yaml/test/fixtures/**/*',
    '**/fixtures/**',
  ],
});

define.staged({
  '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': ['rs lint', 'rs fmt'],
  '*.{json,md,mdx,css,scss,less,html,yml,yaml}': 'rs fmt',
});

define.lint(({ js, ts }) => [
  js.configs.recommended,
  ts.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['test/**/*'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
]);
