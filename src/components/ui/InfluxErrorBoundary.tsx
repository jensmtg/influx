import * as React from 'react';
import { logger } from '../../utils/logger';

interface Props {
	children: React.ReactNode;
	fallback?: React.ReactNode;
}

interface State {
	hasError: boolean;
	error?: Error;
}

export class InfluxErrorBoundary extends React.Component<Props, State> {
	state: State = { hasError: false };

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		logger.error('React component error', { 
			error, 
			componentStack: errorInfo.componentStack 
		});
	}

	render() {
		if (this.state.hasError) {
			return this.props.fallback || (
				<div className="influx-error" style={{ 
					padding: '1rem', 
					color: 'var(--text-error)' 
				}}>
					Failed to render Influx component. Check console for details.
				</div>
			);
		}

		return this.props.children;
	}
}
