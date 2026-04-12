
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { User } from 'lucide-react';
import { PatientArrivalCard } from './patients/PatientArrivalCard';
import { PatientDemoControls } from './patients/PatientDemoControls';
import { usePatientArrivals } from './patients/usePatientArrivals';

export const PatientArrivalTracker = () => {
  const {
    patients,
    getStatusBadge,
    handlePatientArrival,
    handleStatusChange,
    simulatePatientArrival
  } = usePatientArrivals();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center">
          <User className="mr-2 h-5 w-5" /> Patient Arrival Tracker
        </CardTitle>
        <CardDescription>Monitor patient arrivals in real-time</CardDescription>
      </CardHeader>
      <CardContent>
        {patients.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No patients scheduled</p>
          </div>
        ) : (
          <div className="space-y-4">
            {patients.map((patient) => (
              <PatientArrivalCard 
                key={patient.id}
                patient={patient}
                onPatientArrival={handlePatientArrival}
                onStatusChange={handleStatusChange}
                getStatusBadge={getStatusBadge}
              />
            ))}
            
            <PatientDemoControls onSimulatePatientArrival={simulatePatientArrival} />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
