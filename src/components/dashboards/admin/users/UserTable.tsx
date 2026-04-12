
import React from "react";
import { Edit, Trash2 } from "lucide-react";
import { User } from "./types";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow 
} from "@/components/ui/table";

interface UserTableProps {
  users: User[];
  isLoading: boolean;
  onEditUser: (user: User) => void;
  onDeleteUser: (user: User) => void;
}

const UserTable: React.FC<UserTableProps> = ({
  users,
  isLoading,
  onEditUser,
  onDeleteUser,
}) => {
  if (isLoading) {
    return (
      <div className="w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={5} className="text-center py-8">
                <div className="flex justify-center">
                  <div className="w-8 h-8 border-4 border-t-conve-red border-r-conve-red border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                No users found matching your filters
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id} className="hover:bg-gray-50">
              <TableCell>{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell className="capitalize">{user.role.replace('_', ' ')}</TableCell>
              <TableCell>
                <span className={`px-2 py-1 rounded text-xs ${
                  user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {user.status}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <button 
                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    onClick={() => onEditUser(user)}
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </button>
                  <button 
                    className="text-red-600 hover:text-red-800 flex items-center gap-1"
                    onClick={() => onDeleteUser(user)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default UserTable;
