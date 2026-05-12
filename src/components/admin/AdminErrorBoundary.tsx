/**
 * AdminErrorBoundary — wraps admin surfaces that historically rendered
 * blank on unexpected data shapes (Naquala 2026-05-12: clicked an
 * appointment on the calendar → screen went blank).
 *
 * Without a boundary, a throw in any child unmounts the entire React
 * tree from the nearest root, leaving the admin staring at a white page
 * with no recovery path. This catches the throw, shows a clear error
 * with the stack so we can fix it, and exposes a "Try again" + "Copy
 * error" button so admin isn't stuck.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Copy } from 'lucide-react';

interface Props {
  children: ReactNode;
  surface?: string; // human-readable name shown in the error UI ("Appointment details", "Lab Orders", etc.)
  onRetry?: () => void; // optional — calls this on click of Try Again instead of just resetting state
}

interface State { hasError: boolean; error: Error | null; info: ErrorInfo | null }

class AdminErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AdminErrorBoundary]', this.props.surface || 'unknown surface', error, info);
    this.setState({ info });
  }

  reset = () => {
    this.setState({ hasError: false, error: null, info: null });
    this.props.onRetry?.();
  };

  copyError = () => {
    const { error, info } = this.state;
    const text = [
      `Surface: ${this.props.surface || 'unknown'}`,
      `Error: ${error?.name || ''} — ${error?.message || ''}`,
      `Stack:\n${error?.stack || '(no stack)'}`,
      `Component stack:\n${info?.componentStack || '(no component stack)'}`,
    ].join('\n');
    try { navigator.clipboard.writeText(text); } catch { /* noop */ }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const err = this.state.error;
    return (
      <Card className="border-red-300 bg-red-50/50 m-3">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-900">
                {this.props.surface || 'This view'} hit an error
              </p>
              <p className="text-xs text-red-700 mt-1 break-words">
                {err?.message || 'Unknown error'}
              </p>
              <details className="mt-2">
                <summary className="text-[11px] text-red-600 cursor-pointer hover:underline">Show technical details</summary>
                <pre className="text-[10px] text-red-800 bg-white border border-red-200 rounded p-2 mt-1 overflow-auto max-h-40">
                  {err?.stack || '(no stack)'}
                </pre>
              </details>
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={this.reset}>
                  <RefreshCw className="h-3 w-3" /> Try again
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={this.copyError}>
                  <Copy className="h-3 w-3" /> Copy error
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
}

export default AdminErrorBoundary;
