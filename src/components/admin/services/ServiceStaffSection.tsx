import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, X, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface StaffAssignment {
  staff_id: string;
  can_lead: boolean;
  can_assist: boolean;
  hourly_rate?: number;
  staff_name?: string;
}

interface StaffMember {
  id: string;
  user_id: string;
  specialty: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface ServiceStaffSectionProps {
  serviceId?: string;
  assignments: StaffAssignment[];
  onAssignmentsChange: (assignments: StaffAssignment[]) => void;
}

const ServiceStaffSection: React.FC<ServiceStaffSectionProps> = ({
  serviceId,
  assignments,
  onAssignmentsChange
}) => {
  const [availableStaff, setAvailableStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStaffId, setSelectedStaffId] = useState('');

  useEffect(() => {
    fetchAvailableStaff();
    if (serviceId) {
      fetchExistingAssignments();
    }
  }, [serviceId]);

  const fetchAvailableStaff = async () => {
    try {
      const { data: staffData, error } = await supabase
        .from('staff_profiles')
        .select('id, user_id, specialty')
        .eq('specialty', 'phlebotomist');

      if (error) throw error;

      // For now, we'll just use the staff profile data without user details
      // In a real implementation, you'd want to join with a user_profiles table
      const formattedStaff = staffData?.map(staff => ({
        id: staff.id,
        user_id: staff.user_id,
        specialty: staff.specialty,
        first_name: 'Staff',
        last_name: `#${staff.id.slice(0, 8)}`,
        email: 'staff@example.com'
      })) || [];

      setAvailableStaff(formattedStaff);
    } catch (error) {
      console.error('Error fetching staff:', error);
      toast.error('Failed to fetch available staff');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchExistingAssignments = async () => {
    if (!serviceId) return;

    try {
      // For now, we'll skip fetching existing assignments until the table is properly set up
      // This will be enabled once the database schema is confirmed
      console.log('Skipping existing assignments fetch for serviceId:', serviceId);
    } catch (error) {
      console.error('Error fetching existing assignments:', error);
    }
  };

  const addStaffAssignment = () => {
    if (!selectedStaffId) return;

    const selectedStaff = availableStaff.find(staff => staff.id === selectedStaffId);
    if (!selectedStaff) return;

    // Check if staff already assigned
    if (assignments.some(assignment => assignment.staff_id === selectedStaffId)) {
      toast.error('This staff member is already assigned to this service');
      return;
    }

    const newAssignment: StaffAssignment = {
      staff_id: selectedStaffId,
      can_lead: false,
      can_assist: true,
      hourly_rate: 0,
      staff_name: `${selectedStaff.first_name} ${selectedStaff.last_name}`
    };

    onAssignmentsChange([...assignments, newAssignment]);
    setSelectedStaffId('');
  };

  const removeStaffAssignment = (staffId: string) => {
    onAssignmentsChange(assignments.filter(assignment => assignment.staff_id !== staffId));
  };

  const updateAssignment = (staffId: string, field: keyof StaffAssignment, value: any) => {
    onAssignmentsChange(
      assignments.map(assignment =>
        assignment.staff_id === staffId
          ? { ...assignment, [field]: value }
          : assignment
      )
    );
  };

  const unassignedStaff = availableStaff.filter(
    staff => !assignments.some(assignment => assignment.staff_id === staff.id)
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Staff Assignment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">Loading staff...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Staff Assignment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add New Staff Assignment */}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label htmlFor="staff-select">Assign Staff Member</Label>
            <select
              id="staff-select"
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a staff member...</option>
              {unassignedStaff.map(staff => (
                <option key={staff.id} value={staff.id}>
                  {staff.first_name} {staff.last_name} ({staff.specialty})
                </option>
              ))}
            </select>
          </div>
          <Button onClick={addStaffAssignment} disabled={!selectedStaffId}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Current Assignments */}
        <div className="space-y-4">
          <h4 className="font-medium">Current Assignments ({assignments.length})</h4>
          
          {assignments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No staff assigned to this service yet.
            </div>
          ) : (
            assignments.map(assignment => (
              <Card key={assignment.staff_id} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {assignment.staff_name || 'Unknown Staff'}
                    </Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeStaffAssignment(assignment.staff_id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={assignment.can_lead}
                      onCheckedChange={(value) => 
                        updateAssignment(assignment.staff_id, 'can_lead', value)
                      }
                    />
                    <Label>Can Lead Service</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={assignment.can_assist}
                      onCheckedChange={(value) => 
                        updateAssignment(assignment.staff_id, 'can_assist', value)
                      }
                    />
                    <Label>Can Assist</Label>
                  </div>
                </div>
                
                <div className="mt-3">
                  <Label>Hourly Rate ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={assignment.hourly_rate ? (assignment.hourly_rate / 100).toFixed(2) : ''}
                    onChange={(e) => 
                      updateAssignment(
                        assignment.staff_id, 
                        'hourly_rate', 
                        e.target.value ? Math.round(Number(e.target.value) * 100) : undefined
                      )
                    }
                    placeholder="0.00"
                  />
                </div>
              </Card>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ServiceStaffSection;