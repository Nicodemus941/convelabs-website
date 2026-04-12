import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useStaffProfiles, StaffProfile } from "@/hooks/useStaffProfiles";
import { usePayroll } from "@/hooks/usePayroll";
import { format } from 'date-fns';
import { CalendarDays, Clock, DollarSign, FileText, Loader2, ShieldCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import PaymentMethodsTab from '../../staff/payroll/PaymentMethodsTab';
import WorkHoursTab from '../../staff/payroll/WorkHoursTab';

const ProfileTab = () => {
  const { user } = useAuth();
  const { getStaffProfileByUserId, updateStaffProfile } = useStaffProfiles();
  const { payrollEntries, fetchPayrollEntries, isLoading: payrollLoading } = usePayroll();

  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form fields
  const [specialty, setSpecialty] = useState("");
  const [emergencyContact, setEmergencyContact] = useState({
    name: "",
    phone: "",
    relationship: ""
  });

  const [activeSection, setActiveSection] = useState("profile");

  useEffect(() => {
    const loadProfile = async () => {
      if (user?.id) {
        const profile = getStaffProfileByUserId(user.id);
        setStaffProfile(profile || null);
        
        // Initialize form fields
        if (profile) {
          setSpecialty(profile.specialty || "");
          setEmergencyContact({
            name: profile.emergency_contact_name || "",
            phone: profile.emergency_contact_phone || "",
            relationship: profile.emergency_contact_relationship || ""
          });
          
          // Load payroll data
          await fetchPayrollEntries(undefined, profile.id);
        }
        
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [user, getStaffProfileByUserId, fetchPayrollEntries]);

  const handleSaveProfile = async () => {
    if (!staffProfile) return;
    
    setIsSaving(true);
    try {
      await updateStaffProfile(staffProfile.id, {
        specialty,
        emergency_contact_name: emergencyContact.name,
        emergency_contact_phone: emergencyContact.phone,
        emergency_contact_relationship: emergencyContact.relationship
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Format currency for display
  const formatCurrency = (cents: number | null) => {
    if (cents === null) return "N/A";
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsList>
          <TabsTrigger value="profile" className="flex items-center">
            <FileText className="mr-2 h-4 w-4" />
            Profile Info
          </TabsTrigger>
          <TabsTrigger value="hours" className="flex items-center">
            <Clock className="mr-2 h-4 w-4" />
            Work Hours
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center">
            <DollarSign className="mr-2 h-4 w-4" />
            Payment History
          </TabsTrigger>
          <TabsTrigger value="methods" className="flex items-center">
            <CalendarDays className="mr-2 h-4 w-4" />
            Payment Methods
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="profile" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Personal Details</CardTitle>
              <CardDescription>
                Update your profile information and emergency contacts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="name">Full Name</Label>
                      <Input 
                        id="name" 
                        value={staffProfile?.user?.full_name || ""} 
                        disabled 
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Contact admin to update your name
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input 
                        id="email" 
                        value={staffProfile?.user?.email || ""} 
                        disabled 
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Contact admin to update your email
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="specialty">Specialty</Label>
                      <Input 
                        id="specialty" 
                        value={specialty}
                        onChange={(e) => setSpecialty(e.target.value)}
                        placeholder="e.g. Geriatric, Pediatric"
                      />
                    </div>
                    <div>
                      <Label htmlFor="hire-date">Hired Date</Label>
                      <Input 
                        id="hire-date" 
                        value={staffProfile?.hired_date ? 
                          format(new Date(staffProfile.hired_date), 'yyyy-MM-dd') : 
                          ""
                        } 
                        disabled 
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="font-medium">Payment Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label>Base Pay Rate</Label>
                        <div className="h-10 px-3 py-2 border rounded-md bg-gray-50">
                          {formatCurrency(staffProfile?.pay_rate || 0)} {
                            staffProfile?.user?.role === 'phlebotomist' ? 
                              'per appointment' : 'per hour'
                          }
                        </div>
                      </div>
                      {staffProfile?.premium_pay_rate && (
                        <div>
                          <Label>Premium Pay Rate</Label>
                          <div className="h-10 px-3 py-2 border rounded-md bg-gray-50">
                            {formatCurrency(staffProfile.premium_pay_rate)} {
                              staffProfile.user?.role === 'phlebotomist' ? 
                                'per appointment' : 'per hour'
                            }
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="font-medium">Emergency Contact</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="emergency-name">Name</Label>
                        <Input 
                          id="emergency-name" 
                          value={emergencyContact.name}
                          onChange={(e) => setEmergencyContact({
                            ...emergencyContact,
                            name: e.target.value
                          })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="emergency-phone">Phone</Label>
                        <Input 
                          id="emergency-phone" 
                          value={emergencyContact.phone}
                          onChange={(e) => setEmergencyContact({
                            ...emergencyContact,
                            phone: e.target.value
                          })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="emergency-relationship">Relationship</Label>
                        <Input 
                          id="emergency-relationship" 
                          value={emergencyContact.relationship}
                          onChange={(e) => setEmergencyContact({
                            ...emergencyContact,
                            relationship: e.target.value
                          })}
                          placeholder="e.g. Spouse, Parent, Sibling"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end">
                    <Button 
                      onClick={handleSaveProfile}
                      disabled={isSaving}
                    >
                      {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Changes
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="hours" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Work Hours</CardTitle>
              <CardDescription>
                Track your work hours and view your history
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : (
                <WorkHoursTab staffProfile={staffProfile} isAdmin={false} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="payments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
              <CardDescription>
                View your payment history and upcoming payments
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading || payrollLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : payrollEntries.length === 0 ? (
                <div className="text-center py-6">
                  <DollarSign className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-lg font-medium">No payment history yet</h3>
                  <p className="text-gray-500">Your payments will appear here once processed</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-4 font-medium">Period</th>
                          <th className="text-left py-3 px-4 font-medium">Amount</th>
                          <th className="text-left py-3 px-4 font-medium">Details</th>
                          <th className="text-left py-3 px-4 font-medium">Status</th>
                          <th className="text-left py-3 px-4 font-medium">Payment Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payrollEntries.map(entry => (
                          <tr key={entry.id} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-4">
                              {entry.payroll_period ? (
                                <div>
                                  <div>{format(new Date(entry.payroll_period.period_start), 'MMM d')} - {format(new Date(entry.payroll_period.period_end), 'MMM d, yyyy')}</div>
                                </div>
                              ) : (
                                "Unknown Period"
                              )}
                            </td>
                            <td className="py-3 px-4 font-medium">
                              {formatCurrency(entry.amount)}
                            </td>
                            <td className="py-3 px-4">
                              {entry.appointments_completed ? (
                                <div>{entry.appointments_completed} appointments</div>
                              ) : entry.hours_worked ? (
                                <div>{entry.hours_worked} hours</div>
                              ) : (
                                "N/A"
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span 
                                className={`inline-block px-2 py-1 rounded text-xs font-medium
                                  ${entry.status === 'paid' ? 'bg-green-100 text-green-800' :
                                    entry.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                                    entry.status === 'failed' ? 'bg-red-100 text-red-800' :
                                    'bg-yellow-100 text-yellow-800'}`
                                }
                              >
                                {entry.status}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {entry.payment_date ? format(new Date(entry.payment_date), 'MMM d, yyyy') : "Pending"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="methods" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Payment Methods</CardTitle>
              <CardDescription>
                Manage your payment methods
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : (
                <PaymentMethodsTab staffProfile={staffProfile} isAdmin={false} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProfileTab;
