
import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { User, NewUser, userFormSchema, UserFormValues } from "./types";
import { toast } from "sonner";

interface UserFormDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isEditMode: boolean;
  currentUser: User | null;
  newUser: NewUser;
  setNewUser: (user: NewUser) => void;
  onSave: () => Promise<void>;
}

const UserFormDialog: React.FC<UserFormDialogProps> = ({
  isOpen,
  setIsOpen,
  isEditMode,
  currentUser,
  newUser,
  setNewUser,
  onSave,
}) => {
  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      name: "",
      email: "",
      role: "patient",
      password: "",
    },
    mode: "onBlur",
  });

  // Update form values when dialog opens or currentUser/newUser changes
  useEffect(() => {
    if (isOpen) {
      form.reset({
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        password: newUser.password,
      });
    }
  }, [isOpen, newUser, form]);

  const handleFormChange = (field: keyof NewUser, value: string) => {
    setNewUser({
      ...newUser,
      [field]: value,
    });
  };

  const onSubmit = async (data: UserFormValues) => {
    try {
      // Update newUser state with form data
      setNewUser({
        name: data.name,
        email: data.email,
        role: data.role,
        password: data.password || "",
      });
      
      await onSave();
    } catch (error) {
      console.error("Form submission error:", error);
      toast.error("Failed to save user. Please try again.");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit User" : "Add New User"}</DialogTitle>
          <DialogDescription>
            {isEditMode ? "Update user details" : "Create a new user account"}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="John Doe"
                      onChange={(e) => {
                        field.onChange(e);
                        handleFormChange("name", e.target.value);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      placeholder="john@example.com"
                      onChange={(e) => {
                        field.onChange(e);
                        handleFormChange("email", e.target.value);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>User Role</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                      handleFormChange("role", value);
                    }}
                    defaultValue={field.value}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="patient">Patient</SelectItem>
                      <SelectItem value="phlebotomist">Phlebotomist</SelectItem>
                      <SelectItem value="office_manager">Office Manager</SelectItem>
                      <SelectItem value="concierge_doctor">Concierge Doctor</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {isEditMode ? "Password (leave blank to keep unchanged)" : "Password"}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="password"
                      placeholder={isEditMode ? "••••••••" : "Create password"}
                      required={!isEditMode}
                      onChange={(e) => {
                        field.onChange(e);
                        handleFormChange("password", e.target.value);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter className="mt-6">
              <Button variant="outline" type="button" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {isEditMode ? "Update User" : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default UserFormDialog;
