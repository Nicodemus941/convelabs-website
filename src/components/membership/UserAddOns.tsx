
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useUserAddOns } from '@/hooks/useUserAddOns';
import { Button } from '@/components/ui/button';
import { Clock, Calendar, Zap, Star } from 'lucide-react';

interface UserAddOnsProps {
  showManagement?: boolean;
}

const UserAddOns: React.FC<UserAddOnsProps> = ({ showManagement = false }) => {
  const { userAddOns, isLoading, removeAddOn } = useUserAddOns();

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Your Add-On Benefits</CardTitle>
          <CardDescription>Loading your add-ons...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!userAddOns || userAddOns.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Your Add-On Benefits</CardTitle>
          <CardDescription>You don't have any add-ons yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Add-ons allow you to customize your membership with premium services like VIP hours,
            weekend access, and more.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Helper function to get icon for add-on
  const getAddOnIcon = (name: string) => {
    if (name.toLowerCase().includes('vip')) {
      return <Clock className="h-5 w-5 text-purple-500" />;
    } else if (name.toLowerCase().includes('weekend')) {
      return <Calendar className="h-5 w-5 text-indigo-500" />;
    } else if (name.toLowerCase().includes('same-day')) {
      return <Zap className="h-5 w-5 text-amber-500" />;
    } else {
      return <Clock className="h-5 w-5 text-blue-500" />;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Your Add-On Benefits</CardTitle>
        <CardDescription>
          These premium services are available with your membership
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {userAddOns.map(addon => (
            <li 
              key={addon.id} 
              className="flex items-start space-x-3 border rounded-lg p-4 bg-gray-50"
            >
              <div className="flex-shrink-0 mt-0.5">
                {getAddOnIcon(addon.add_on_details?.name || '')}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">{addon.add_on_details?.name || 'Add-On Service'}</h4>
                  {addon.is_supernova_benefit && (
                    <Badge className="bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center gap-1">
                      <Star className="h-3 w-3 fill-white" />
                      <span>Supernova Benefit</span>
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {addon.add_on_details?.description || 'Premium membership service'}
                </p>
                {showManagement && !addon.is_supernova_benefit && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2"
                    onClick={() => removeAddOn.mutate(addon.add_on_id)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

export default UserAddOns;
