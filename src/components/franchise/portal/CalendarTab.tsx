
import React, { useState } from 'react';
import { Calendar as CalendarIcon, Clock, User, MapPin } from 'lucide-react';
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const appointmentTypes = [
  { id: '1', name: 'Services', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { id: '2', name: 'Staff Training', color: 'bg-green-100 text-green-800 border-green-300' },
  { id: '3', name: 'Territory Review', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { id: '4', name: 'Client Meetings', color: 'bg-amber-100 text-amber-800 border-amber-300' }
];

// Sample appointment data
const sampleAppointments = [
  { 
    id: '1', 
    title: 'Downtown Service',
    type: '1',
    staff: 'Jane Smith',
    location: 'Downtown Metro',
    time: '9:00 AM - 10:30 AM',
    date: new Date(2023, 4, 15)
  },
  { 
    id: '2', 
    title: 'Staff Training Session',
    type: '2',
    staff: 'All Staff',
    location: 'Main Office',
    time: '1:00 PM - 3:00 PM',
    date: new Date(2023, 4, 18)
  },
  { 
    id: '3', 
    title: 'Westside Territory Review',
    type: '3',
    staff: 'John Davis',
    location: 'Westside',
    time: '11:00 AM - 12:00 PM',
    date: new Date(2023, 4, 20)
  }
];

const CalendarTab = () => {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [view, setView] = useState<'day' | 'week' | 'month'>('month');
  
  // Filter appointments by selected date
  const filteredAppointments = date 
    ? sampleAppointments.filter(apt => 
        apt.date.getDate() === date.getDate() && 
        apt.date.getMonth() === date.getMonth() && 
        apt.date.getFullYear() === date.getFullYear()
      )
    : [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Franchise Calendar</h2>
        <div className="flex items-center space-x-2">
          <Select value={view} onValueChange={(value: 'day' | 'week' | 'month') => setView(value)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Select view" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
            </SelectContent>
          </Select>
          <Button>+ New Appointment</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Date Selection</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              className="rounded-md border"
            />
          </CardContent>
        </Card>
        
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle>{date ? date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Select a date'}</CardTitle>
            <CardDescription>
              {filteredAppointments.length} appointments scheduled
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredAppointments.length > 0 ? (
              <div className="space-y-4">
                {filteredAppointments.map((appointment) => {
                  const appointmentType = appointmentTypes.find(type => type.id === appointment.type);
                  
                  return (
                    <div key={appointment.id} className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-all">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-medium">{appointment.title}</div>
                        <Badge className={appointmentType?.color || ''}>
                          {appointmentType?.name || 'Other'}
                        </Badge>
                      </div>
                      
                      <div className="text-sm text-gray-500 space-y-1">
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-2" />
                          {appointment.time}
                        </div>
                        <div className="flex items-center">
                          <MapPin className="w-4 h-4 mr-2" />
                          {appointment.location}
                        </div>
                        <div className="flex items-center">
                          <User className="w-4 h-4 mr-2" />
                          {appointment.staff}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-gray-500">
                <CalendarIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No appointments</h3>
                <p className="mt-1 text-sm text-gray-500">No appointments scheduled for this date.</p>
                <div className="mt-6">
                  <Button>
                    Schedule an appointment
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CalendarTab;
