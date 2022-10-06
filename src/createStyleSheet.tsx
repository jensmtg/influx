import jss, { StyleSheet } from 'jss'
import preset from 'jss-preset-default'
import { ObsidianInfluxSettings } from "./main";
import { ApiAdapter } from './apiAdapter';

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
    "root"
    | "openerButton"
    | "inlinked"
    | "inlinkedMetaDiv"
    | "inlinkedEntries"
    | "inlinkedEntry"
>

export function createStyleSheet(api: ApiAdapter) {

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
        preview: false,
    }


    jss.setup(preset())

    const sheet = jss
        .createStyleSheet(
            {
                root: {
                    //border: '1px solid pink',
                    fontSize: `${props.fontSize}px`,
                    lineHeight: `${props.lineHeight}px`,
                    padding: '8px',
                    paddingRight: '0',
                    maxWidth: !props.preview ? `calc(var(--line-width-adaptive) - var(--folding-offset))` : '',
                    marginLeft: !props.preview ? `max(calc(50% + var(--folding-offset) - var(--line-width-adaptive)/ 2),calc(50% + var(--folding-offset) - var(--max-width)/ 2)) !important` : '',
                    display: 'flex',
                    flexDirection: 'column',
                    '& h2': {
                        fontSize: `${props.largeFontSize}px`,
                        lineHeight: `${props.largeLineHeight}px`,
                    },
                    '& h3': {
                        fontSize: `${props.fontSize}px`,
                        lineHeight: `${props.lineHeight}px`,
                        textTransform: 'uppercase',
                        letterSpacing: '2px',
                        margin: 0,
                        color: 'lightsteelblue',
                    },
                },

                openerButton: {
                    marginRight: `${props.fontSize}px`,
                    cursor: 'pointer',
                },

                inlinked: {
                    display: 'flex',
                    marginTop: `${props.margin}px`,
                    marginBottom: props.centered ? `${props.margin}px` : '',
                    flexDirection: props.centered ? 'row' : 'column',
                },

                inlinkedMetaDiv: props.centered ? {
                    width: '160px',
                    minWidth: '160px',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRight: '1px dashed lightsteelblue',
                    paddingRight: '1rem',
                } : {
                    borderTop: '1px dashed lightsteelblue',
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    // backgroundColor: '#fafafa'
                },

                inlinkedEntries: {
                    width: '100%',
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    paddingLeft: '1rem',
                    '& h2': {
                        marginTop: '9px',
                        marginBottom: '9px',

                    }
                },

                inlinkedEntry: {
                    paddingLeft: '8px',
                    marginLeft: '8px',
                    paddingBottom: `${props.lineHeight}px !important`,
                    '& input[type=checkbox]': {
                        width: `${props.fontSize}px`,
                        height: `${props.fontSize}px`,
                        marginTop: `-${props.margin + 2}px`,
                    },
                    '& *': {
                        marginBlockEnd: !props.preview ? `-${props.lineHeight}px !important` : '',
                    },
                    '& li:nth-child(1)': {
                        marginBlockStart: !props.preview ? `-${props.lineHeight}px !important` : '',
                    },
                    '&> ul': {
                        marginTop: `${0}px`,
                    },
                    // Fix for list callouts bug; https://github.com/jensmtg/influx/issues/20
                    '& span[class=lc-li-wrapper]': {
                        marginBlockEnd: `${0}px !important`,
                    },

                    '& span[data-callout-title]': {
                        backgroundColor: 'rgba(var(--callout-color), 0.1)',
                        borderRadius: '4px',
                        paddingLeft: '3px',
                        paddingRight: '3px',
                        borderLeftWidth: '3px',
                        borderTopLeftRadius: '2px',
                        borderBottomLeftRadius: '2px',
                        '& span[data-callout-title-text]': {
                            color: 'rgba(var(--callout-color), 0.9)',
                            
                        },
                    },
                }
            }
        )
        .attach()

    return sheet

}







