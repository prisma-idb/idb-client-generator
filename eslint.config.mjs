import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
	{ ignores: ['packages/generator/dist/*', 'packages/usage/.svelte-kit/*'] },
	{ files: ['**/*.{js,mjs,cjs,ts}'] },
	{ languageOptions: { globals: globals.browser } },
	pluginJs.configs.recommended,
	...tseslint.configs.recommended
];
