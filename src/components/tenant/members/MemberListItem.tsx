
import React from 'react';
import { MemberWithProfile } from '@/types/tenant';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, ChevronUp, ChevronDown, UserMinus, Mail } from 'lucide-react';

interface MemberListItemProps {
  member: MemberWithProfile;
}

const MemberListItem: React.FC<MemberListItemProps> = ({ member }) => {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase();
  };
  
  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'default';
      case 'billing':
        return 'secondary';
      case 'operator':
        return 'outline';
      default:
        return 'secondary';
    }
  };
  
  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Admin';
      case 'billing':
        return 'Billing Manager';
      case 'operator':
        return 'Operator';
      default:
        return 'Member';
    }
  };
  
  return (
    <div className="flex items-center justify-between p-2 hover:bg-accent rounded-md transition-colors">
      <div className="flex items-center space-x-4">
        <Avatar>
          <AvatarFallback>{getInitials(member.profile.full_name || 'User')}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">{member.profile.full_name || 'Unknown User'}</p>
          <p className="text-sm text-muted-foreground">{member.profile.email}</p>
        </div>
      </div>
      
      <div className="flex items-center space-x-2">
        <Badge variant={getRoleBadgeVariant(member.role)}>
          {getRoleLabel(member.role)}
        </Badge>
        
        {member.is_primary && (
          <Badge variant="outline" className="border-amber-500 text-amber-500">
            Owner
          </Badge>
        )}
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Mail className="mr-2 h-4 w-4" />
              <span>Send message</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <ChevronUp className="mr-2 h-4 w-4" />
              <span>Promote</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <ChevronDown className="mr-2 h-4 w-4" />
              <span>Demote</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              <UserMinus className="mr-2 h-4 w-4" />
              <span>Remove</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default MemberListItem;
