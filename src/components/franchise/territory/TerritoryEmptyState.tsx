
import React from "react";

const TerritoryEmptyState: React.FC = () => {
  return (
    <div className="text-center py-8">
      <p className="text-muted-foreground">No performance data available for this territory.</p>
      <p className="text-sm text-muted-foreground mt-1">Data will appear once services are completed in this territory.</p>
    </div>
  );
};

export default TerritoryEmptyState;
