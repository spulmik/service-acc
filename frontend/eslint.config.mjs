import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";

export default [
	{
		ignores: ["dist/**", "node_modules/**", "coverage/**"],
	},
	js.configs.recommended,
	...pluginVue.configs["flat/recommended"],
	{
		files: ["**/*.{js,mjs,cjs,vue}"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
	},
	eslintConfigPrettier,
];
