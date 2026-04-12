
import React from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";
import TerritoryManagement from "@/components/franchise/TerritoryManagement";
import FranchiseOwnerPortal from "@/components/franchise/FranchiseOwnerPortal";
import CrossTerritoryAnalytics from "@/components/franchise/CrossTerritoryAnalytics";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import ErrorBoundary from "@/components/ui/error-boundary";
import DashboardNavigation from "@/components/franchise/DashboardNavigation";

const FranchiseAdmin = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const handleBack = () => {
    navigate('/dashboard/super_admin');
  };
  
  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>ConveLabs Franchise Management</title>
        <meta
          name="description"
          content="Manage ConveLabs franchises, territories, and performance analytics."
        />
      </Helmet>

      <Header />

      <main className="container mx-auto px-4 py-12">
        <DashboardNavigation />
        
        <div className="mb-8 flex items-center gap-2">
          <Button variant="outline" onClick={handleBack} size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
          </Button>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">Franchise Management</h1>
            <p className="text-lg text-gray-600">
              Manage territories, franchisees, and analyze performance across markets.
            </p>
          </div>
        </div>
        
        <ErrorBoundary
          fallback={
            <div className="p-6 border border-red-200 bg-red-50 rounded-md">
              <h3 className="text-lg font-medium text-red-800">Error loading franchise management</h3>
              <p className="text-red-600">There was an error loading the franchise management interface. Please try again later.</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </div>
          }
        >
          <Tabs defaultValue="territories" className="mb-12">
            <TabsList>
              <TabsTrigger value="territories">Territory Management</TabsTrigger>
              <TabsTrigger value="portal">Franchise Owner Portal</TabsTrigger>
              <TabsTrigger value="analytics">Cross-Territory Analytics</TabsTrigger>
            </TabsList>
            
            <TabsContent value="territories" className="mt-6">
              <TerritoryManagement />
            </TabsContent>
            
            <TabsContent value="portal" className="mt-6">
              <FranchiseOwnerPortal />
            </TabsContent>
            
            <TabsContent value="analytics" className="mt-6">
              <CrossTerritoryAnalytics />
            </TabsContent>
          </Tabs>
        </ErrorBoundary>
      </main>

      <Footer />
    </div>
  );
};

export default FranchiseAdmin;
