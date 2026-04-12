
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import DashboardWrapper from "@/components/dashboards/DashboardWrapper";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ArrowLeft, Check, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";

type Service = {
  id: string;
  name: string;
  description: string | null;
  is_included_in_membership: boolean;
  is_addon: boolean;
  addon_price: number | null;
  icon_name: string | null;
  category: {
    name: string;
  } | null;
};

const ServiceDetails = () => {
  const { serviceId } = useParams<{ serviceId: string }>();
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchServiceDetails = async () => {
      if (!serviceId) return;

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("services")
          .select(`*, category:category_id(name)`)
          .eq("id", serviceId)
          .single();

        if (error) throw error;
        setService(data);
      } catch (err: any) {
        console.error("Error fetching service details:", err);
        setError("Failed to load service details. Please try again later.");
        toast.error("Could not load service details");
      } finally {
        setLoading(false);
      }
    };

    fetchServiceDetails();
  }, [serviceId]);

  if (loading) {
    return (
      <DashboardWrapper>
        <div className="container mx-auto py-12 px-4">
          <div className="flex justify-center items-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-conve-red" />
          </div>
        </div>
      </DashboardWrapper>
    );
  }

  if (error || !service) {
    return (
      <DashboardWrapper>
        <div className="container mx-auto py-12 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-2xl font-bold mb-4">Service Not Found</h1>
            <p className="text-gray-500 mb-6">{error || "This service does not exist or has been removed."}</p>
            <Button asChild>
              <Link to="/pricing">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Pricing
              </Link>
            </Button>
          </div>
        </div>
      </DashboardWrapper>
    );
  }

  return (
    <DashboardWrapper>
      <div className="container mx-auto py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <Button variant="outline" className="mb-6" asChild>
            <Link to="/pricing">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Pricing
            </Link>
          </Button>

          <Card className="overflow-hidden">
            <div className="bg-muted p-6">
              <div className="flex items-center gap-3 mb-2">
                {service.category && (
                  <Badge variant="outline" className="bg-secondary/50">
                    {service.category.name}
                  </Badge>
                )}
                {service.is_included_in_membership ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <Check className="h-3 w-3 mr-1" /> Included in Membership
                  </Badge>
                ) : service.is_addon ? (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    <Plus className="h-3 w-3 mr-1" /> Add-on Service
                  </Badge>
                ) : null}
              </div>
              <h1 className="text-3xl font-bold">{service.name}</h1>
            </div>
            
            <CardContent className="p-6">
              <div className="prose max-w-none">
                {service.description ? (
                  <p className="text-lg leading-relaxed">{service.description}</p>
                ) : (
                  <p className="text-lg text-muted-foreground">
                    This premium service is designed to provide you with the highest quality care and 
                    convenience. Our professional team ensures that all procedures are conducted with
                    the utmost attention to safety and comfort.
                  </p>
                )}

                <h2 className="text-xl font-semibold mt-8 mb-4">Benefits</h2>
                <ul className="space-y-2">
                  <li className="flex items-start">
                    <Check className="h-5 w-5 text-green-600 mr-2 mt-0.5" />
                    <span>Conducted by certified medical professionals</span>
                  </li>
                  <li className="flex items-start">
                    <Check className="h-5 w-5 text-green-600 mr-2 mt-0.5" />
                    <span>Flexible scheduling to fit your busy lifestyle</span>
                  </li>
                  <li className="flex items-start">
                    <Check className="h-5 w-5 text-green-600 mr-2 mt-0.5" />
                    <span>Results delivered securely to your personal dashboard</span>
                  </li>
                  <li className="flex items-start">
                    <Check className="h-5 w-5 text-green-600 mr-2 mt-0.5" />
                    <span>Full compliance with medical standards and regulations</span>
                  </li>
                </ul>

                {service.is_addon && service.addon_price && (
                  <div className="mt-8 p-4 bg-muted rounded-lg">
                    <h3 className="font-semibold mb-2">Add-on Pricing</h3>
                    <p className="text-lg">
                      <span className="font-bold">${(service.addon_price / 100).toFixed(2)}</span>{" "}
                      <span className="text-muted-foreground">per appointment</span>
                    </p>
                  </div>
                )}

                <div className="mt-8">
                  <h3 className="text-xl font-semibold mb-4">Get Started</h3>
                  <p className="mb-6">
                    Ready to experience premium healthcare service? Choose a membership plan that
                    includes this service or add it to your existing plan.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <Button asChild>
                      <Link to="/pricing">View Membership Plans</Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link to="/dashboard">Schedule Appointment</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardWrapper>
  );
};

export default ServiceDetails;
