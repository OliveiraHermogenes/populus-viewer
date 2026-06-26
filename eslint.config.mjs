import preact from 'eslint-config-preact';
import neostandard from 'neostandard';

export default [
  ...neostandard({ noJsx: true }),
  ...preact,
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_$' }],
    },
  },
];
