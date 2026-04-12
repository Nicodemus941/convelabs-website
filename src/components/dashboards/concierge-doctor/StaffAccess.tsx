
import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlusCircle } from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  accessLevel: string;
  lastLogin: string;
}

const StaffAccess = () => {
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [newStaff, setNewStaff] = useState({
    name: "",
    email: "",
    role: "",
    accessLevel: "read-only"
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Mock staff data
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([
    {
      id: "staff-1",
      name: "Amanda Lee",
      email: "amanda.lee@example.com",
      role: "Office Administrator",
      accessLevel: "full-access",
      lastLogin: "Today at 9:23 AM"
    },
    {
      id: "staff-2",
      name: "Marcus Johnson",
      email: "marcus@example.com",
      role: "Medical Assistant",
      accessLevel: "limited",
      lastLogin: "Yesterday at 4:15 PM"
    }
  ]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewStaff(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setNewStaff(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    if (!newStaff.name || !newStaff.email || !newStaff.role) {
      toast.error("Please fill out all required fields");
      return;
    }
    
    setIsSubmitting(true);
    
    // Simulate API call
    setTimeout(() => {
      const newStaffMember: StaffMember = {
        ...newStaff,
        id: `staff-${Date.now()}`,
        lastLogin: "Never"
      };
      
      setStaffMembers(prev => [...prev, newStaffMember]);
      setIsAddStaffOpen(false);
      setNewStaff({
        name: "",
        email: "",
        role: "",
        accessLevel: "read-only"
      });
      setIsSubmitting(false);
      
      toast.success("Staff member added successfully");
    }, 1000);
  };

  const removeStaff = (id: string) => {
    setStaffMembers(prev => prev.filter(staff => staff.id !== id));
    toast.success("Staff access removed");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff Access Management</CardTitle>
        <CardDescription>
          Add staff members to access your dashboard with customized permissions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-medium">Staff Members</h3>
          <Dialog open={isAddStaffOpen} onOpenChange={setIsAddStaffOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="h-4 w-4 mr-2" />
                Add Staff Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Staff Member</DialogTitle>
                <DialogDescription>
                  Add a staff member to grant access to your dashboard
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    name="name"
                    placeholder="Full name"
                    value={newStaff.name}
                    onChange={handleInputChange}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    name="email"
                    type="email"
                    placeholder="staff@example.com"
                    value={newStaff.email}
                    onChange={handleInputChange}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Role</label>
                  <Input
                    name="role"
                    placeholder="e.g., Medical Assistant"
                    value={newStaff.role}
                    onChange={handleInputChange}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Access Level</label>
                  <Select
                    value={newStaff.accessLevel}
                    onValueChange={(value) => handleSelectChange("accessLevel", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select access level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="read-only">Read Only</SelectItem>
                      <SelectItem value="limited">Limited Access</SelectItem>
                      <SelectItem value="full-access">Full Access</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsAddStaffOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? "Adding..." : "Add Staff Member"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Access Level</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staffMembers.map((staff) => (
              <TableRow key={staff.id}>
                <TableCell className="font-medium">{staff.name}</TableCell>
                <TableCell>{staff.email}</TableCell>
                <TableCell>{staff.role}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    staff.accessLevel === 'full-access' ? 'bg-green-100 text-green-800' :
                    staff.accessLevel === 'limited' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {staff.accessLevel === 'full-access' ? 'Full Access' :
                     staff.accessLevel === 'limited' ? 'Limited Access' :
                     'Read Only'}
                  </span>
                </TableCell>
                <TableCell>{staff.lastLogin}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm">Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => removeStaff(staff.id)}>
                      Remove
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {staffMembers.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No staff members added yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="mt-8 p-4 bg-muted/20 rounded-md border">
          <h4 className="font-medium mb-2">Access Levels Explained</h4>
          <ul className="space-y-2 text-sm">
            <li><strong>Read Only</strong>: Can view patient information but cannot schedule appointments or modify data.</li>
            <li><strong>Limited Access</strong>: Can schedule appointments and view patient information, but cannot modify billing or account settings.</li>
            <li><strong>Full Access</strong>: Can perform all actions on behalf of the provider, except modifying account credentials.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default StaffAccess;
