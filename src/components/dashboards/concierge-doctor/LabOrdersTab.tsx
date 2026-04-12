
import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const LabOrdersTab = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lab Order Management</CardTitle>
        <CardDescription>Create and track lab orders for your patients</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-medium text-lg">Recent Lab Orders</h3>
            <Button variant="outline">Create New Order</Button>
          </div>
          
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Test Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { patient: "Emily Clark", date: "May 16, 2025", type: "Comprehensive Panel", status: "Scheduled" },
                { patient: "Jessica Wong", date: "May 15, 2025", type: "Thyroid Panel", status: "Scheduled" },
                { patient: "Michael Brown", date: "May 14, 2025", type: "Lipid Panel", status: "In Progress" },
                { patient: "Robert Chen", date: "May 10, 2025", type: "CBC", status: "Completed" },
                { patient: "Sarah Miller", date: "May 5, 2025", type: "Metabolic Panel", status: "Completed" }
              ].map((order, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{order.patient}</TableCell>
                  <TableCell>{order.date}</TableCell>
                  <TableCell>{order.type}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      order.status === 'Scheduled' ? 'bg-blue-100 text-blue-800' :
                      order.status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {order.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="link" className="text-conve-red h-auto p-0">View Details</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-medium text-lg">Common Lab Panels</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { name: "Comprehensive Metabolic Panel", tests: "14 tests", popular: true },
              { name: "Complete Blood Count (CBC)", tests: "10 tests", popular: true },
              { name: "Lipid Panel", tests: "4 tests", popular: false },
              { name: "Thyroid Panel", tests: "3 tests", popular: true },
              { name: "Vitamin Panel", tests: "5 tests", popular: false },
              { name: "Hormone Panel", tests: "8 tests", popular: false }
            ].map((panel, index) => (
              <div key={index} className="border rounded-lg p-4 hover:bg-muted/20 cursor-pointer">
                <div className="flex justify-between mb-2">
                  <h4 className="font-medium">{panel.name}</h4>
                  {panel.popular && (
                    <span className="text-xs bg-conve-red/10 text-conve-red rounded px-2 py-0.5">Popular</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{panel.tests}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LabOrdersTab;
