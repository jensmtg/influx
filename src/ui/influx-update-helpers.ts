import type { TFile } from 'obsidian';
import type { ExtendedInlinkingFile } from '../domain/backlinks/types';
import type { InfluxUpdateEvent, InfluxUpdateOp } from '../platform/events/influx-updates';

export interface InfluxUpdateTarget {
	file?: { path?: string } | null;
	show?: boolean;
	shouldUpdate: (file: TFile) => boolean;
	shouldUpdatePaths?: (paths: readonly string[]) => boolean;
	refreshVisibility?: () => boolean;
	makeInfluxList: () => Promise<void>;
	toEntries: () => ExtendedInlinkingFile[];
}

function getChangedPaths(event: InfluxUpdateEvent): string[] {
	const paths = [event.file?.path, event.oldPath].filter((path): path is string => Boolean(path));
	return Array.from(new Set(paths));
}

export function shouldProcessInfluxUpdateEvent(params: {
	event: InfluxUpdateEvent;
	currentPath?: string;
	affectsBacklinks: boolean;
}): boolean {
	const { event, currentPath, affectsBacklinks } = params;

	if (!currentPath) {
		return false;
	}

	if (event.op === 'layout-change' || event.op === 'file-open') {
		return false;
	}

	if (event.op === 'modify' || event.op === 'rename' || event.op === 'delete') {
		const changedPaths = getChangedPaths(event);
		if (changedPaths.length === 0) {
			return false;
		}
		const touchesCurrentFile = changedPaths.includes(currentPath);
		return touchesCurrentFile || affectsBacklinks;
	}

	return true;
}

export async function resolveInfluxUpdateEntries(params: {
	event: InfluxUpdateEvent;
	current: InfluxUpdateTarget;
	seq: number;
	getLatestSeq: () => number;
	isAborted: () => boolean;
}): Promise<ExtendedInlinkingFile[] | null> {
	const { event, current, seq, getLatestSeq, isAborted } = params;
	if (isAborted()) {
		return null;
	}

	const currentPath = current.file?.path;
	const changedPaths = getChangedPaths(event);
	const affectsBacklinks = changedPaths.length === 0
		? false
		: current.shouldUpdatePaths?.(changedPaths)
			?? (event.file ? current.shouldUpdate(event.file) : current.shouldUpdate(({ path: changedPaths[0] } as TFile)));
	if (!shouldProcessInfluxUpdateEvent({ event, currentPath, affectsBacklinks })) {
		return null;
	}

	const visibleAfterRefresh = current.refreshVisibility?.() ?? current.show;
	if (visibleAfterRefresh === false) {
		return [];
	}

	await current.makeInfluxList();
	if (isAborted() || seq !== getLatestSeq()) {
		return null;
	}

	return current.toEntries();
}

export function makeUpdateEvent(op: InfluxUpdateOp, path?: string, oldPath?: string): InfluxUpdateEvent {
	const file = path ? ({ path } as TFile) : undefined;
	return { op, file, oldPath };
}
