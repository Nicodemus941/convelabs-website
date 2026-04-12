
import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Clipboard, Phone } from "lucide-react";

const LabResultsTab = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lab Results</CardTitle>
        <CardDescription>View and manage patient lab results</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-medium text-lg">Recent Results</h3>
            <Button variant="outline">View All Results</Button>
          </div>
          
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Test</TableHead>
                <TableHead>Result Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { patient: "Robert Chen", test: "CBC", date: "May 14, 2025", status: "Normal" },
                { patient: "Sarah Miller", test: "Metabolic Panel", date: "May 10, 2025", status: "Abnormal" },
                { patient: "Jessica Wong", test: "Lipid Panel", date: "May 8, 2025", status: "Review Needed" },
                { patient: "Emily Clark", test: "Thyroid Panel", date: "May 5, 2025", status: "Normal" },
                { patient: "Michael Brown", test: "Vitamin D", date: "April 30, 2025", status: "Abnormal" }
              ].map((result, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{result.patient}</TableCell>
                  <TableCell>{result.test}</TableCell>
                  <TableCell>{result.date}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      result.status === 'Normal' ? 'bg-green-100 text-green-800' :
                      result.status === 'Review Needed' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {result.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="link" className="text-conve-red h-auto p-0">View Result</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-medium text-lg">Quick Actions</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2">
              <FileText className="h-8 w-8 text-conve-red" />
              <span className="font-medium">Upload External Results</span>
            </Button>
            
            <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2">
              <Clipboard className="h-8 w-8 text-conve-red" />
              <span className="font-medium">Create Patient Report</span>
            </Button>
            
            <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2">
              <Phone className="h-8 w-8 text-conve-red" />
              <span className="font-medium">Schedule Consultation</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LabResultsTab;
