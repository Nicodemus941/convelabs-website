
import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Clock, Upload, Home, Building } from "lucide-react";
import { useEmailNotifications } from "@/hooks/useEmailNotifications";
import { toast } from "@/components/ui/sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const AppointmentScheduling = () => {
  const [date, setDate] = useState<Date | undefined>();
  const [appointmentTime, setAppointmentTime] = useState<string>("");
  const [location, setLocation] = useState<"in-home" | "in-office">("in-office");
  const [formData, setFormData] = useState({
    patientName: "",
    patientDOB: "",
    patientEmail: "",
    patientPhone: "",
    patientAddress: "",
    notes: ""
  });
  const [uploading, setUploading] = useState(false);
  const [fileUploaded, setFileUploaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { sendAppointmentConfirmationEmail } = useEmailNotifications();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileUpload = () => {
    setUploading(true);
    // Simulate file upload
    setTimeout(() => {
      setUploading(false);
      setFileUploaded(true);
      toast.success("Lab order uploaded successfully");
    }, 1500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!fileUploaded) {
      toast.error("Please upload a lab order");
      return;
    }

    if (!date || !appointmentTime) {
      toast.error("Please select a date and time");
      return;
    }

    setIsSubmitting(true);

    // Simulate API call
    setTimeout(() => {
      // Simulate appointment ID from server
      const appointmentId = "APT-" + Math.floor(Math.random() * 10000);
      
      // Send confirmation email
      sendAppointmentConfirmationEmail(appointmentId).then(() => {
        toast.success("Appointment scheduled successfully!");
        
        // Reset form
        setFormData({
          patientName: "",
          patientDOB: "",
          patientEmail: "",
          patientPhone: "",
          patientAddress: "",
          notes: ""
        });
        setDate(undefined);
        setAppointmentTime("");
        setFileUploaded(false);
        setIsSubmitting(false);
      });
    }, 1500);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule Lab Appointment</CardTitle>
        <CardDescription>Schedule a lab draw appointment for your patient</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <h3 className="font-medium text-lg">Patient Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Patient Name</label>
                <Input
                  name="patientName"
                  placeholder="Full name"
                  required
                  value={formData.patientName}
                  onChange={handleInputChange}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Date of Birth</label>
                <Input
                  name="patientDOB"
                  placeholder="MM/DD/YYYY"
                  required
                  value={formData.patientDOB}
                  onChange={handleInputChange}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  name="patientEmail"
                  type="email"
                  placeholder="patient@example.com"
                  required
                  value={formData.patientEmail}
                  onChange={handleInputChange}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Phone</label>
                <Input
                  name="patientPhone"
                  placeholder="(555) 123-4567"
                  required
                  value={formData.patientPhone}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Address</label>
              <Input
                name="patientAddress"
                placeholder="Full address"
                required={location === "in-home"}
                value={formData.patientAddress}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium text-lg">Lab Order</h3>
            
            <div className="border rounded-md p-4 flex flex-col items-center justify-center bg-muted/20">
              {!fileUploaded ? (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-2">Upload lab order (PDF or image)</p>
                  <Button 
                    type="button" 
                    onClick={handleFileUpload}
                    disabled={uploading}
                  >
                    {uploading ? "Uploading..." : "Upload File"}
                  </Button>
                </>
              ) : (
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center">
                    <div className="bg-green-100 p-2 rounded-full mr-2">
                      <Upload className="h-4 w-4 text-green-600" />
                    </div>
                    <span>Lab_Order.pdf</span>
                  </div>
                  <Button 
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFileUploaded(false)}
                  >
                    Replace
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium text-lg">Appointment Details</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Service Location</label>
                <div className="flex gap-2">
                  <Button 
                    type="button"
                    variant={location === "in-office" ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => setLocation("in-office")}
                  >
                    <Building className="h-4 w-4 mr-2" /> In-Office
                  </Button>
                  <Button 
                    type="button"
                    variant={location === "in-home" ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => setLocation("in-home")}
                  >
                    <Home className="h-4 w-4 mr-2" /> In-Home
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Preferred Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={setDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Preferred Time</label>
                <div className="flex gap-2 items-center">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Select value={appointmentTime} onValueChange={setAppointmentTime}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="8:00 AM">8:00 AM</SelectItem>
                      <SelectItem value="9:00 AM">9:00 AM</SelectItem>
                      <SelectItem value="10:00 AM">10:00 AM</SelectItem>
                      <SelectItem value="11:00 AM">11:00 AM</SelectItem>
                      <SelectItem value="12:00 PM">12:00 PM</SelectItem>
                      <SelectItem value="1:00 PM">1:00 PM</SelectItem>
                      <SelectItem value="2:00 PM">2:00 PM</SelectItem>
                      <SelectItem value="3:00 PM">3:00 PM</SelectItem>
                      <SelectItem value="4:00 PM">4:00 PM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Additional Notes</label>
              <Textarea 
                name="notes"
                placeholder="Any special instructions or notes for the phlebotomist"
                value={formData.notes}
                onChange={handleInputChange}
              />
            </div>
          </div>
          
          <div className="flex justify-end">
            <Button type="submit" className="luxury-button" disabled={isSubmitting}>
              {isSubmitting ? "Scheduling..." : "Schedule Appointment"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default AppointmentScheduling;
