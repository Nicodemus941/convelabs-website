
import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Edit } from "lucide-react";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Territory } from "@/hooks/useFranchiseData";
import { FranchiseOwner } from "@/hooks/useFranchiseData";
import AssignTerritoryDialog from "./AssignTerritoryDialog";

interface TerritoryCardProps {
  territory: Territory & { 
    franchise_owners?: {
      id: string;
      company_name: string;
    } 
  };
  franchiseOwners: FranchiseOwner[];
  isAdmin: boolean;
  onEdit: (territory: Territory) => void;
  onAssign: (territoryId: string, franchiseOwnerId: string) => void;
}

const TerritoryCard: React.FC<TerritoryCardProps> = ({
  territory,
  franchiseOwners,
  isAdmin,
  onEdit,
  onAssign,
}) => {
  // Find the franchise owner if available
  const franchiseOwner = franchiseOwners.find(owner => owner.id === territory.franchise_owner_id);

  return (
    <Card key={territory.id} className="overflow-hidden">
      <CardHeader className="bg-slate-50 pb-2">
        <CardTitle className="text-lg">{territory.name}</CardTitle>
        <CardDescription className="flex items-center">
          <MapPin className="h-4 w-4 mr-1" />
          {territory.city ? `${territory.city}, ${territory.state}` : territory.state}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="space-y-2">
          <div>
            <span className="text-sm font-medium">Status: </span>
            <span className={`text-sm capitalize ${
              territory.status === "assigned" ? "text-green-600" :
              territory.status === "available" ? "text-blue-600" :
              "text-gray-600"
            }`}>
              {territory.status}
            </span>
          </div>
          
          {territory.status === "assigned" && franchiseOwner && (
            <div>
              <span className="text-sm font-medium">Franchise: </span>
              <span className="text-sm">
                {franchiseOwner.company_name}
              </span>
            </div>
          )}
          
          {territory.description && (
            <div className="text-sm text-gray-600 mt-2">
              {territory.description}
            </div>
          )}
          
          {isAdmin && (
            <div className="flex justify-between items-center mt-4 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(territory)}
              >
                <Edit className="h-4 w-4 mr-1" /> Edit
              </Button>
              
              {territory.status === "available" && (
                <AssignTerritoryDialog 
                  territory={territory} 
                  franchiseOwners={franchiseOwners} 
                  onAssign={onAssign}
                />
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TerritoryCard;
