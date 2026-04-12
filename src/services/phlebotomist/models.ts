
// If this already exists, this will only ensure these interfaces are added
export interface PhlebotomistSchedule {
  id: string;
  phlebotomist_id: string;
  date: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
  service_area_ids?: string[];
}

export interface AppointmentWithCoordinates {
  id: string;
  patient_id: string;
  appointment_date: string;
  address: string;
  zipcode: string;
  status: string;
  latitude: number;
  longitude: number;
  phlebotomist_id?: string;
  estimated_travel_time?: number;
}

export interface ServiceArea {
  id: string;
  name: string;
  zipcode_list: string[];
  description?: string;
  is_active: boolean;
}

export interface TimeRange {
  start: Date;
  end: Date;
}
