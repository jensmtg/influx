// Manual mock for Obsidian module

// Mock TFile class
class MockTFile {
	constructor(path, basename) {
		this.path = path || '';
		this.basename = basename || '';
		this.extension = path ? path.split('.').pop() : '';
		this.name = basename || '';
		this.vault = {};
		this.parent = {};
		this.stat = {
			mtime: Date.now(),
			ctime: Date.now(),
			size: 0,
		};
	}
}

class MockTAbstractFile {}

module.exports = {
	TFile: MockTFile,
	TAbstractFile: MockTAbstractFile,
	normalizePath: (path) => path.replace(/\\/g, '/'),
};
