
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Users } from 'lucide-react';

const StaffManagement: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Users className="mr-2 h-5 w-5" />
          Staff Management
        </CardTitle>
        <CardDescription>
          Manage your staff and team members
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button className="flex items-center">
              <Plus className="mr-2 h-4 w-4" /> Add Staff Member
            </Button>
          </div>
          
          <div className="text-center py-8 text-muted-foreground">
            <p>No staff members have been added yet</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default StaffManagement;
