module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: [
		'**/tests/**/*.test.ts',
		'**/tests/**/*.test.tsx',
	],
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
	moduleDirectories: ['node_modules', '<rootDir>/tests/__mocks__'],
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/src/$1',
	},
	setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
	collectCoverageFrom: [
		'src/**/*.{ts,tsx}',
		'!src/**/*.test.{ts,tsx}',
		'!src/main.tsx',
		'!src/**/*.d.ts',
	],
};
