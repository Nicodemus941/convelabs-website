
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, Calendar, FileText, AlertTriangle } from "lucide-react";

interface Notification {
  id: string;
  type: "appointment" | "result" | "alert";
  title: string;
  description: string;
  date: string;
  read: boolean;
}

const NotificationsPanel = () => {
  const notifications: Notification[] = [
    {
      id: "notif-1",
      type: "appointment",
      title: "New appointment scheduled",
      description: "Emily Clark has a lab draw scheduled for tomorrow at 9:00 AM",
      date: "Today",
      read: false
    },
    {
      id: "notif-2",
      type: "result",
      title: "Lab results ready",
      description: "Michael Brown's CBC results are ready for review",
      date: "Today",
      read: false
    },
    {
      id: "notif-3",
      type: "alert",
      title: "Abnormal lab value",
      description: "Sarah Miller has an abnormal TSH level in her latest results",
      date: "Yesterday",
      read: true
    },
    {
      id: "notif-4",
      type: "appointment",
      title: "Appointment reminder sent",
      description: "Reminder sent to Robert Chen for tomorrow's appointment",
      date: "Yesterday",
      read: true
    },
  ];

  return (
    <div className="mb-8">
      <h3 className="text-lg font-medium mb-4">Notification Center</h3>
      <Card>
        <CardContent className="p-4">
          <div className="space-y-4">
            {notifications.map((notification) => (
              <div 
                key={notification.id}
                className={`flex gap-3 p-3 rounded-lg border ${notification.read ? "opacity-70" : "bg-muted/20"}`}
              >
                <div className="flex-shrink-0">
                  {notification.type === "appointment" && <Calendar className="h-5 w-5 text-blue-500" />}
                  {notification.type === "result" && <FileText className="h-5 w-5 text-green-500" />}
                  {notification.type === "alert" && <AlertTriangle className="h-5 w-5 text-red-500" />}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">{notification.title}</p>
                  <p className="text-sm text-muted-foreground">{notification.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">{notification.date}</p>
                </div>
                {!notification.read && (
                  <div className="flex-shrink-0">
                    <span className="bg-conve-red w-2 h-2 rounded-full block"></span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NotificationsPanel;
