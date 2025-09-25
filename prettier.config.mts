import type { Config } from 'prettier';

const config: Config = {
	semi: true,
	singleQuote: true,
	trailingComma: 'none',
	printWidth: 80,
	tabWidth: 2,
	useTabs: true,
	bracketSpacing: true,
	importOrder: ['^[./]'],
	importOrderSeparation: true,
	importOrderSortSpecifiers: true,
	plugins: ['@trivago/prettier-plugin-sort-imports']
};

export default config;
