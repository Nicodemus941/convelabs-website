
import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";

const SettingsTab = () => {
  const { toast } = useToast();
  const [activeSettingsTab, setActiveSettingsTab] = useState("general");
  
  const [settings, setSettings] = useState({
    general: {
      companyName: "ConveLabs, Inc.",
      phoneNumber: "(310) 555-1234",
      supportEmail: "support@convelabs.com",
      billingEmail: "billing@convelabs.com",
      address: "123 Luxury Lane, Beverly Hills, CA 90210",
      timezone: "America/Los_Angeles"
    },
    notifications: {
      emailAppointmentConfirmation: true,
      emailAppointmentReminder: true,
      smsAppointmentReminder: true,
      emailLabResults: true,
      emailBillingNotification: true,
      dailyReports: false
    },
    security: {
      requireMfa: false,
      sessionTimeout: 30, // minutes
      passwordExpiryDays: 90,
      allowApiAccess: true,
      auditLogRetention: 365 // days
    }
  });
  
  const handleGeneralUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Settings Updated",
      description: "General settings have been saved",
    });
  };
  
  const handleNotificationToggle = (key: string) => {
    setSettings({
      ...settings,
      notifications: {
        ...settings.notifications,
        [key]: !settings.notifications[key as keyof typeof settings.notifications]
      }
    });
    
    toast({
      title: "Notification Setting Updated",
      description: `${key} setting has been updated`,
    });
  };
  
  const handleSecurityUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Security Settings Updated",
      description: "Your security changes have been saved",
    });
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform Settings</CardTitle>
        <CardDescription>Configure system-wide settings</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeSettingsTab} onValueChange={setActiveSettingsTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>
          
          <TabsContent value="general">
            <form onSubmit={handleGeneralUpdate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="companyName" className="block text-sm font-medium">
                    Company Name
                  </label>
                  <input
                    id="companyName"
                    type="text"
                    value={settings.general.companyName}
                    onChange={(e) => setSettings({
                      ...settings,
                      general: { ...settings.general, companyName: e.target.value }
                    })}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="phoneNumber" className="block text-sm font-medium">
                    Phone Number
                  </label>
                  <input
                    id="phoneNumber"
                    type="text"
                    value={settings.general.phoneNumber}
                    onChange={(e) => setSettings({
                      ...settings,
                      general: { ...settings.general, phoneNumber: e.target.value }
                    })}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="supportEmail" className="block text-sm font-medium">
                    Support Email
                  </label>
                  <input
                    id="supportEmail"
                    type="email"
                    value={settings.general.supportEmail}
                    onChange={(e) => setSettings({
                      ...settings,
                      general: { ...settings.general, supportEmail: e.target.value }
                    })}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="billingEmail" className="block text-sm font-medium">
                    Billing Email
                  </label>
                  <input
                    id="billingEmail"
                    type="email"
                    value={settings.general.billingEmail}
                    onChange={(e) => setSettings({
                      ...settings,
                      general: { ...settings.general, billingEmail: e.target.value }
                    })}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                
                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="address" className="block text-sm font-medium">
                    Company Address
                  </label>
                  <input
                    id="address"
                    type="text"
                    value={settings.general.address}
                    onChange={(e) => setSettings({
                      ...settings,
                      general: { ...settings.general, address: e.target.value }
                    })}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="timezone" className="block text-sm font-medium">
                    Timezone
                  </label>
                  <select
                    id="timezone"
                    value={settings.general.timezone}
                    onChange={(e) => setSettings({
                      ...settings,
                      general: { ...settings.general, timezone: e.target.value }
                    })}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/New_York">Eastern Time (ET)</option>
                  </select>
                </div>
              </div>
              
              <div className="flex justify-end">
                <button type="submit" className="luxury-button">
                  Save Changes
                </button>
              </div>
            </form>
          </TabsContent>
          
          <TabsContent value="notifications">
            <div className="space-y-6">
              <div className="space-y-4">
                {Object.entries(settings.notifications).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between border-b pb-4">
                    <div>
                      <h4 className="font-medium capitalize">
                        {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                      </h4>
                      <p className="text-sm text-gray-500">
                        {key.includes('email') 
                          ? 'Send email notifications for this event' 
                          : 'Send SMS notifications for this event'}
                      </p>
                    </div>
                    <Switch 
                      checked={value} 
                      onCheckedChange={() => handleNotificationToggle(key)}
                    />
                  </div>
                ))}
              </div>
              
              <div className="mt-6 flex justify-end">
                <button className="luxury-button">
                  Test Notifications
                </button>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="security">
            <form onSubmit={handleSecurityUpdate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="requireMfa" className="block text-sm font-medium">
                      Require Two-Factor Authentication
                    </label>
                    <Switch 
                      id="requireMfa"
                      checked={settings.security.requireMfa}
                      onCheckedChange={(checked) => setSettings({
                        ...settings,
                        security: { ...settings.security, requireMfa: checked }
                      })}
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Staff members will be required to set up 2FA
                  </p>
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="sessionTimeout" className="block text-sm font-medium">
                    Session Timeout (minutes)
                  </label>
                  <input
                    id="sessionTimeout"
                    type="number"
                    value={settings.security.sessionTimeout}
                    onChange={(e) => setSettings({
                      ...settings,
                      security: { ...settings.security, sessionTimeout: parseInt(e.target.value) }
                    })}
                    className="w-full px-3 py-2 border rounded-md"
                    min="5"
                    max="120"
                  />
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="passwordExpiryDays" className="block text-sm font-medium">
                    Password Expiry (days)
                  </label>
                  <input
                    id="passwordExpiryDays"
                    type="number"
                    value={settings.security.passwordExpiryDays}
                    onChange={(e) => setSettings({
                      ...settings,
                      security: { ...settings.security, passwordExpiryDays: parseInt(e.target.value) }
                    })}
                    className="w-full px-3 py-2 border rounded-md"
                    min="30"
                    max="365"
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="allowApiAccess" className="block text-sm font-medium">
                      Allow API Access
                    </label>
                    <Switch 
                      id="allowApiAccess"
                      checked={settings.security.allowApiAccess}
                      onCheckedChange={(checked) => setSettings({
                        ...settings,
                        security: { ...settings.security, allowApiAccess: checked }
                      })}
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Enable API access for third-party integrations
                  </p>
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="auditLogRetention" className="block text-sm font-medium">
                    Audit Log Retention (days)
                  </label>
                  <input
                    id="auditLogRetention"
                    type="number"
                    value={settings.security.auditLogRetention}
                    onChange={(e) => setSettings({
                      ...settings,
                      security: { ...settings.security, auditLogRetention: parseInt(e.target.value) }
                    })}
                    className="w-full px-3 py-2 border rounded-md"
                    min="30"
                    max="730"
                  />
                </div>
              </div>
              
              <div className="mt-6 flex justify-end">
                <button type="submit" className="luxury-button">
                  Save Security Settings
                </button>
              </div>
            </form>
          </TabsContent>
          
          <TabsContent value="billing">
            <div className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-md">
                <h3 className="font-medium text-amber-800">Billing Settings</h3>
                <p className="text-sm text-amber-700 mt-1">
                  Please contact your account manager to update billing settings.
                </p>
              </div>
              
              <div className="bg-gray-50 p-4 border rounded-md">
                <h3 className="font-medium">Current Plan</h3>
                <div className="mt-2">
                  <p className="text-lg font-bold text-conve-red">Enterprise Plan</p>
                  <p className="text-sm text-gray-500">Unlimited users, premium support</p>
                </div>
                
                <div className="mt-4">
                  <h4 className="font-medium text-sm">Billing Contact</h4>
                  <p className="text-sm">Finance Department</p>
                  <p className="text-sm">billing@convelabs.com</p>
                </div>
                
                <div className="mt-4">
                  <h4 className="font-medium text-sm">Payment Method</h4>
                  <p className="text-sm">ACH Transfer (Monthly)</p>
                </div>
              </div>
              
              <div className="mt-6 flex justify-end gap-4">
                <button className="luxury-button-outline">
                  Download Invoices
                </button>
                <button className="luxury-button">
                  Contact Billing Support
                </button>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="integrations">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border rounded-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">Stripe</h3>
                      <p className="text-sm text-gray-500">Payment processing</p>
                    </div>
                    <div className="flex items-center">
                      <div className="h-2 w-2 rounded-full bg-green-500 mr-2"></div>
                      <span className="text-xs text-green-600 font-medium">Connected</span>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button className="text-sm text-conve-red hover:underline">
                      Configure
                    </button>
                  </div>
                </div>
                
                <div className="p-4 border rounded-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">Twilio</h3>
                      <p className="text-sm text-gray-500">SMS notifications</p>
                    </div>
                    <div className="flex items-center">
                      <div className="h-2 w-2 rounded-full bg-green-500 mr-2"></div>
                      <span className="text-xs text-green-600 font-medium">Connected</span>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button className="text-sm text-conve-red hover:underline">
                      Configure
                    </button>
                  </div>
                </div>
                
                <div className="p-4 border rounded-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">SendGrid</h3>
                      <p className="text-sm text-gray-500">Email service provider</p>
                    </div>
                    <div className="flex items-center">
                      <div className="h-2 w-2 rounded-full bg-green-500 mr-2"></div>
                      <span className="text-xs text-green-600 font-medium">Connected</span>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button className="text-sm text-conve-red hover:underline">
                      Configure
                    </button>
                  </div>
                </div>
                
                <div className="p-4 border rounded-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">Google Calendar</h3>
                      <p className="text-sm text-gray-500">Appointment scheduling</p>
                    </div>
                    <div className="flex items-center">
                      <div className="h-2 w-2 rounded-full bg-amber-500 mr-2"></div>
                      <span className="text-xs text-amber-600 font-medium">Not Connected</span>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button className="text-sm text-conve-red hover:underline">
                      Connect
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 flex justify-end">
                <button className="luxury-button">
                  Add New Integration
                </button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default SettingsTab;
