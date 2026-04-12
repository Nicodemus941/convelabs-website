
import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const AccountSettingsTab = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Settings</CardTitle>
        <CardDescription>Manage your account information and preferences</CardDescription>
      </CardHeader>
      <CardContent className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-medium text-lg mb-4">Personal Information</h3>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <label className="text-sm font-medium">Full Name</label>
                <div className="flex justify-between items-center">
                  <div>Dr. James Wilson</div>
                  <Button variant="link" className="text-conve-red p-0 h-auto">
                    Edit
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <div className="flex justify-between items-center">
                  <div>dr.wilson@example.com</div>
                  <Button variant="link" className="text-conve-red p-0 h-auto">
                    Edit
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Phone</label>
                <div className="flex justify-between items-center">
                  <div>(555) 123-4567</div>
                  <Button variant="link" className="text-conve-red p-0 h-auto">
                    Edit
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">License Number</label>
                <div className="flex justify-between items-center">
                  <div>MD123456</div>
                  <Button variant="link" className="text-conve-red p-0 h-auto">
                    Edit
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <h3 className="font-medium text-lg mt-8 mb-4">Security</h3>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <label className="text-sm font-medium">Password</label>
                <div className="flex justify-between items-center">
                  <div>••••••••••</div>
                  <Button variant="link" className="text-conve-red p-0 h-auto">
                    Change
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Two-Factor Authentication</label>
                <div className="flex justify-between items-center">
                  <div className="text-green-600 font-medium">Enabled</div>
                  <Button variant="link" className="text-conve-red p-0 h-auto">
                    Configure
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div>
          <h3 className="font-medium text-lg mb-4">Practice Information</h3>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <label className="text-sm font-medium">Practice Name</label>
                <div className="flex justify-between items-center">
                  <div>Wilson Family Medicine</div>
                  <Button variant="link" className="text-conve-red p-0 h-auto">
                    Edit
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Address</label>
                <div className="flex justify-between items-center">
                  <div>123 Medical Blvd, Orlando, FL 32801</div>
                  <Button variant="link" className="text-conve-red p-0 h-auto">
                    Edit
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Office Phone</label>
                <div className="flex justify-between items-center">
                  <div>(555) 987-6543</div>
                  <Button variant="link" className="text-conve-red p-0 h-auto">
                    Edit
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Tax ID</label>
                <div className="flex justify-between items-center">
                  <div>XX-XXXXXXX</div>
                  <Button variant="link" className="text-conve-red p-0 h-auto">
                    Edit
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <h3 className="font-medium text-lg mt-8 mb-4">Notification Preferences</h3>
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Email notifications</label>
                  <div className="flex items-center h-5">
                    <input type="checkbox" className="w-4 h-4 text-conve-red border-gray-300 rounded focus:ring-conve-red" defaultChecked />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">SMS notifications</label>
                  <div className="flex items-center h-5">
                    <input type="checkbox" className="w-4 h-4 text-conve-red border-gray-300 rounded focus:ring-conve-red" defaultChecked />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Lab result alerts</label>
                  <div className="flex items-center h-5">
                    <input type="checkbox" className="w-4 h-4 text-conve-red border-gray-300 rounded focus:ring-conve-red" defaultChecked />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Marketing updates</label>
                  <div className="flex items-center h-5">
                    <input type="checkbox" className="w-4 h-4 text-conve-red border-gray-300 rounded focus:ring-conve-red" />
                  </div>
                </div>
              </div>
              
              <Button className="luxury-button w-full mt-6">Save Preferences</Button>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
};

export default AccountSettingsTab;
