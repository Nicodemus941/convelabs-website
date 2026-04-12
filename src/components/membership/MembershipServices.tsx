
import React, { useState, useEffect } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Check, Plus, ChevronRight } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Icons } from "@/components/ui/icons";
import { Link } from "react-router-dom";

type Service = {
  id: string;
  name: string;
  description: string | null;
  is_included_in_membership: boolean;
  is_addon: boolean;
  addon_price: number | null;
  icon_name: string | null;
  display_order: number;
};

type ServiceCategory = {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  services?: Service[];
};

const MembershipServices = () => {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        // Fetch categories
        const { data: categoriesData, error: categoriesError } = await supabase
          .from("service_categories")
          .select("*")
          .order("display_order", { ascending: true });

        if (categoriesError) throw categoriesError;

        // Fetch services
        const { data: servicesData, error: servicesError } = await supabase
          .from("services")
          .select("*")
          .order("display_order", { ascending: true });

        if (servicesError) throw servicesError;

        // Organize services by category
        const categoriesWithServices = categoriesData.map((category) => ({
          ...category,
          services: servicesData.filter((service) => service.category_id === category.id),
        }));

        setCategories(categoriesWithServices);
      } catch (err) {
        console.error("Error fetching services:", err);
        setError("Failed to load services. Please try again later.");
        // Fix: Using toast with the correct format for the sonner library
        toast.error("Failed to load membership services. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchServices();
  }, []);

  // Helper function to render the appropriate icon for a service
  const renderIcon = (iconName: string | null) => {
    if (!iconName) return null;
    
    const IconComponent = (Icons as any)[iconName] || null;
    
    if (IconComponent) {
      return <IconComponent className="h-5 w-5 mr-2 text-conve-red" />;
    }
    
    return null;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-10">
        <Loader2 className="h-8 w-8 animate-spin text-conve-red" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-6 text-red-500">
        <p>{error}</p>
        <Button onClick={() => window.location.reload()} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <Card className="mt-8">
      <CardContent className="pt-6">
        <h2 className="text-2xl font-semibold mb-4">Membership Services</h2>
        <p className="text-gray-500 mb-6">
          The following services are available with your membership plan:
        </p>

        <Accordion type="single" collapsible className="w-full">
          {categories.map((category) => (
            <AccordionItem key={category.id} value={category.id}>
              <AccordionTrigger className="text-lg font-medium">
                {category.name}
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pl-2">
                  {category.services?.map((service) => (
                    <div
                      key={service.id}
                      className="flex items-start justify-between p-2 border-b border-gray-100 last:border-0"
                    >
                      <div className="flex items-start">
                        <div className="mt-0.5">
                          {renderIcon(service.icon_name)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-base">{service.name}</h4>
                            {service.is_included_in_membership ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                <Check className="h-3 w-3 mr-1" /> Included
                              </Badge>
                            ) : service.is_addon ? (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                <Plus className="h-3 w-3 mr-1" /> Add-on
                              </Badge>
                            ) : null}
                          </div>
                          {service.description && (
                            <p className="text-sm text-gray-500 mt-1">{service.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center">
                        {service.is_addon && service.addon_price && (
                          <div className="text-right mr-4">
                            <span className="font-medium">${(service.addon_price / 100).toFixed(2)}</span>
                            <p className="text-xs text-gray-500">per appointment</p>
                          </div>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          asChild
                          className="text-primary hover:text-primary-600"
                        >
                          <Link to={`/service/${service.id}`}>
                            Details <ChevronRight className="h-4 w-4 ml-1" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
};

export default MembershipServices;
