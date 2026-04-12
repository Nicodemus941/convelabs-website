
import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface StaffBasicInfoFormProps {
  selectedUserId: string;
  selectedUser: { id: string; email?: string; full_name?: string; role?: string } | null;
  existingUsers: { id: string; email: string; full_name?: string; firstName?: string; lastName?: string; role?: string }[];
  isLoading: boolean;
  setSelectedUserId: (id: string) => void;
  isEditMode: boolean;
  formValues: {
    pay_rate: string;
    premium_pay_rate: string;
    specialty: string;
  };
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  // Add the props being passed from StaffFormDialog
  staffMember?: any;
  onSave?: (data: any) => Promise<void>;
}

const StaffBasicInfoForm: React.FC<StaffBasicInfoFormProps> = ({
  selectedUserId,
  selectedUser,
  existingUsers,
  isLoading,
  setSelectedUserId,
  isEditMode,
  formValues,
  handleInputChange,
  // These can be ignored since they're not used directly
  staffMember,
  onSave,
}) => {
  return (
    <>
      {!isEditMode && (
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="user_id" className="text-right">
            Select User
          </Label>
          <div className="col-span-3">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {isLoading ? (
                  <SelectItem value="loading" disabled>Loading users...</SelectItem>
                ) : existingUsers.length > 0 ? (
                  existingUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name || "Unknown User"}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>No users available</SelectItem>
                )}
              </SelectContent>
            </Select>
            {selectedUser && (
              <div className="mt-1 text-sm text-gray-500">
                {selectedUser.email && (
                  <div>Email: {selectedUser.email}</div>
                )}
                <div>Role: {selectedUser.role || "No role assigned"}</div>
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="pay_rate" className="text-right">
          Pay Rate ($)
        </Label>
        <Input
          id="pay_rate"
          name="pay_rate"
          className="col-span-3"
          value={formValues.pay_rate}
          onChange={handleInputChange}
          type="number"
          step="0.01"
          min="0"
        />
      </div>
      
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="premium_pay_rate" className="text-right">
          Premium Pay ($)
        </Label>
        <Input
          id="premium_pay_rate"
          name="premium_pay_rate"
          className="col-span-3"
          value={formValues.premium_pay_rate}
          onChange={handleInputChange}
          type="number"
          step="0.01"
          min="0"
          placeholder="Optional"
        />
      </div>
      
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="specialty" className="text-right">
          Specialty
        </Label>
        <Input
          id="specialty"
          name="specialty"
          className="col-span-3"
          value={formValues.specialty}
          onChange={handleInputChange}
          placeholder="e.g. Pediatric, Geriatric"
        />
      </div>
    </>
  );
};

export default StaffBasicInfoForm;
