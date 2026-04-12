
import React from "react";
import { Link } from "react-router-dom";
import { 
  Droplet, 
  Building, 
  Activity, 
  Clock, 
  Zap, 
  Syringe, 
  Droplets, 
  Box, 
  Baby, 
  FileSearch, 
  IdCard, 
  Package 
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Service {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  slug: string;
}

const services: Service[] = [
  {
    id: "at-home-blood-draws",
    title: "At-Home Blood Draws",
    description: "White-glove lab collection at your location.",
    icon: <Droplet className="h-6 w-6 text-conve-red" />,
    slug: "at-home-blood-draws"
  },
  {
    id: "in-office-blood-draws",
    title: "In-Office Blood Draws",
    description: "Scheduled appointments at your workplace or office.",
    icon: <Building className="h-6 w-6 text-conve-red" />,
    slug: "in-office-blood-draws"
  },
  {
    id: "routine-lab-draws",
    title: "Routine Lab Draws",
    description: "Ongoing panels and doctor-requested tests.",
    icon: <Activity className="h-6 w-6 text-conve-red" />,
    slug: "routine-lab-draws"
  },
  {
    id: "fasting-labs",
    title: "Fasting Labs",
    description: "Seamless early-morning appointments.",
    icon: <Clock className="h-6 w-6 text-conve-red" />,
    slug: "fasting-labs"
  },
  {
    id: "stat-blood-draws",
    title: "STAT Blood Draws",
    description: "Priority processing and urgent collections.",
    icon: <Zap className="h-6 w-6 text-conve-red" />,
    slug: "stat-blood-draws"
  },
  {
    id: "therapeutic-phlebotomy",
    title: "Therapeutic Phlebotomy",
    description: "Physician-authorized blood reduction therapy.",
    icon: <Syringe className="h-6 w-6 text-conve-red" />,
    slug: "therapeutic-phlebotomy"
  },
  {
    id: "urine-collections",
    title: "Urine Collections",
    description: "Routine and specialty urine test pickups.",
    icon: <Droplets className="h-6 w-6 text-conve-red" />,
    slug: "urine-collections"
  },
  {
    id: "stool-sample-collection",
    title: "Stool Sample Collection",
    description: "Container drop-off and sample return coordination.",
    icon: <Box className="h-6 w-6 text-conve-red" />,
    slug: "stool-sample-collection"
  },
  {
    id: "glucose-pregnancy-tests",
    title: "Glucose Pregnancy Tests",
    description: "On-site gestational glucose monitoring.",
    icon: <Baby className="h-6 w-6 text-conve-red" />,
    slug: "glucose-pregnancy-tests"
  },
  {
    id: "genetic-test-kit-processing",
    title: "Genetic Test Kit Processing",
    description: "We collect, prep, and ship to labs like Genomind, Invitae, etc.",
    icon: <FileSearch className="h-6 w-6 text-conve-red" />,
    slug: "genetic-test-kit-processing"
  },
  {
    id: "life-insurance-exam-labs",
    title: "Life Insurance Exam Labs",
    description: "VIP service for approved life insurance companies.",
    icon: <IdCard className="h-6 w-6 text-conve-red" />,
    slug: "life-insurance-exam-labs"
  },
  {
    id: "specialty-kit-shipping",
    title: "Specialty Kit Shipping",
    description: "Centrifuge and same-day FedEx/UPS drop-off.",
    icon: <Package className="h-6 w-6 text-conve-red" />,
    slug: "specialty-kit-shipping"
  },
];

export const ServiceGrid = () => {
  return (
    <div className="my-16 animate-fade-in">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold mb-4">Our Premium Services</h2>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Our membership includes access to a comprehensive range of high-quality lab services, delivered with white-glove care.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {services.map((service) => (
          <Link 
            key={service.id} 
            to={`/services/${service.slug}`} 
            className="block h-full"
          >
            <Card className="h-full transition-all duration-300 hover:shadow-md hover:-translate-y-1 cursor-pointer">
              <CardContent className="pt-6 flex flex-col h-full">
                <div className="flex items-start mb-4">
                  <div className="bg-primary/5 p-3 rounded-lg mr-4">
                    {service.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{service.title}</h3>
                    <p className="text-muted-foreground">{service.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
};

export { services };
