
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { useNotifications } from '@/contexts/NotificationsContext';
import { PatientArrival } from './PatientArrivalTypes';
import React from 'react';

export const usePatientArrivals = () => {
  const { addNotification } = useNotifications();
  const [patients, setPatients] = useState<PatientArrival[]>([
    {
      id: '1',
      patientName: 'James Wilson',
      appointmentTime: '10:30 AM',
      status: 'waiting',
      location: '123 Main St, Orlando, FL',
      estimatedArrival: '10:25 AM'
    },
    {
      id: '2',
      patientName: 'Emily Davis',
      appointmentTime: '11:45 AM',
      status: 'arrived',
      arrivalTime: '11:40 AM',
      location: '456 Park Ave, Orlando, FL'
    },
    {
      id: '3',
      patientName: 'Michael Brown',
      appointmentTime: '1:15 PM',
      status: 'in-progress',
      arrivalTime: '1:10 PM',
      location: '789 Oak St, Orlando, FL'
    }
  ]);

  const getStatusBadge = (status: PatientArrival['status']) => {
    switch (status) {
      case 'waiting':
        return <Badge variant="outline" className="bg-slate-100">Waiting</Badge>;
      case 'arrived':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Arrived</Badge>;
      case 'checked-in':
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Checked In</Badge>;
      case 'in-progress':
        return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">In Progress</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Completed</Badge>;
    }
  };

  const handlePatientArrival = (id: string) => {
    // Simulate a patient arriving
    const updatedPatients = patients.map(patient => 
      patient.id === id ? { 
        ...patient, 
        status: 'arrived' as const, 
        arrivalTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
      } : patient
    );
    
    setPatients(updatedPatients);
    
    const patient = patients.find(p => p.id === id);
    if (patient) {
      addNotification({
        type: 'patient',
        title: 'Patient Arrived',
        message: `${patient.patientName} has arrived for their ${patient.appointmentTime} appointment.`,
        priority: 'medium',
      });
    }
  };

  const handleStatusChange = (id: string, newStatus: PatientArrival['status']) => {
    const updatedPatients = patients.map(patient => 
      patient.id === id ? { ...patient, status: newStatus } : patient
    );
    
    setPatients(updatedPatients);
    
    const patient = updatedPatients.find(p => p.id === id);
    if (patient && newStatus === 'completed') {
      addNotification({
        type: 'patient',
        title: 'Appointment Completed',
        message: `${patient.patientName}'s appointment has been marked as completed.`,
        priority: 'low',
      });
    }
  };

  // Demo function to simulate a patient arriving
  const simulatePatientArrival = () => {
    const waitingPatient = patients.find(p => p.status === 'waiting');
    if (waitingPatient) {
      handlePatientArrival(waitingPatient.id);
    }
  };

  return {
    patients,
    getStatusBadge,
    handlePatientArrival,
    handleStatusChange,
    simulatePatientArrival
  };
};
