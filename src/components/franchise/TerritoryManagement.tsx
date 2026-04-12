import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { 
  useTerritories, 
  useFranchiseOwners,
  useCreateTerritory,
  useUpdateTerritory,
  useAssignTerritory,
  useCheckUserRole,
  Territory
} from "@/hooks/franchise";
import TerritoryList from "./territory/TerritoryList";
import TerritoryFormDialog from "./territory/TerritoryFormDialog";
import TerritoryGrowthChart from "./territory/TerritoryGrowthChart";
import TerritoryMap from "./territory/TerritoryMap";

// Interface for territory with owner details
interface TerritoryWithOwner extends Territory {
  franchise_owners?: {
    id: string;
    company_name: string;
  };
}

const TerritoryManagement: React.FC = () => {
  const { toast } = useToast();
  const { data: userRoleData } = useCheckUserRole();
  const isAdmin = userRoleData?.isAdmin || false;
  
  // Fetch data and handle data formats for each territory
  const { data: territoriesData = [], isLoading: isTerritoriesLoading } = useTerritories();
  const { data: franchiseOwners = [], isLoading: isOwnersLoading } = useFranchiseOwners();
  
  // Process the territories data to ensure created_at field exists
  const territories: Territory[] = territoriesData.map(territory => ({
    ...territory,
    created_at: territory.created_at || new Date().toISOString() // Ensure created_at exists
  }));
  
  const [currentTab, setCurrentTab] = useState("active");
  const [analyticsView, setAnalyticsView] = useState<'list' | 'growth' | 'map'>('list');
  
  // Form state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [currentTerritory, setCurrentTerritory] = useState<Partial<Territory>>({
    name: '',
    state: '',
    status: 'available',
    created_at: new Date().toISOString()
  });

  // Mutations
  const createTerritoryMutation = useCreateTerritory();
  const updateTerritoryMutation = useUpdateTerritory();
  const assignTerritoryMutation = useAssignTerritory();

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (formMode === 'create') {
        await createTerritoryMutation.mutateAsync({
          name: currentTerritory.name!,
          state: currentTerritory.state!,
          city: currentTerritory.city,
          description: currentTerritory.description,
          status: currentTerritory.status as 'available' | 'assigned' | 'pending' | 'unavailable'
        });
      } else {
        await updateTerritoryMutation.mutateAsync({
          id: currentTerritory.id!,
          territory: {
            name: currentTerritory.name,
            state: currentTerritory.state,
            city: currentTerritory.city,
            description: currentTerritory.description,
            status: currentTerritory.status as 'available' | 'assigned' | 'pending' | 'unavailable'
          }
        });
      }
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error submitting territory:", error);
    }
  };

  // Handle territory assignment
  const handleAssignTerritory = async (territoryId: string, franchiseOwnerId: string) => {
    try {
      await assignTerritoryMutation.mutateAsync({
        territoryId,
        franchiseOwnerId
      });
    } catch (error) {
      console.error("Error assigning territory:", error);
    }
  };

  // Open edit dialog with proper type handling for created_at
  const handleEditTerritory = (territory: any) => {
    // Ensure we properly handle the created_at field when editing a territory
    const territoryWithCreatedAt: TerritoryWithOwner = {
      ...territory,
      created_at: territory.created_at || new Date().toISOString(),
      status: territory.status as 'available' | 'assigned' | 'pending' | 'unavailable'
    };
    
    setCurrentTerritory(territoryWithCreatedAt);
    setFormMode('edit');
    setIsDialogOpen(true);
  };

  // Open create dialog
  const handleCreateTerritory = () => {
    setCurrentTerritory({
      name: '',
      state: '',
      status: 'available',
      created_at: new Date().toISOString()
    });
    setFormMode('create');
    setIsDialogOpen(true);
  };

  // Filter territories based on tab
  const filteredTerritories = territories.filter(territory => {
    if (currentTab === "active") {
      return territory.status === "assigned";
    } else if (currentTab === "available") {
      return territory.status === "available";
    }
    return true;
  });

  const isLoading = isTerritoriesLoading || isOwnersLoading;

  return (
    <Card className="w-full shadow-md">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-xl">Territory Management</CardTitle>
            <CardDescription>Manage franchise territories and assignments</CardDescription>
          </div>
          <div className="flex space-x-2">
            {currentTab === "all" && (
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setAnalyticsView('list')}
                  className={analyticsView === 'list' ? 'bg-gray-100' : ''}
                >
                  List View
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setAnalyticsView('growth')}
                  className={analyticsView === 'growth' ? 'bg-gray-100' : ''}
                >
                  Growth Analytics
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setAnalyticsView('map')}
                  className={analyticsView === 'map' ? 'bg-gray-100' : ''}
                >
                  Map View
                </Button>
              </div>
            )}
            {isAdmin && (
              <Button onClick={handleCreateTerritory} className="bg-conve-red hover:bg-conve-red/90">
                <Plus className="h-4 w-4 mr-2" /> Add Territory
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="active" onValueChange={(value) => {
          setCurrentTab(value);
          // Reset to list view when switching tabs unless it's the "all" tab
          if (value !== "all") {
            setAnalyticsView('list');
          }
        }}>
          <TabsList className="mb-6">
            <TabsTrigger value="active">Active Territories</TabsTrigger>
            <TabsTrigger value="available">Available Territories</TabsTrigger>
            <TabsTrigger value="all">All Territories</TabsTrigger>
          </TabsList>
          
          <TabsContent value={currentTab} className="space-y-4">
            {currentTab !== "all" || analyticsView === 'list' ? (
              <TerritoryList
                territories={filteredTerritories}
                franchiseOwners={franchiseOwners}
                isAdmin={isAdmin}
                isLoading={isLoading}
                onEditTerritory={handleEditTerritory}
                onAssignTerritory={handleAssignTerritory}
              />
            ) : analyticsView === 'growth' ? (
              <TerritoryGrowthChart territories={territories} />
            ) : (
              <TerritoryMap territories={territories} />
            )}
          </TabsContent>
        </Tabs>
        
        {/* Territory Form Dialog */}
        <TerritoryFormDialog
          isOpen={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          territory={currentTerritory}
          formMode={formMode}
          onTerritoryChange={setCurrentTerritory}
          onSubmit={handleSubmit}
        />
      </CardContent>
    </Card>
  );
};

export default TerritoryManagement;
