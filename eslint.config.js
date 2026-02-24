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
		files: ["src/features/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["**/app/**"],
							allowTypeImports: true,
							message: "Features must not import from app.",
						},
					],
				},
			],
		},
	},
	{
		files: ["src/domain/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["**/app/**", "**/features/**"],
							message: "Domain must not import from app or features.",
						},
					],
				},
			],
		},
	},
	{
		files: ["src/platform/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["**/app/**", "**/features/**", "**/domain/**"],
							message: "Platform must not depend on app, features, or domain.",
						},
					],
				},
			],
		},
	},
	{
		files: ["src/shared/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["**/app/**", "**/features/**", "**/domain/**", "**/platform/**"],
							message: "Shared must stay dependency-light and avoid app/features/domain/platform imports.",
						},
					],
				},
			],
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
