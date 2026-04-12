
import React, { useState } from 'react';
import { Bell, Check, CheckCheck, X, AlertCircle, Calendar, Package, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Notification, NotificationType, useNotifications } from '@/contexts/NotificationsContext';

const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case 'appointment':
      return <Calendar className="h-4 w-4" />;
    case 'equipment':
      return <Package className="h-4 w-4" />;
    case 'patient':
      return <User className="h-4 w-4" />;
    case 'system':
    default:
      return <AlertCircle className="h-4 w-4" />;
  }
};

const getPriorityColor = (priority: 'low' | 'medium' | 'high') => {
  switch (priority) {
    case 'high':
      return 'bg-red-100 text-red-800';
    case 'medium':
      return 'bg-amber-100 text-amber-800';
    case 'low':
    default:
      return 'bg-blue-100 text-blue-800';
  }
};

export const NotificationCenter = () => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotifications } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Bell className="h-[1.2rem] w-[1.2rem]" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 bg-red-500 text-white" 
              variant="destructive"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Notifications</h2>
          <div className="flex gap-1">
            {notifications.length > 0 && (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={markAllAsRead} 
                  className="h-8 px-2 text-xs"
                >
                  <CheckCheck className="h-3 w-3 mr-1" /> Mark all read
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearNotifications} 
                  className="h-8 px-2 text-xs"
                >
                  <X className="h-3 w-3 mr-1" /> Clear all
                </Button>
              </>
            )}
          </div>
        </div>

        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <Bell className="h-8 w-8 text-muted-foreground mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">You have no notifications</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 transition-colors ${notification.read ? 'bg-white' : 'bg-blue-50'}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex gap-3">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${getPriorityColor(notification.priority)}`}>
                        {getNotificationIcon(notification.type)}
                      </span>
                      
                      <div>
                        <h3 className="text-sm font-medium">{notification.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
                        <time className="text-xs text-muted-foreground mt-1 block">
                          {new Date(notification.timestamp).toLocaleTimeString()}
                        </time>
                      </div>
                    </div>
                    
                    {!notification.read && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6" 
                        onClick={() => markAsRead(notification.id)}
                      >
                        <Check className="h-3 w-3" />
                        <span className="sr-only">Mark as read</span>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
