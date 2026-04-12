
import React from "react";
import { useNavigate } from "react-router-dom";
import { CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Territory } from "@/hooks/franchise/useTerritory";

interface TerritoryInfoProps {
  territory: Territory | null;
  isLoading: boolean;
}

const TerritoryInfo: React.FC<TerritoryInfoProps> = ({ territory, isLoading }) => {
  const navigate = useNavigate();
  
  // Handle back button
  const handleBack = () => {
    navigate('/franchise-admin');
  };
  
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleBack}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Button>
      <div>
        <CardTitle className="text-xl">
          {isLoading ? (
            <Skeleton className="h-6 w-48" />
          ) : (
            `${territory?.name}, ${territory?.state}`
          )}
        </CardTitle>
        <CardDescription>Territory Performance Dashboard</CardDescription>
      </div>
    </div>
  );
};

export default TerritoryInfo;
