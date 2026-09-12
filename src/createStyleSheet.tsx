import jss, { StyleSheet } from 'jss'
import preset from 'jss-preset-default'
import type { ObsidianInfluxSettings } from "./main";
import type { ApiAdapter } from './apiAdapter';

interface StyleProps {
    theme: string;
    centered: boolean;
    margin: number;
    fontSize: number;
    lineHeight: number;
    largeFontSize: number;
    largeLineHeight: number;
    preview: boolean;
}

export type StyleSheetType = StyleSheet<
    "inlinkedEntries"
    | "inlinkedEntry"
    | "influxComponent"
>

export function createStyleSheet(api: ApiAdapter, preview=false) {

    const settings: Partial<ObsidianInfluxSettings> = api.getSettings()

    const sizing = settings.fontSize || 13
    const centered = settings.variant !== 'ROWS'

    const props: StyleProps = {
        theme: '',
        centered: centered,
        margin: sizing,
        fontSize: sizing,
        lineHeight: sizing + sizing / 2,
        largeFontSize: sizing, // sizing + 2,
        largeLineHeight: sizing + sizing / 2, // sizing + 4,
        preview: preview,
    }


    jss.setup(preset())

    const sheet = jss
        .createStyleSheet(
            {         

                influxComponent: {
                    marginTop: `3em`, //--line-height-normal is 1.5
                    // Rendered Markdown must not inherit CodeMirror's pre-wrap.
                    whiteSpace: 'normal',
                    // animation: 'fadeIn .6s',

                    // Obsidian's generic backlink UI expands these wrappers to
                    // fill a flex parent. Influx is document content, so it must
                    // instead stay sized to the rendered backlink list.
                    '& .backlink-pane': {
                        flex: '0 0 auto',
                    },
                    '& .search-result-container': {
                        flex: '0 0 auto',
                    },
                    '& .search-result-file-matches': {
                        minWidth: 0,
                    },

                },

                inlinkedEntries: {
                    fontSize: `${props.fontSize}px`,
                    lineHeight: `${props.lineHeight}px`,
                    width: '100%',
                    maxWidth: '100%',
                    minWidth: 0,
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    // Keep every edge of the excerpt clear of the mention border.
                    padding: 'var(--size-4-3, 12px) var(--size-4-4, 16px)',
                    '& h1': {
                        marginTop: '0px',
                        marginBottom: '0px',
                        fontSize: `${props.fontSize}px`,
                        lineHeight: `${props.lineHeight}px`,
                    },
                    '& h2': {
                        marginTop: '0px',
                        marginBottom: '0px',
                        fontSize: `${props.fontSize}px`,
                        lineHeight: `${props.lineHeight}px`,
                    },
                    '& h3': {
                        fontSize: `${props.fontSize}px`,
                        lineHeight: `${props.lineHeight}px`,
                    },
                    '& > h2': {
                        marginBottom: 'var(--size-4-1, 4px)',
                    },
                    '& mark': {
                        backgroundColor: 'var(--text-highlight-bg)',
                    },
                },

                inlinkedEntry: {


                    '--checkbox-size': `${props.fontSize}px`,
                    '--font-text-size': `${props.fontSize}px`,
                    '--line-height-normal': `${props.lineHeight / props.fontSize}`,
                    minWidth: 0,
                    overflowX: 'auto',

                    '& input[type=checkbox]': {
                        marginBlock: 0,
                        marginInlineEnd: '0.5em',
                        verticalAlign: 'middle',
                        top: 0,
                    },

                    '& li': {
                        marginBlock: 0,
                    },

                    '& ul, & ol': {
                        marginBlock: 0,
                    },

                    '& p, & blockquote': {
                        marginBlockStart: 0,
                        marginBlockEnd: '0.5em',
                    },

                    '& > :first-child': {
                        marginBlockStart: 0,
                    },

                    '& > :last-child, & li > p:last-child, & blockquote > :last-child': {
                        marginBlockEnd: 0,
                    },

                    '& blockquote': {
                        borderLeft: 'var(--blockquote-border-thickness) solid',
                        borderLeftColor: 'var(--blockquote-border-color)',
                        marginBlockStart: 0,
                        paddingInlineStart: `${props.lineHeight/2}px`,
                        marginInlineStart: 0,
                        marginInlineEnd: 0,
                    },

                    '& .callout': {
                        marginTop: '6px !important',
                       // marginBottom: '0px !important',
                        marginLeft: '1em !important',
                        marginRight: '1em !important',
                        paddingTop: 'var(--size-4-1)',
                        paddingBottom: 'var(--size-4-1)',
                        paddingRight: 'var(--size-4-1)',
                        paddingLeft: 'var(--size-4-2)',

                    },

                    '&> .callout': {
                        marginLeft: '0px !important',
                    },
 
                    '& .callout-icon': {
                        width: 0,
                    },  

                    '& span[data-callout-title]': {
                        backgroundColor: 'rgba(var(--callout-color), 0.1)',
                        borderRadius: '4px',
                        paddingLeft: '3px',
                        paddingRight: '3px',
                        paddingTop: '1px',
                        paddingBottom: '1px',
                        borderLeftWidth: '3px',
                        borderTopLeftRadius: '2px',
                        borderBottomLeftRadius: '2px',
                        '& span[data-callout-title-text]': {
                            color: 'rgba(var(--callout-color), 0.9)',
                            
                        },
                    },

                    // Fix for list callouts bug; https://github.com/jensmtg/influx/issues/20
                    // '& span[class=lc-li-wrapper]': {
                    //     marginBlockEnd: `${0}px !important`,
                    // },

                    // Fix for minimal theme bugs; https://github.com/jensmtg/influx/issues/30
                    '& a[class=tag]': {
                        verticalAlign: 'unset !important',
                    },

                    

                }
            }
        )
        .attach()

    return sheet

}




