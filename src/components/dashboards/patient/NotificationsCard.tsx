
import React from "react";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, FileText } from "lucide-react";

const NotificationsCard = () => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Notifications</CardTitle>
        <Button variant="ghost" size="sm" className="flex gap-1 items-center">
          <Bell className="h-4 w-4" /> Settings
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-start gap-4 pb-4 border-b">
            <div className="bg-blue-50 p-2 rounded">
              <Bell className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h4 className="font-medium">Membership Active</h4>
              <p className="text-sm text-muted-foreground">
                Your membership is active and ready to use. Book your first appointment today.
              </p>
              <p className="text-xs text-muted-foreground mt-1">2 days ago</p>
            </div>
          </div>
          
          <div className="flex items-start gap-4">
            <div className="bg-green-50 p-2 rounded">
              <FileText className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <h4 className="font-medium">Welcome to ConveLabs</h4>
              <p className="text-sm text-muted-foreground">
                Thank you for joining ConveLabs. We're excited to help you manage your health.
              </p>
              <p className="text-xs text-muted-foreground mt-1">3 days ago</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default NotificationsCard;
