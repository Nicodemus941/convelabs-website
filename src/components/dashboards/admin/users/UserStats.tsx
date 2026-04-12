
import React from "react";

interface UserStatsProps {
  filteredCount: number;
  totalCount: number;
}

const UserStats: React.FC<UserStatsProps> = ({ filteredCount, totalCount }) => {
  return (
    <div className="flex justify-between items-center mt-4">
      <span className="text-sm text-gray-600">
        Showing {filteredCount} of {totalCount} users
      </span>
    </div>
  );
};

export default UserStats;
