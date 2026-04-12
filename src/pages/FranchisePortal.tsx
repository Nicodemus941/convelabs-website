
import React from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";
import FranchiseOwnerPortal from "@/components/franchise/FranchiseOwnerPortal";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/ui/error-boundary";
import FranchiseDashboardNavigation from "@/components/franchise/FranchiseDashboardNavigation";
import { CircleDollarSign, FileText } from "lucide-react";

const FranchisePortal = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>ConveLabs Franchise Owner Portal</title>
        <meta
          name="description"
          content="Manage your ConveLabs franchise operations, staff, payroll, and performance metrics."
        />
      </Helmet>

      <Header />

      <main className="container mx-auto px-4 py-12">
        <FranchiseDashboardNavigation />
        
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">Franchise Owner Portal</h1>
              <p className="text-lg text-gray-600 mt-2">
                Manage your territories, staff, payroll, and franchise performance
              </p>
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline">
                Support Center
              </Button>
              <Button className="bg-conve-red hover:bg-conve-red/90">
                Resource Library
              </Button>
            </div>
          </div>
          
          {/* Quick Access Buttons */}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="outline" className="flex items-center gap-2 border-conve-gold text-conve-gold hover:bg-conve-gold/10">
              <CircleDollarSign className="h-4 w-4" /> Manage Payroll
            </Button>
            <Button variant="outline" className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Financial Reports
            </Button>
          </div>
        </div>
        
        <ErrorBoundary
          fallback={
            <div className="p-6 border border-red-200 bg-red-50 rounded-md">
              <h3 className="text-lg font-medium text-red-800">Error loading franchise owner portal</h3>
              <p className="text-red-600">There was an error loading the franchise owner portal. Please try again later.</p>
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
          <FranchiseOwnerPortal />
        </ErrorBoundary>
      </main>

      <Footer />
    </div>
  );
};

export default FranchisePortal;
