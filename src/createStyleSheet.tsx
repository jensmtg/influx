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
                },

                inlinkedEntry: {
                    // paddingLeft: '8px',
                    // marginLeft: '8px',
                    paddingBottom: `${props.lineHeight}px !important`,
                    '& input[type=checkbox]': {
                        width: `${props.fontSize}px`,
                        height: `${props.fontSize}px`,
                        marginTop: `-${props.margin + props.lineHeight/2}px`,
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







