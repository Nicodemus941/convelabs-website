
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Mail, MapPin, Phone } from "lucide-react";
import { FranchiseStaff } from '@/hooks/franchise/useFranchiseStaff';
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface StaffTabProps {
  staffMembers: FranchiseStaff[] | undefined;
}

const StaffTab: React.FC<StaffTabProps> = ({ staffMembers = [] }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | undefined>(undefined);
  const [territoryFilter, setTerritoryFilter] = useState<string | undefined>(undefined);
  
  // Get unique roles for filter dropdown
  const roles = Array.from(new Set(staffMembers.map(staff => staff.role)));
  
  // Get unique territories for filter dropdown
  const territories = Array.from(
    new Set(
      staffMembers
        .filter(staff => staff.territories?.name)
        .map(staff => staff.territories?.name)
    )
  );
  
  // Filter staff members based on search query and filters
  const filteredStaff = staffMembers.filter(staff => {
    const matchesSearch = !searchQuery || 
      staff.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      staff.email.toLowerCase().includes(searchQuery.toLowerCase());
      
    const matchesRole = !roleFilter || staff.role === roleFilter;
    
    const matchesTerritory = !territoryFilter || 
      staff.territories?.name === territoryFilter;
      
    return matchesSearch && matchesRole && matchesTerritory;
  });

  const getRoleBadgeColor = (role: string) => {
    switch (role.toLowerCase()) {
      case 'phlebotomist':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'office manager':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'receptionist':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search staff..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={undefined}>All roles</SelectItem>
              {roles.map(role => (
                <SelectItem key={role} value={role}>{role}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={territoryFilter} onValueChange={setTerritoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by territory" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={undefined}>All territories</SelectItem>
              {territories.map(territory => (
                <SelectItem key={territory} value={territory}>{territory}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button className="bg-conve-red hover:bg-conve-red/90">
            <Plus className="mr-2 h-4 w-4" /> Add Staff
          </Button>
        </div>
      </div>
      
      {filteredStaff.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStaff.map((staff) => (
            <Card key={staff.id} className="overflow-hidden">
              <CardHeader className="bg-slate-50 border-b">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{staff.full_name}</CardTitle>
                    <CardDescription className="mt-1">{staff.email}</CardDescription>
                  </div>
                  <Badge className={getRoleBadgeColor(staff.role)}>
                    {staff.role}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-3">
                  {staff.territories && (
                    <div className="flex items-center text-sm text-gray-600">
                      <MapPin className="h-4 w-4 mr-2 text-gray-500" />
                      Territory: {staff.territories.name}
                    </div>
                  )}
                  
                  <div className="flex space-x-2 mt-4">
                    <Button variant="outline" size="sm" className="flex-1">
                      <Phone className="h-4 w-4 mr-2" /> Call
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1">
                      <Mail className="h-4 w-4 mr-2" /> Email
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1">
                      Schedule
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : searchQuery || roleFilter || territoryFilter ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No staff members match your filters.</p>
          <Button 
            variant="link" 
            onClick={() => {
              setSearchQuery('');
              setRoleFilter(undefined);
              setTerritoryFilter(undefined);
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}
    </div>
  );
};

export default StaffTab;
