
import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";

const ConciergeDoctorSignup: React.FC = () => {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const [formData, setFormData] = useState({
    practiceName: "",
    fullName: "",
    email: "",
    phone: "",
    numPatients: "25",
    additionalInfo: "",
    password: "",
    confirmPassword: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Handle select changes
  const handleSelectChange = (value: string) => {
    setFormData((prev) => ({ ...prev, numPatients: value }));
  };

  // Calculate estimated monthly cost
  const calculateMonthlyCost = () => {
    const patientCount = parseInt(formData.numPatients);
    return patientCount * 80; // $80 per patient
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // If user is not logged in, create an account first
      if (!user) {
        if (formData.password !== formData.confirmPassword) {
          toast.error("Passwords do not match");
          setIsSubmitting(false);
          return;
        }

        // Create user account
        const { error: signUpError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.fullName,
              practice_name: formData.practiceName,
              user_type: "concierge_doctor",
              phone: formData.phone,
            },
          },
        });

        if (signUpError) {
          throw new Error(signUpError.message);
        }

        toast.success("Account created successfully!");
      }

      // Create checkout session
      const { data, error } = await supabase.functions.invoke("create-concierge-checkout", {
        body: {
          practiceName: formData.practiceName,
          fullName: formData.fullName,
          email: user ? user.email : formData.email,
          phone: formData.phone,
          numPatients: parseInt(formData.numPatients),
          additionalInfo: formData.additionalInfo,
        },
      });

      if (error) throw new Error(error.message);

      // Redirect to Stripe checkout
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned from server");
      }
    } catch (error: any) {
      console.error("Error during signup:", error);
      toast.error(error.message || "An error occurred during signup");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Concierge Doctor Enrollment | ConveLabs</title>
        <meta name="description" content="Enroll as a concierge doctor and provide premium lab services to your patients." />
      </Helmet>

      <Header />

      <Container className="py-12">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold">Concierge Doctor Enrollment</h1>
            <p className="text-gray-600 mt-2">
              Join our network of concierge physicians providing premium lab services to their patients
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Practice Information</CardTitle>
              <CardDescription>
                Complete the form below to enroll your practice. You'll be redirected to our secure payment system to complete your enrollment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="practiceName">Practice Name</Label>
                    <Input
                      id="practiceName"
                      name="practiceName"
                      value={formData.practiceName}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="fullName">Physician Name</Label>
                    <Input
                      id="fullName"
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={user ? user.email : formData.email}
                        onChange={handleChange}
                        required
                        disabled={!!user}
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>

                  {!user && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="password">Password</Label>
                        <Input
                          id="password"
                          name="password"
                          type="password"
                          value={formData.password}
                          onChange={handleChange}
                          required={!user}
                        />
                      </div>
                      <div>
                        <Label htmlFor="confirmPassword">Confirm Password</Label>
                        <Input
                          id="confirmPassword"
                          name="confirmPassword"
                          type="password"
                          value={formData.confirmPassword}
                          onChange={handleChange}
                          required={!user}
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="numPatients">Number of Patients</Label>
                    <Select
                      value={formData.numPatients}
                      onValueChange={handleSelectChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select number of patients" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5 patients</SelectItem>
                        <SelectItem value="10">10 patients</SelectItem>
                        <SelectItem value="25">25 patients</SelectItem>
                        <SelectItem value="50">50 patients</SelectItem>
                        <SelectItem value="75">75 patients</SelectItem>
                        <SelectItem value="100">100 patients</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="additionalInfo">Additional Information</Label>
                    <Textarea
                      id="additionalInfo"
                      name="additionalInfo"
                      value={formData.additionalInfo}
                      onChange={handleChange}
                      rows={4}
                      placeholder="Tell us about your practice and how you plan to use our services..."
                    />
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700 font-medium">Monthly Cost:</span>
                    <span className="text-xl font-bold">${calculateMonthlyCost()}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Based on {formData.numPatients} patients at $80 per patient per month.
                    Each patient gets 12 lab services per year.
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Processing..." : "Proceed to Payment"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </Container>

      <Footer />
    </>
  );
};

export default ConciergeDoctorSignup;
