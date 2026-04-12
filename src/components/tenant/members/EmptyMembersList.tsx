
import React from 'react';
import { UserPlus } from 'lucide-react';

const EmptyMembersList: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="bg-primary/10 p-3 rounded-full mb-4">
        <UserPlus className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-medium mb-1">No team members yet</h3>
      <p className="text-muted-foreground text-sm max-w-sm">
        Your organization needs team members. Click the "Add Member" button to invite someone to join your team.
      </p>
    </div>
  );
};

export default EmptyMembersList;
