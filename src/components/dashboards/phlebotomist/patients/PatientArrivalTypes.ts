
export interface PatientArrival {
  id: string;
  patientName: string;
  appointmentTime: string;
  status: 'waiting' | 'arrived' | 'checked-in' | 'in-progress' | 'completed';
  arrivalTime?: string;
  location: string;
  estimatedArrival?: string;
}
