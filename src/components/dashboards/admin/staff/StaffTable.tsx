
import React from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, User, UserPlus } from "lucide-react";
import { formatCurrency } from "@/utils/formatters";
import { StaffProfile } from "@/hooks/useStaffProfiles";

interface StaffTableProps {
  staffList: StaffProfile[];
  isLoading: boolean;
  handleEditStaff: (staff: StaffProfile) => void;
  handleDeleteStaff: (staff: StaffProfile) => void;
  handleAddStaff: () => void;
}

const StaffTable: React.FC<StaffTableProps> = ({
  staffList,
  isLoading,
  handleEditStaff,
  handleDeleteStaff,
  handleAddStaff,
}) => {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground mt-2">Loading staff data...</p>
      </div>
    );
  }

  if (staffList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 border rounded-md bg-background">
        <div className="bg-muted rounded-full p-3">
          <User className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-lg font-medium">No staff members found</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm text-center">
          You haven't added any staff members yet or your filters are too restrictive.
        </p>
        <Button onClick={handleAddStaff} className="mt-4 flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Add Staff Member
        </Button>
      </div>
    );
  }

  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Specialty</TableHead>
            <TableHead>Pay Rate</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {staffList.map((staff) => (
            <TableRow key={staff.id}>
              <TableCell className="font-medium">
                {staff.user?.full_name || "Unassigned"}
                <div className="text-xs text-muted-foreground">
                  {staff.user?.email || "No email"}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="capitalize">
                  {staff.user?.role || "unassigned"}
                </Badge>
              </TableCell>
              <TableCell>{staff.specialty || "General"}</TableCell>
              <TableCell>{formatCurrency(staff.pay_rate / 100)}/hr</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" onClick={() => handleEditStaff(staff)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDeleteStaff(staff)}
                >
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default StaffTable;
