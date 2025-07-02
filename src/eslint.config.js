import config from 'eslint-config-xo';
import {defineConfig} from 'eslint/config';
import parser from '@typescript-eslint/parser';

export default defineConfig([
	config,
	{
		rules: {
			camelcase: 'off',
			'@typescript-eslint/naming-convention': 'off',
			indent: ['error', 'tab'],
			'no-await-in-loop': 'off',
		},
		languageOptions: {
			parser,
		},
	},
]);
