// Global setup for Jest tests
// Mock crypto.randomUUID for Node.js environment

global.crypto = {
	randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9)
} as unknown as Crypto;
