import * as React from 'react';
import type { ExtendedInlinkingFile } from '../domain/backlinks/types';
import { CONSTANTS } from '../config/constants';
import type { ObsidianInfluxSettings } from '../types';
import MarkdownMount from './markdown-mount';
import {
	getSearchMatchDetails,
	getSourcePathContext,
	splitTextBySearchQuery,
	type InfluxRenderMode,
} from './influx-react-component-helpers';

export function renderHighlightedText(text: string, searchQuery: string): React.ReactNode {
	return splitTextBySearchQuery(text, searchQuery).map((segment, index) => {
		if (!segment.match) {
			return <React.Fragment key={`${segment.text}-${index}`}>{segment.text}</React.Fragment>;
		}
		return <mark key={`${segment.text}-${index}`}>{segment.text}</mark>;
	});
}

export function InfluxSummaryRow(props: {
	variant: 'toolbar' | 'pane';
	mentionsCountLabel: string;
	mentionsCountTooltip: string;
}): React.ReactElement {
	const { variant, mentionsCountLabel, mentionsCountTooltip } = props;
	return (
		<div className={`influx-summary-row${variant === 'toolbar' ? ' influx-summary-row--toolbar' : ' influx-summary-row--pane'}`}>
			<div className="influx-summary-meta">
				<div className="influx-summary-title">Linked mentions (influx)</div>
				<span className="influx-summary-count" title={mentionsCountTooltip}>
					{mentionsCountLabel}
				</span>
			</div>
		</div>
	);
}

function ToolbarIconButton(props: {
	label: string;
	onClick: () => void;
	children: React.ReactNode;
	hoverLabel?: string;
	active?: boolean;
	pressed?: boolean;
}): React.ReactElement {
	const { label, onClick, children, hoverLabel, active = false, pressed } = props;
	const tooltipLabel = hoverLabel ?? label;
	const labelId = React.useId();
	return (
		<button
			type="button"
			className={`influx-icon-button influx-toolbar-button${active ? ' is-active' : ''}`}
			aria-labelledby={labelId}
			aria-pressed={pressed}
			onClick={onClick}
		>
			{children}
			<span id={labelId} className="influx-visually-hidden">
				{label}
			</span>
			<span className="influx-control-tooltip" aria-hidden="true">
				{tooltipLabel}
			</span>
		</button>
	);
}

export function InfluxToolbar(props: {
	showToolbarSummary: boolean;
	isEditorMode: boolean;
	mentionsCountLabel: string;
	mentionsCountTooltip: string;
	summaryRowLabel: string;
	allVisibleComponentsCollapsed: boolean;
	onToggleAll: () => void;
	isSearchExpanded: boolean;
	isSearchFocused: boolean;
	inputValue: string;
	searchQuery: string;
	searchInputRef: React.RefObject<HTMLInputElement | null>;
	onToggleSearch: () => void;
	onSearchChange: (value: string) => void;
	onSearchFocusChange: (focused: boolean) => void;
	onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
	onResetSearch: (closePanel: boolean) => void;
	onCycleListLimit: () => void;
	onToggleSortOrder: () => void;
	onToggleFrontmatterLinks: () => void;
	listLimitHoverLabel: string;
	sortHoverLabel: string;
	frontmatterHoverLabel: string;
	includeFrontmatterLinks: boolean;
}): React.ReactElement {
	const {
		showToolbarSummary,
		isEditorMode,
		mentionsCountLabel,
		mentionsCountTooltip,
		summaryRowLabel,
		allVisibleComponentsCollapsed,
		onToggleAll,
		isSearchExpanded,
		isSearchFocused,
		inputValue,
		searchQuery,
		searchInputRef,
		onToggleSearch,
		onSearchChange,
		onSearchFocusChange,
		onSearchKeyDown,
		onResetSearch,
		onCycleListLimit,
		onToggleSortOrder,
		onToggleFrontmatterLinks,
		listLimitHoverLabel,
		sortHoverLabel,
		frontmatterHoverLabel,
		includeFrontmatterLinks,
	} = props;
	const toolbarLabelId = React.useId();

	return (
		<div className={`influx-toolbar${isEditorMode ? ' influx-toolbar--editor' : ''}`}>
			{showToolbarSummary && (
				<InfluxSummaryRow
					variant="toolbar"
					mentionsCountLabel={mentionsCountLabel}
					mentionsCountTooltip={mentionsCountTooltip}
				/>
			)}

			<div className="influx-toolbar-actions" role="toolbar" aria-labelledby={toolbarLabelId}>
				<span id={toolbarLabelId} className="influx-visually-hidden">
					Influx actions
				</span>
				<ToolbarIconButton label={summaryRowLabel} hoverLabel={summaryRowLabel} onClick={onToggleAll}>
					{allVisibleComponentsCollapsed ? (
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="influx-svg-icon influx-svg-icon--expand-all">
							<path d="m7 5 5 5 5-5"></path>
							<path d="m7 12 5 5 5-5"></path>
						</svg>
					) : (
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="influx-svg-icon influx-svg-icon--collapse-all">
							<path d="m7 10 5-5 5 5"></path>
							<path d="m7 17 5-5 5 5"></path>
						</svg>
					)}
				</ToolbarIconButton>

				<ToolbarIconButton
					label={isSearchExpanded ? 'Close search' : 'Search backlinks'}
					onClick={onToggleSearch}
					active={isSearchExpanded}
					pressed={isSearchExpanded}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="influx-svg-icon influx-svg-icon--search">
						<circle cx="11" cy="11" r="8"></circle>
						<path d="m21 21-4.3-4.3"></path>
					</svg>
				</ToolbarIconButton>

				{isSearchExpanded && (
					<div className={`influx-search-wrap ${isSearchFocused ? 'influx-is-focused' : ''}`}>
						<input
							ref={searchInputRef}
							type="text"
							className="influx-search-input"
							placeholder="Search backlinks..."
							value={inputValue}
							onChange={(e) => onSearchChange(e.target.value)}
							onFocus={() => onSearchFocusChange(true)}
							onBlur={() => onSearchFocusChange(false)}
							onKeyDown={onSearchKeyDown}
							aria-label="Search backlinks"
						/>
						{searchQuery && (
							<button
								type="button"
								className="influx-search-clear"
								onClick={() => onResetSearch(false)}
								aria-label="Clear search"
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="influx-svg-icon influx-svg-icon--clear">
									<line x1="18" y1="6" x2="6" y2="18"></line>
									<line x1="6" y1="6" x2="18" y2="18"></line>
								</svg>
							</button>
						)}
					</div>
				)}

				<ToolbarIconButton label="Cycle list limit" hoverLabel={listLimitHoverLabel} onClick={onCycleListLimit}>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="influx-svg-icon influx-svg-icon--list">
						<line x1="8" y1="6" x2="21" y2="6"></line>
						<line x1="8" y1="12" x2="21" y2="12"></line>
						<line x1="8" y1="18" x2="21" y2="18"></line>
						<line x1="3" y1="6" x2="3.01" y2="6"></line>
						<line x1="3" y1="12" x2="3.01" y2="12"></line>
						<line x1="3" y1="18" x2="3.01" y2="18"></line>
					</svg>
				</ToolbarIconButton>

				<ToolbarIconButton label="Change sort order" hoverLabel={sortHoverLabel} onClick={onToggleSortOrder}>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="influx-svg-icon influx-svg-icon--sort">
						<path d="M11 5h4"></path>
						<path d="M11 9h7"></path>
						<path d="M11 13h10"></path>
						<path d="m3 17 3 3 3-3"></path>
						<path d="M6 18V4"></path>
					</svg>
				</ToolbarIconButton>

				<ToolbarIconButton
					label={includeFrontmatterLinks ? 'Exclude frontmatter links' : 'Include frontmatter links'}
					hoverLabel={frontmatterHoverLabel}
					onClick={onToggleFrontmatterLinks}
					active={includeFrontmatterLinks}
					pressed={includeFrontmatterLinks}
				>
					{includeFrontmatterLinks ? (
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="influx-svg-icon influx-svg-icon--eye-on">
							<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
							<circle cx="12" cy="12" r="3"></circle>
						</svg>
					) : (
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="influx-svg-icon influx-svg-icon--eye-off">
							<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path>
							<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path>
							<path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path>
							<line x1="2" x2="22" y1="2" y2="22"></line>
						</svg>
					)}
				</ToolbarIconButton>
			</div>
		</div>
	);
}

export function InfluxResultGroup(props: {
	extended: ExtendedInlinkingFile;
	basenameCounts: Map<string, number>;
	searchQuery: string;
	collapsed: boolean;
	onToggleCollapse: (path: string) => void;
	centered: boolean;
	centeredTitleStyle: React.CSSProperties;
	settings: Partial<ObsidianInfluxSettings>;
	preview: boolean;
	renderMode: InfluxRenderMode;
	influxFileUuid: string;
}): React.ReactElement {
	const {
		extended,
		basenameCounts,
		searchQuery,
		collapsed,
		onToggleCollapse,
		centered,
		centeredTitleStyle,
		settings,
		preview,
		renderMode,
		influxFileUuid,
	} = props;

	const filePath = extended.sourcePath;
	const fileBasename = extended.inlinkingFile.file.basename;
	const collapseLabelId = React.useId();
	const collapseButtonLabel = collapsed ? `Expand ${fileBasename}` : `Collapse ${fileBasename}`;
	const matchDetails = getSearchMatchDetails(extended, searchQuery);
	const duplicateName = (basenameCounts.get(fileBasename) ?? 0) > 1;
	const sourcePathContext = duplicateName ? getSourcePathContext(filePath, fileBasename) : '';
	const safePathToken = filePath.replace(/[^a-zA-Z0-9_-]/g, '-');
	const matchesRegionId = `${influxFileUuid}-matches-${safePathToken}`;

	const entryHeader = settings.entryHeaderVisible && extended.titleText && !extended.inlinkingFile.isLinkInTitle ? (
		<h2>
			<span>{renderHighlightedText(extended.titleText, searchQuery)}</span>
		</h2>
	) : null;

	return (
		<div key={filePath} className={`influx-result-group ${collapsed ? 'influx-is-collapsed' : ''}${centered ? ' influx-result-group--split' : ''}`}>
			<div className="influx-result-head" style={centeredTitleStyle}>
				<button
					type="button"
					className="influx-collapse-toggle"
					onClick={() => onToggleCollapse(filePath)}
					aria-labelledby={collapseLabelId}
					aria-expanded={!collapsed}
					aria-controls={matchesRegionId}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="influx-svg-icon influx-svg-icon--collapse-chevron">
						<path d="M3 8L12 17L21 8"></path>
					</svg>
					<span id={collapseLabelId} className="influx-visually-hidden">
						{collapseButtonLabel}
					</span>
					<span className="influx-control-tooltip influx-control-tooltip--side" aria-hidden="true">
						{collapseButtonLabel}
					</span>
				</button>

				<div className="influx-result-source">
					<div className="influx-result-source-primary">
						<a data-href={filePath} href={filePath} className="internal-link influx-internal-link">
							{renderHighlightedText(fileBasename, searchQuery)}
						</a>
						{sourcePathContext && (
							<span className="influx-result-source-context">{sourcePathContext}</span>
						)}
					</div>
					{matchDetails && matchDetails.reasons.length > 0 && (
						<div className="influx-result-search-reasons">
							Matched in {matchDetails.reasons.join(', ')}
						</div>
					)}
				</div>
			</div>

			<div className="influx-result-body" id={matchesRegionId} hidden={collapsed} style={centered ? { flexGrow: 1 } : {}}>
				<div className="influx-entries">
					{entryHeader}
					<MarkdownMount
						markdown={extended.summaryMarkdown}
						sourcePath={extended.sourcePath}
						className={`influx-entry ${preview ? 'is-preview' : ''} influx-entry--${renderMode}`}
						mode={renderMode}
					/>
				</div>
			</div>
		</div>
	);
}

export function getCenteredTitleStyle(params: {
	centered: boolean;
	renderMode: InfluxRenderMode;
}): React.CSSProperties {
	if (!params.centered || params.renderMode === 'editor') {
		return {};
	}

	return {
		width: `min(${CONSTANTS.CENTERED_WIDTH_PX}px, 42vw)`,
		minWidth: '112px',
		maxWidth: '45%',
	};
}
