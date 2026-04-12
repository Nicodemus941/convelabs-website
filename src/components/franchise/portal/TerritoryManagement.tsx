
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, MapPin } from 'lucide-react';

const TerritoryManagement: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <MapPin className="mr-2 h-5 w-5" />
          Territory Management
        </CardTitle>
        <CardDescription>
          Manage your territories and geographic coverage
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button className="flex items-center">
              <Plus className="mr-2 h-4 w-4" /> Add Territory
            </Button>
          </div>
          
          <div className="text-center py-8 text-muted-foreground">
            <p>Select a territory from the list above to manage it</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TerritoryManagement;
