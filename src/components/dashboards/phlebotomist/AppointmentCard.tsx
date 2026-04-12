
import React from "react";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, Camera, CheckCircle } from "lucide-react";
import { toast } from "@/components/ui/sonner";

export type AppointmentType = {
  id: string;
  patientName: string;
  patientId: string;
  time: string;
  address: string;
  orderStatus: string;
  orderFile: string;
  inventoryUsed?: {
    item: string;
    quantity: number;
  }[];
};

type AppointmentCardProps = {
  appointment: AppointmentType;
  isCompleted?: boolean;
  onStartAppointment?: (appointment: AppointmentType) => void;
};

const AppointmentCard: React.FC<AppointmentCardProps> = ({
  appointment,
  isCompleted = false,
  onStartAppointment
}) => {
  const handleGetDirections = (address: string) => {
    window.open(`https://maps.google.com?q=${encodeURIComponent(address)}`, '_blank');
    toast.success("Opening directions to patient location");
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-lg">{appointment.patientName}</h3>
            <span className="text-xs bg-muted px-2 py-1 rounded">
              {appointment.patientId}
            </span>
            {isCompleted && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <CheckCircle className="h-3 w-3 mr-1" /> Completed
              </span>
            )}
          </div>
          <p className="text-muted-foreground mb-2">
            {appointment.time}
          </p>
          <div className="space-y-1">
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{appointment.address}</span>
            </p>
            {!isCompleted && (
              <p>
                <span className="font-medium">Lab Order: </span>
                <Button variant="link" className="p-0 h-auto text-conve-red">
                  Download {appointment.orderFile}
                </Button>
              </p>
            )}
          </div>
          
          {isCompleted && appointment.inventoryUsed && (
            <div className="mt-4">
              <h4 className="font-medium text-sm mb-2">Inventory Used:</h4>
              <div className="grid grid-cols-2 gap-2">
                {appointment.inventoryUsed.map((item, index) => (
                  <div key={index} className="flex justify-between px-2 py-1 bg-muted/20 rounded text-sm">
                    <span>{item.item}</span>
                    <span className="font-medium">{item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {isCompleted && (
            <div className="mt-4 flex items-center gap-2">
              <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                <Camera className="h-6 w-6 text-muted-foreground" />
              </div>
              <span className="text-sm text-muted-foreground">2 photos captured</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {!isCompleted ? (
            <>
              <Button 
                className="luxury-button" 
                onClick={() => onStartAppointment && onStartAppointment(appointment)}
              >
                Start Appointment
              </Button>
              <Button 
                variant="outline"
                onClick={() => handleGetDirections(appointment.address)}
                className="flex items-center gap-2"
              >
                <Navigation className="h-4 w-4" /> Get Directions
              </Button>
            </>
          ) : (
            <Button variant="outline">
              View Details
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AppointmentCard;
