
import React from 'react';

const LoadingState: React.FC = () => {
  return (
    <div className="flex justify-center items-center min-h-[400px]">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading your account...</p>
      </div>
    </div>
  );
};

export default LoadingState;
