
import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import TerritoryForm from "./TerritoryForm";
import { Territory } from "@/hooks/useFranchiseData";

interface TerritoryFormDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  territory: Partial<Territory>;
  formMode: 'create' | 'edit';
  onTerritoryChange: (territory: Partial<Territory>) => void;
  onSubmit: (e: React.FormEvent) => void;
}

const TerritoryFormDialog: React.FC<TerritoryFormDialogProps> = ({
  isOpen,
  onOpenChange,
  territory,
  formMode,
  onTerritoryChange,
  onSubmit
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{formMode === 'create' ? 'Create' : 'Edit'} Territory</DialogTitle>
          <DialogDescription>
            {formMode === 'create' 
              ? 'Add a new territory for franchise assignment.' 
              : 'Update the territory details.'}
          </DialogDescription>
        </DialogHeader>
        <TerritoryForm
          territory={territory}
          formMode={formMode}
          onTerritoryChange={onTerritoryChange}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
};

export default TerritoryFormDialog;
