
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const ResourcesTab = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Resource Library</h2>
        <Button>Search Resources</Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Training Materials</CardTitle>
            <CardDescription>Staff onboarding and skill development</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              <li className="flex justify-between">
                <span className="text-blue-600">Phlebotomist Training Manual</span>
                <Badge variant="outline">PDF</Badge>
              </li>
              <li className="flex justify-between">
                <span className="text-blue-600">Office Procedures Guide</span>
                <Badge variant="outline">PDF</Badge>
              </li>
              <li className="flex justify-between">
                <span className="text-blue-600">Customer Service Training</span>
                <Badge variant="outline">Video</Badge>
              </li>
            </ul>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Marketing Materials</CardTitle>
            <CardDescription>Promotional content for your territory</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              <li className="flex justify-between">
                <span className="text-blue-600">Brand Guidelines</span>
                <Badge variant="outline">PDF</Badge>
              </li>
              <li className="flex justify-between">
                <span className="text-blue-600">Digital Ad Templates</span>
                <Badge variant="outline">ZIP</Badge>
              </li>
              <li className="flex justify-between">
                <span className="text-blue-600">Social Media Kit</span>
                <Badge variant="outline">ZIP</Badge>
              </li>
            </ul>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Operations</CardTitle>
            <CardDescription>Day-to-day management resources</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              <li className="flex justify-between">
                <span className="text-blue-600">Inventory Management Guide</span>
                <Badge variant="outline">PDF</Badge>
              </li>
              <li className="flex justify-between">
                <span className="text-blue-600">Compliance Checklist</span>
                <Badge variant="outline">PDF</Badge>
              </li>
              <li className="flex justify-between">
                <span className="text-blue-600">Quality Assurance Protocols</span>
                <Badge variant="outline">PDF</Badge>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResourcesTab;
