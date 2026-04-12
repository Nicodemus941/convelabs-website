
import React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import DocumentManagement from "@/components/admin/DocumentManagement";

const DocumentationTab: React.FC = () => {
  return (
    <Tabs defaultValue="sop">
      <TabsList className="mb-6">
        <TabsTrigger value="sop">SOPs & Guidelines</TabsTrigger>
        <TabsTrigger value="system">System Documentation</TabsTrigger>
      </TabsList>

      <TabsContent value="sop">
        <DocumentManagement />
      </TabsContent>

      <TabsContent value="system">
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">System Documentation</h2>
          <p className="text-gray-500">
            This section contains technical documentation about the ConveLabs platform, 
            including system architecture, user guides, and procedures.
          </p>
          
          <DocumentManagement />
        </div>
      </TabsContent>
    </Tabs>
  );
};

export default DocumentationTab;
