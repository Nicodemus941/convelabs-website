
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import AdminTabsLayout from "./AdminTabsLayout";
import UserTable from "./users/UserTable";
import UserFormDialog from "./users/UserFormDialog";
import UserManagementHeader from "./users/UserManagementHeader";
import UserStats from "./users/UserStats";
import { useUserManagement } from "./users/useUserManagement";

const UserManagementTab = () => {
  const {
    searchTerm,
    setSearchTerm,
    roleFilter,
    setRoleFilter,
    filteredUsers,
    users,
    isLoading,
    isDialogOpen,
    setIsDialogOpen,
    isEditMode,
    currentUser,
    newUser,
    setNewUser,
    handleEditUser,
    handleDeleteUser,
    handleAddUser,
    handleSaveUser
  } = useUserManagement();

  return (
    <AdminTabsLayout title="User Management">
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>Manage platform users and roles</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <UserManagementHeader
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              roleFilter={roleFilter}
              setRoleFilter={setRoleFilter}
              onAddUser={handleAddUser}
            />
            
            <UserTable
              users={filteredUsers}
              isLoading={isLoading}
              onEditUser={handleEditUser}
              onDeleteUser={handleDeleteUser}
            />
            
            <UserStats 
              filteredCount={filteredUsers.length} 
              totalCount={users.length} 
            />
          </div>
        </CardContent>
      </Card>

      <UserFormDialog 
        isOpen={isDialogOpen}
        setIsOpen={setIsDialogOpen}
        isEditMode={isEditMode}
        currentUser={currentUser}
        newUser={newUser}
        setNewUser={setNewUser}
        onSave={handleSaveUser}
      />
    </AdminTabsLayout>
  );
};

export default UserManagementTab;
