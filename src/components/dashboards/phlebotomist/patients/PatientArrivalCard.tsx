
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, Clock, MapPin } from 'lucide-react';
import { PatientArrival } from './PatientArrivalTypes';

interface PatientArrivalCardProps {
  patient: PatientArrival;
  onPatientArrival: (id: string) => void;
  onStatusChange: (id: string, status: PatientArrival['status']) => void;
  getStatusBadge: (status: PatientArrival['status']) => React.ReactNode;
}

export const PatientArrivalCard: React.FC<PatientArrivalCardProps> = ({ 
  patient, 
  onPatientArrival, 
  onStatusChange,
  getStatusBadge
}) => {
  return (
    <div className="border rounded-md p-3">
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <div className="font-medium">{patient.patientName}</div>
          <div className="flex items-center text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5 mr-1" /> Appointment: {patient.appointmentTime}
          </div>
          <div className="flex items-center text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 mr-1" /> {patient.location}
          </div>
          {patient.status === 'waiting' && patient.estimatedArrival && (
            <div className="text-sm text-blue-600">
              Est. arrival: {patient.estimatedArrival}
            </div>
          )}
          {patient.status !== 'waiting' && patient.arrivalTime && (
            <div className="text-sm text-green-600">
              Arrived at: {patient.arrivalTime}
            </div>
          )}
        </div>
        
        <div className="flex flex-col items-end gap-2">
          <div>{getStatusBadge(patient.status)}</div>
          
          {patient.status === 'waiting' && (
            <Button 
              variant="outline" 
              size="sm" 
              className="text-xs" 
              onClick={() => onPatientArrival(patient.id)}
            >
              Mark Arrived
            </Button>
          )}
          
          {patient.status === 'arrived' && (
            <Button 
              variant="outline" 
              size="sm" 
              className="text-xs" 
              onClick={() => onStatusChange(patient.id, 'in-progress')}
            >
              Start Appointment
            </Button>
          )}
          
          {patient.status === 'in-progress' && (
            <Button 
              variant="outline" 
              size="sm" 
              className="text-xs bg-green-50 border-green-200 text-green-700 hover:bg-green-100" 
              onClick={() => onStatusChange(patient.id, 'completed')}
            >
              <CheckCircle className="h-3 w-3 mr-1" /> Complete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
