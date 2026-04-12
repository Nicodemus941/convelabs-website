
import React from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Edit, UserPlus, BarChart } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";

export interface TerritoryListProps {
  territories: any[];
  franchiseOwners: any[];
  isAdmin: boolean;
  isLoading: boolean;
  onEditTerritory: (territory: any) => void;
  onAssignTerritory: (territoryId: string, franchiseOwnerId: string) => void;
}

const TerritoryList: React.FC<TerritoryListProps> = ({
  territories,
  franchiseOwners,
  isAdmin,
  isLoading,
  onEditTerritory,
  onAssignTerritory
}) => {
  const navigate = useNavigate();
  
  // Helper function to get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'available':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Available</Badge>;
      case 'assigned':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Assigned</Badge>;
      case 'pending':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pending</Badge>;
      case 'unavailable':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Unavailable</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  // View territory dashboard
  const handleViewDashboard = (territoryId: string) => {
    navigate(`/territory/${territoryId}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (territories.length === 0) {
    return (
      <div className="text-center p-8 border rounded-lg bg-slate-50">
        <p className="text-gray-500">No territories found</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {territories.map((territory) => (
            <TableRow key={territory.id}>
              <TableCell className="font-medium">{territory.name}</TableCell>
              <TableCell>{territory.state}</TableCell>
              <TableCell>{getStatusBadge(territory.status)}</TableCell>
              <TableCell>
                {territory.franchise_owners?.company_name || (territory.franchise_owner_id ? "Assigned" : "None")}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  {isAdmin && (
                    <Button variant="outline" size="sm" onClick={() => onEditTerritory(territory)}>
                      <Edit className="h-4 w-4 mr-1" /> Edit
                    </Button>
                  )}
                  
                  {isAdmin && territory.status === 'available' && (
                    <Button variant="outline" size="sm" onClick={() => onAssignTerritory(territory.id, '')}>
                      <UserPlus className="h-4 w-4 mr-1" /> Assign
                    </Button>
                  )}
                  
                  {territory.status === 'assigned' && (
                    <Button variant="outline" size="sm" onClick={() => handleViewDashboard(territory.id)}>
                      <BarChart className="h-4 w-4 mr-1" /> Dashboard
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default TerritoryList;
