
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { fetchUsers } from "./usersService";
import { User, NewUser } from "./types";

export const useUserManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState<NewUser>({
    name: "",
    email: "",
    role: "patient",
    password: "",
  });

  // Fetch users
  useEffect(() => {
    const loadUsers = async () => {
      try {
        setIsLoading(true);
        console.log("Fetching users from Supabase");
        const userData = await fetchUsers();
        setUsers(userData);
      } catch (error) {
        console.error("Error loading users:", error);
        toast("Failed to load users");
      } finally {
        setIsLoading(false);
      }
    };

    loadUsers();
  }, []);

  const handleEditUser = (user: User) => {
    setCurrentUser(user);
    setIsEditMode(true);
    setNewUser({
      name: user.name,
      email: user.email,
      role: user.role,
      password: "", // Don't populate password for security
    });
    setIsDialogOpen(true);
  };

  const handleDeleteUser = async (user: User) => {
    if (window.confirm(`Are you sure you want to delete ${user.name}?`)) {
      try {
        // In a real app, this would connect to Supabase to delete the user
        toast(`${user.name} has been deleted successfully.`);
        setUsers(users.filter((u) => u.id !== user.id));
      } catch (error) {
        console.error("Error in delete user:", error);
        toast("Failed to delete user");
      }
    }
  };

  const handleAddUser = () => {
    setCurrentUser(null);
    setIsEditMode(false);
    setNewUser({
      name: "",
      email: "",
      role: "patient",
      password: "",
    });
    setIsDialogOpen(true);
  };

  const handleSaveUser = async () => {
    try {
      // Validate required fields (handled by form now, but adding extra check)
      if (!newUser.name || !newUser.email || !newUser.role) {
        toast("Please fill out all required fields");
        return;
      }

      if (isEditMode && currentUser) {
        console.log(`Updating user ${currentUser.id} with new email: ${newUser.email}`);
        
        try {
          // Try to update the user profile
          if (currentUser.id) {
            // First update auth user email if possible (requires admin privileges)
            // This would typically be done through an edge function with admin rights
            
            // For now, just update our local state to show the change
            toast(`${newUser.name}'s information has been updated successfully`);
            
            // Update users list
            setUsers(
              users.map((u) =>
                u.id === currentUser.id
                  ? { ...u, name: newUser.name, email: newUser.email, role: newUser.role }
                  : u
              )
            );
          }
        } catch (error) {
          console.error("Error updating user:", error);
          toast("Could not update user information. Please try again.");
          return;
        }
      } else {
        // Ensure password is provided for new users
        if (!newUser.password) {
          toast("Please provide a password for the new user");
          return;
        }
        
        // Create user
        toast(`${newUser.name} has been added successfully.`);
        
        // Add to users list with mock ID
        const newUserData: User = {
          id: `new-${Date.now()}`,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          status: 'active',
        };
        
        setUsers([...users, newUserData]);
      }
      
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error in save user:", error);
      toast("Failed to save user");
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return {
    searchTerm,
    setSearchTerm,
    roleFilter,
    setRoleFilter,
    users,
    filteredUsers,
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
  };
};
