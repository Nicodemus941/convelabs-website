
import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TerritoryFormProps {
  territory: {
    id?: string;
    name?: string;
    state?: string;
    city?: string;
    description?: string;
    status?: string;
    created_at?: string;
  };
  formMode: 'create' | 'edit';
  onTerritoryChange: (territory: any) => void;
  onSubmit: (e: React.FormEvent) => void;
}

const TerritoryForm: React.FC<TerritoryFormProps> = ({
  territory,
  formMode,
  onTerritoryChange,
  onSubmit,
}) => {
  return (
    <form onSubmit={onSubmit}>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="name">Territory Name</Label>
          <Input
            id="name"
            value={territory.name || ''}
            onChange={(e) => onTerritoryChange({...territory, name: e.target.value})}
            placeholder="e.g., Greater Los Angeles"
            required
          />
        </div>
        
        <div className="grid gap-2">
          <Label htmlFor="state">State</Label>
          <Input
            id="state"
            value={territory.state || ''}
            onChange={(e) => onTerritoryChange({...territory, state: e.target.value})}
            placeholder="e.g., California"
            required
          />
        </div>
        
        <div className="grid gap-2">
          <Label htmlFor="city">City (Optional)</Label>
          <Input
            id="city"
            value={territory.city || ''}
            onChange={(e) => onTerritoryChange({...territory, city: e.target.value})}
            placeholder="e.g., Los Angeles"
          />
        </div>
        
        <div className="grid gap-2">
          <Label htmlFor="description">Description (Optional)</Label>
          <Input
            id="description"
            value={territory.description || ''}
            onChange={(e) => onTerritoryChange({...territory, description: e.target.value})}
            placeholder="Brief description of the territory"
          />
        </div>
        
        <div className="grid gap-2">
          <Label htmlFor="status">Status</Label>
          <Select 
            value={territory.status || 'available'}
            onValueChange={(value: any) => onTerritoryChange({...territory, status: value})}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="unavailable">Unavailable</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button type="submit">{formMode === 'create' ? 'Create' : 'Update'}</Button>
      </DialogFooter>
    </form>
  );
};

export default TerritoryForm;
