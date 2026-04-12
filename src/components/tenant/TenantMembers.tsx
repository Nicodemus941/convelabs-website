
import React from 'react';
import { Tenant, MemberWithProfile } from '@/types/tenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AddMemberDialog from './members/AddMemberDialog';
import MemberListItem from './members/MemberListItem';
import EmptyMembersList from './members/EmptyMembersList';

interface TenantMembersProps {
  tenant: Tenant;
}

const TenantMembers: React.FC<TenantMembersProps> = ({ tenant }) => {
  const [members, setMembers] = React.useState<MemberWithProfile[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  
  React.useEffect(() => {
    // In a real implementation, this would fetch members from the API
    const fetchMembers = async () => {
      try {
        setIsLoading(true);
        // Mock data for now
        setMembers([
          {
            id: '1',
            user_id: tenant.owner_id,
            tenant_id: tenant.id,
            role: 'admin',
            is_primary: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            profile: {
              full_name: 'You (Owner)',
              email: tenant.contact_email,
            }
          }
        ]);
      } catch (error) {
        console.error("Error fetching members:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchMembers();
  }, [tenant.id]);
  
  const handleAddMember = (email: string, role: string) => {
    // In a real implementation, this would send an invitation and add the member
    console.log("Adding member:", email, role);
    setIsDialogOpen(false);
  };
  
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Team Members</h2>
        <Button onClick={() => setIsDialogOpen(true)} className="flex items-center">
          <UserPlus className="mr-2 h-4 w-4" />
          Add Member
        </Button>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>
            Manage your organization's team members and their roles
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center space-x-4">
                  <div className="h-10 w-10 rounded-full bg-gray-200 animate-pulse" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 w-1/2 bg-gray-200 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : members.length > 0 ? (
            <div className="space-y-4">
              {members.map((member) => (
                <MemberListItem key={member.id} member={member} />
              ))}
            </div>
          ) : (
            <EmptyMembersList />
          )}
        </CardContent>
      </Card>
      
      <AddMemberDialog 
        isOpen={isDialogOpen} 
        onClose={() => setIsDialogOpen(false)} 
        onAdd={handleAddMember} 
      />
    </div>
  );
};

export default TenantMembers;
