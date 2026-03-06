import { isDebugMode } from './debug-mode';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogContext {
	[key: string]: string | number | boolean | unknown;
}

class Logger {
	private prefix = '[Influx]';

	private emit(method: 'debug' | 'info' | 'warn' | 'error', line: string, ctx?: LogContext): void {
		if (ctx === undefined) {
			console[method](line);
			return;
		}
		console[method](line, ctx);
	}

	debug(msg: string, ctx?: LogContext) {
		if (isDebugMode()) {
			this.emit('debug', this.fmt('debug', msg), ctx);
		}
	}

	info(msg: string, ctx?: LogContext) {
		this.emit('info', this.fmt('info', msg), ctx);
	}

	warn(msg: string, ctx?: LogContext) {
		this.emit('warn', this.fmt('warn', msg), ctx);
	}

	error(msg: string, ctx?: LogContext) {
		this.emit('error', this.fmt('error', msg), ctx);
	}

	private fmt(level: LogLevel, msg: string): string {
		return `${this.prefix} [${level.toUpperCase()}] ${msg}`;
	}
}

export const logger = new Logger();
