import config from 'eslint-config-xo';
import { defineConfig } from 'eslint/config';
import parser from '@typescript-eslint/parser';

export default defineConfig([
	config,
	{
		rules: {
			camelcase: 'off',
			'@typescript-eslint/naming-convention': 'off',
			indent: ['error', 'tab'],
			'no-await-in-loop': 'off',
			'@stylistic/object-curly-spacing': ['error', 'always'],
			'no-console': ['warn', { allow: ['warn', 'error'] }],

		},
		languageOptions: {
			parser,
		},
	},
]);
