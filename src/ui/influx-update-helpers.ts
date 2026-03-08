import type { TFile } from 'obsidian';
import type { ExtendedInlinkingFile } from '../domain/backlinks/types';
import type { InfluxUpdateEvent } from '../platform/events/influx-updates';

export interface InfluxUpdateTarget {
	file?: { path?: string } | null;
	show?: boolean;
	shouldUpdate: (file: TFile) => boolean;
	refreshVisibility?: () => boolean;
	makeInfluxList: () => Promise<void>;
	toEntries: () => ExtendedInlinkingFile[];
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
		if (!event.file) {
			return false;
		}

		if (event.op === 'rename' || event.op === 'delete') {
			return true;
		}

		const touchesCurrentFile = event.file.path === currentPath;
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
	const affectsBacklinks = event.file ? current.shouldUpdate(event.file) : false;
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

export function makeUpdateEvent(op: string, path?: string): InfluxUpdateEvent {
	const file = path ? ({ path } as TFile) : undefined;
	return { op, file };
}
