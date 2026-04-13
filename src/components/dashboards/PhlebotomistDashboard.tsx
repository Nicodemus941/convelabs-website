import React, { Component, ErrorInfo } from 'react';
import PhlebDashboardShell from '@/components/phleb-dashboard/PhlebDashboardShell';

// Error boundary to prevent blank screen on mobile
class PhlebErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Phlebotomist Dashboard Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">!</span>
            </div>
            <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground text-sm mb-4">{this.state.error}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-[#B91C1C] text-white px-6 py-2 rounded-lg font-medium"
            >
              Reload Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const PhlebotomistDashboard: React.FC = () => {
  return (
    <PhlebErrorBoundary>
      <PhlebDashboardShell />
    </PhlebErrorBoundary>
  );
};

export default PhlebotomistDashboard;
