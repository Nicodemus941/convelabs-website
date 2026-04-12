
import React from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import UserFilters from "./UserFilters";

interface UserManagementHeaderProps {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  roleFilter: string;
  setRoleFilter: (value: string) => void;
  onAddUser: () => void;
}

const UserManagementHeader: React.FC<UserManagementHeaderProps> = ({
  searchTerm,
  setSearchTerm,
  roleFilter,
  setRoleFilter,
  onAddUser
}) => {
  return (
    <div className="flex justify-between items-center flex-wrap gap-4">
      <UserFilters
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        roleFilter={roleFilter}
        setRoleFilter={setRoleFilter}
      />
      <Button 
        className="flex items-center gap-2"
        onClick={onAddUser}
      >
        <UserPlus className="h-4 w-4" />
        Add User
      </Button>
    </div>
  );
};

export default UserManagementHeader;
