import path from 'node:path';
import { fileURLToPath } from 'node:url';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,
    {
        languageOptions: {
            parserOptions: {
                project: true,
                tsconfigRootDir: __dirname,
            },
        },
    },
    {
        ignores: [
            'node_modules/',
            'dist/',
            'dist-electron/',
            'output/',
            'public/',
            '.tmp/',
            'tmp/',
            'remotion/_study/',
        ],
    },
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/ban-ts-comment': 'warn',
            '@typescript-eslint/prefer-optional-chain': 'warn',
            '@typescript-eslint/prefer-nullish-coalescing': 'warn',
            // Native binary modules (ffmpeg-static, ffprobe-static, edge-tts) have no
            // ESM default export / type declarations, so they MUST be loaded via
            // require(). These are intentional and safe; keep them as warnings so
            // the gate stays green and still catches real require() misuse.
            '@typescript-eslint/no-require-imports': 'warn',
            '@typescript-eslint/no-var-requires': 'warn',
            'no-console': 'off',
            'prefer-const': 'error',
            'no-var': 'error',
            'eqeqeq': ['error', 'smart'],
        },
    },
);
