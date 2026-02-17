import { CONSTANTS } from '../constants';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogContext { [key: string]: any; }

class Logger {
	private prefix = '[Influx]';

	debug(msg: string, ctx?: LogContext) {
		if (CONSTANTS.DEBUG_MODE) {
			console.debug(this.fmt('debug', msg), ctx);
		}
	}

	info(msg: string, ctx?: LogContext) {
		console.info(this.fmt('info', msg), ctx);
	}

	warn(msg: string, ctx?: LogContext) {
		console.warn(this.fmt('warn', msg), ctx);
	}

	error(msg: string, ctx?: LogContext) {
		console.error(this.fmt('error', msg), ctx);
	}

	private fmt(level: LogLevel, msg: string): string {
		return `${this.prefix} [${level.toUpperCase()}] ${msg}`;
	}
}

export const logger = new Logger();
