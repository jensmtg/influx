const DEBUG_MODE_STORAGE_KEY = 'influx-debug-mode';
const DEBUG_MODE_URL_PARAM = 'influx-debug';

function getLocalStorageSafely(): Storage | null {
	try {
		if (typeof window === 'undefined' || !window.localStorage) {
			return null;
		}
		return window.localStorage;
	} catch {
		return null;
	}
}

export function isDebugMode(): boolean {
	const storage = getLocalStorageSafely();
	const localStorageDebug = storage?.getItem(DEBUG_MODE_STORAGE_KEY);
	if (localStorageDebug != null) {
		return localStorageDebug === 'true';
	}

	if (typeof window === 'undefined' || !window.location) {
		return false;
	}

	const urlParams = new URLSearchParams(window.location.search);
	const urlDebug = urlParams.get(DEBUG_MODE_URL_PARAM);
	if (urlDebug !== null) {
		return urlDebug === 'true';
	}

	return false;
}

export function setDebugMode(enabled: boolean): void {
	const storage = getLocalStorageSafely();
	if (!storage) {
		return;
	}
	storage.setItem(DEBUG_MODE_STORAGE_KEY, String(enabled));
}
