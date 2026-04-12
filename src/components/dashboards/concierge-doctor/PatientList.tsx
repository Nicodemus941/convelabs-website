
import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Users, Calendar, Phone } from "lucide-react";

const PatientList = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const patients = [
    { name: "Emily Clark", id: "P-2341", lastVisit: "May 12, 2025", status: "Active" },
    { name: "Michael Brown", id: "P-1892", lastVisit: "May 10, 2025", status: "Active" },
    { name: "Jessica Wong", id: "P-4561", lastVisit: "May 5, 2025", status: "Follow-up Required" },
    { name: "Robert Chen", id: "P-3217", lastVisit: "April 29, 2025", status: "Active" },
    { name: "Sarah Miller", id: "P-7834", lastVisit: "April 22, 2025", status: "Lab Pending" },
    { name: "David Johnson", id: "P-5623", lastVisit: "April 15, 2025", status: "Active" },
    { name: "Lisa Garcia", id: "P-9012", lastVisit: "April 8, 2025", status: "Results Review" },
    { name: "Thomas Lee", id: "P-7456", lastVisit: "April 1, 2025", status: "Active" },
  ];

  const filteredPatients = patients.filter(patient => 
    patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Patient Management</CardTitle>
        <CardDescription>View and manage your patient roster</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
            <Input
              placeholder="Search patients by name or ID..."
              className="max-w-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="outline">Filter</Button>
              <Button>Add New Patient</Button>
            </div>
          </div>
          
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Last Visit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPatients.map((patient, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{patient.name}</TableCell>
                    <TableCell>{patient.id}</TableCell>
                    <TableCell>{patient.lastVisit}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        patient.status === 'Active' ? 'bg-green-100 text-green-800' :
                        patient.status === 'Follow-up Required' ? 'bg-yellow-100 text-yellow-800' :
                        patient.status === 'Lab Pending' ? 'bg-blue-100 text-blue-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {patient.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="link" className="text-conve-red h-auto p-0">View Profile</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-medium text-lg">Quick Actions</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2">
              <Users className="h-8 w-8 text-conve-red" />
              <span className="font-medium">Add New Patient</span>
            </Button>
            
            <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2">
              <Calendar className="h-8 w-8 text-conve-red" />
              <span className="font-medium">Schedule Follow-up</span>
            </Button>
            
            <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2">
              <Phone className="h-8 w-8 text-conve-red" />
              <span className="font-medium">Patient Outreach</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PatientList;
