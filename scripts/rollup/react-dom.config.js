import alias from '@rollup/plugin-alias';
import generatePackageJson from 'rollup-plugin-generate-package-json';

import { getBaseRollupPlugins, getPackageJSON, resolvePkgPath } from './utils';

const { name, module, peerDependencies } = getPackageJSON('react-dom');
// react dom 包的路径
const pkgPath = resolvePkgPath(name);
// react dom 产物路径
const pkgDistPath = resolvePkgPath(name, true);

export default [
	// react dom
	{
		input: `${pkgPath}/${module}`,
		output: [
			{
				file: `${pkgDistPath}/index.js`,
				name: 'index.js',
				format: 'umd'
			},
			{
				// 兼容 react/client 的导入
				file: `${pkgDistPath}/client.js`,
				name: 'client.js',
				format: 'umd'
			}
		],
		externals: [...Object.keys(peerDependencies)],
		plugins: [
			...getBaseRollupPlugins(),
			alias({
				entries: {
					hostConfig: `${pkgPath}/src/hostConfig.ts`
				}
			}),
			generatePackageJson({
				inputFolder: pkgPath,
				outputFolder: pkgDistPath,
				baseContents: ({ name, description, version }) => ({
					name,
					description,
					version,
					peerDependencies: {
						react: version
					},
					main: 'index.js'
				})
			})
		]
	}
];
