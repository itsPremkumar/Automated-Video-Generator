import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,
    {
        ignores: [
            'node_modules/',
            'dist/',
            'dist-electron/',
            'output/',
            'public/',
            '.tmp/',
            'tmp/',
            '*.js',
            '*.cjs',
            '*.mjs',
        ],
    },
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/ban-ts-comment': 'warn',
            'no-console': 'off',
        },
    },
);
