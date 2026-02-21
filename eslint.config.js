import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import jest from "eslint-plugin-jest";

export default tseslint.config(
	{
		ignores: ["node_modules/", "build/", "dist/", "main.js", "site/", ".venv/"],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: {
			globals: {
				...globals.node,
			},
			parser: tseslint.parser,
			parserOptions: {
				sourceType: "module",
			},
		},
		rules: {
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
			"@typescript-eslint/ban-ts-comment": "off",
			"no-prototype-builtins": "off",
			"@typescript-eslint/no-empty-function": "off",
			"@typescript-eslint/no-unused-expressions": "off",
		},
	},
	{
		files: ["**/*.test.ts"],
		...jest.configs["flat/recommended"],
		rules: {
			...jest.configs["flat/recommended"].rules,
			"jest/prefer-expect-assertions": "off",
			"@typescript-eslint/no-explicit-any": "off",
		},
		languageOptions: {
			globals: {
				...globals.jest,
			},
		},
	},
);
