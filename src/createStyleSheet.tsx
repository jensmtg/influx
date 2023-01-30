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

                },

                inlinkedEntries: {
                    fontSize: `${props.fontSize}px`,
                    lineHeight: `${props.lineHeight}px`,
                    width: '100%',
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    paddingLeft: '1rem',
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
                    '& mark': {
                        backgroundColor: 'var(--text-highlight-bg)',
                    },
                },

                inlinkedEntry: {


                    '--checkbox-size': `${props.fontSize}px`,

                    paddingBottom: !props.preview ? `${props.lineHeight}px !important` : '',

                    '& input[type=checkbox]': {
                        marginTop: `-${props.lineHeight}px`,
                    },

                    '& *': {
                        marginBlockEnd: !props.preview ? `-${props.lineHeight}px !important` : '',
                    },
                    '& li:nth-child(1)': {
                        marginBlockStart: !props.preview ? `-${props.lineHeight}px !important` : '',
                    },

                    '& ul': {
                        marginTop: `${0}px`,
                        paddingInlineStart: `${20}px`,

                    },

                    '& p': {
                        paddingInlineStart: `${0}px`,
                        marginBlockStart: `auto`,
                    },

                    '& li p': {
                        marginBlockStart: !props.preview ? `-${props.lineHeight}px !important` : '',
                    },

                    '& blockquote': {
                        borderLeft: 'var(--blockquote-border-thickness) solid',
                        borderLeftColor: 'var(--blockquote-border-color)',
                        marginBlockStart: 0,
                        paddingInlineStart: `${props.lineHeight/2}px`,
                        marginInlineStart: 0,
                        marginInlineEnd: 0,
                        '& p': {
                            marginBlockStart: !props.preview ? `-${props.lineHeight}px !important` : '',
                        },
                    },

                    '& .callout': {
                        marginTop: '6px !important',
                        marginBottom: '0 !important',
                        marginLeft: '1em !important',
                        marginRight: '1em !important',
                        paddingTop: 'var(--size-4-1)',
                        paddingBottom: 'var(--size-4-1)',
                        paddingRight: 'var(--size-4-1)',
                        paddingLeft: 'var(--size-4-2)',
                        marginBlockEnd: !props.preview ? `-${props.lineHeight}px !important` : '',
                        //  // marginBlockEnd: '0px !important',
                        //  '& ul': {
                        //     paddingInlineStart: `${0}px`,
                        // },
                    },
                    '& .callout > *': {
                       //  margin: '4px',
                         marginBlockEnd: '0px !important',
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
                    '& span[class=lc-li-wrapper]': {
                        marginBlockEnd: `${0}px !important`,
                    },

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







