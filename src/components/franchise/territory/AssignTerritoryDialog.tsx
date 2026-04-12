
import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Territory, FranchiseOwner } from "@/hooks/useFranchiseData";

interface AssignTerritoryDialogProps {
  territory: Territory;
  franchiseOwners: FranchiseOwner[];
  onAssign: (territoryId: string, franchiseOwnerId: string) => void;
}

const AssignTerritoryDialog: React.FC<AssignTerritoryDialogProps> = ({
  territory,
  franchiseOwners,
  onAssign,
}) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm">Assign</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Territory</DialogTitle>
          <DialogDescription>
            Select a franchise owner to assign to this territory.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Select onValueChange={(value) => onAssign(territory.id, value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select franchise owner" />
            </SelectTrigger>
            <SelectContent>
              {franchiseOwners.map(owner => (
                <SelectItem key={owner.id} value={owner.id}>
                  {owner.company_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AssignTerritoryDialog;
