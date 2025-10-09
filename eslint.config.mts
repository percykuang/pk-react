import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
	{
		files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
		languageOptions: {
			globals: globals.browser
		}
	},
	tseslint.configs.recommended,
	{
		files: ['**/*.{js,ts}'],
		rules: {
			'@typescript-eslint/no-unused-vars': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/ban-ts-comment': 'off'
		}
	},
	{
		files: [
			'**/__tests__/**/*.js',
			'**/__test__/**/*.js',
			'**/*.test.js',
			'**/*.spec.js'
		],
		rules: {
			'@typescript-eslint/no-require-imports': 'off'
		}
	}
]);
