import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Building2, Users, Star, CheckCircle, CreditCard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Header from '@/components/home/Header';
import { createCorporateCheckout } from '@/services/stripe/corporateCheckout';
import { supabase } from '@/integrations/supabase/client';

interface CompanyInfo {
  companyName: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

const CorporateCheckout: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [billingFrequency, setBillingFrequency] = useState<'monthly' | 'annual'>('monthly');
  
  // Company information
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    companyName: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    city: '',
    state: '',
    zipCode: ''
  });
  
  // Seat configuration
  const [seats, setSeats] = useState(5);
  const [executiveSeats, setExecutiveSeats] = useState(0);

  const corporateSeatPrice = billingFrequency === 'monthly' ? 99 : 89; // 10% discount annually
  const executiveUpgradePrice = billingFrequency === 'monthly' ? 29 : 26; // 10% discount annually

  const totalMonthlyCost = (seats * corporateSeatPrice) + (executiveSeats * executiveUpgradePrice);
  const totalAnnualCost = totalMonthlyCost * 12;

  const handleCompanyInfoChange = (field: keyof CompanyInfo, value: string) => {
    setCompanyInfo(prev => ({ ...prev, [field]: value }));
  };

  const validateCompanyInfo = () => {
    const required = ['companyName', 'contactEmail', 'contactPhone', 'city', 'state'];
    const missing = required.filter(field => !companyInfo[field as keyof CompanyInfo]);
    
    if (missing.length > 0) {
      toast.error(`Please fill in: ${missing.join(', ')}`);
      return false;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(companyInfo.contactEmail)) {
      toast.error('Please enter a valid email address');
      return false;
    }
    
    return true;
  };

  const handleProceedToCheckout = async () => {
    if (!validateCompanyInfo()) return;
    
    setLoading(true);
    
    try {
      // Check if user is authenticated
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Please sign in to continue with corporate checkout');
        navigate('/login');
        return;
      }

      // Create or update tenant - use insert for new tenants
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: companyInfo.companyName,
          slug: companyInfo.companyName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          contact_email: companyInfo.contactEmail,
          contact_phone: companyInfo.contactPhone,
          corporate_overage_price: 15000 // $150 per service overage
        })
        .select()
        .single();

      if (tenantError) {
        console.error('Tenant creation error:', tenantError);
        toast.error('Failed to create company profile');
        return;
      }

      // Create corporate checkout session
      const checkoutResult = await createCorporateCheckout({
        tenantId: tenantData.id,
        seats,
        executiveSeats,
        billingFrequency,
        returnUrl: `${window.location.origin}/corporate-billing`
      });

      if (checkoutResult.error) {
        toast.error(checkoutResult.error);
        return;
      }

      if (checkoutResult.url) {
        // Redirect to Stripe checkout
        window.location.href = checkoutResult.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error('Failed to start checkout process');
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="font-playfair text-3xl font-bold mb-4 luxury-heading">
          Company Information
        </h2>
        <p className="text-gray-600">
          Tell us about your organization to get started
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="companyName">Company Name *</Label>
          <Input
            id="companyName"
            value={companyInfo.companyName}
            onChange={(e) => handleCompanyInfoChange('companyName', e.target.value)}
            placeholder="Your Company Inc."
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="contactEmail">Contact Email *</Label>
          <Input
            id="contactEmail"
            type="email"
            value={companyInfo.contactEmail}
            onChange={(e) => handleCompanyInfoChange('contactEmail', e.target.value)}
            placeholder="admin@yourcompany.com"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="contactPhone">Contact Phone *</Label>
          <Input
            id="contactPhone"
            type="tel"
            value={companyInfo.contactPhone}
            onChange={(e) => handleCompanyInfoChange('contactPhone', e.target.value)}
            placeholder="(555) 123-4567"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="address">Address</Label>
          <Input
            id="address"
            value={companyInfo.address}
            onChange={(e) => handleCompanyInfoChange('address', e.target.value)}
            placeholder="123 Business Blvd"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="city">City *</Label>
          <Input
            id="city"
            value={companyInfo.city}
            onChange={(e) => handleCompanyInfoChange('city', e.target.value)}
            placeholder="Orlando"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="state">State *</Label>
          <Input
            id="state"
            value={companyInfo.state}
            onChange={(e) => handleCompanyInfoChange('state', e.target.value)}
            placeholder="FL"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="zipCode">ZIP Code</Label>
          <Input
            id="zipCode"
            value={companyInfo.zipCode}
            onChange={(e) => handleCompanyInfoChange('zipCode', e.target.value)}
            placeholder="32801"
          />
        </div>
      </div>

      <div className="flex justify-end pt-6">
        <Button 
          onClick={() => setStep(2)}
          className="luxury-button px-8"
          disabled={!companyInfo.companyName || !companyInfo.contactEmail}
        >
          Continue to Seat Configuration
        </Button>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="font-playfair text-3xl font-bold mb-4 luxury-heading">
          Configure Your Seats
        </h2>
        <p className="text-gray-600">
          Choose the number of seats and billing frequency
        </p>
      </div>

      {/* Billing Frequency */}
      <Tabs value={billingFrequency} onValueChange={(value) => setBillingFrequency(value as 'monthly' | 'annual')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="monthly">Monthly Billing</TabsTrigger>
          <TabsTrigger value="annual">
            Annual Billing
            <Badge className="ml-2 bg-conve-gold text-white">Save 10%</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Seat Configuration */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="luxury-card border-2 border-conve-red/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-conve-red">
              <Users className="w-5 h-5" />
              Corporate Seats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">Number of Seats:</span>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSeats(Math.max(1, seats - 1))}
                  disabled={seats <= 1}
                >
                  -
                </Button>
                <span className="w-12 text-center font-bold">{seats}</span>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSeats(seats + 1)}
                >
                  +
                </Button>
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-conve-red">
                ${corporateSeatPrice} <span className="text-sm text-gray-500">per seat/{billingFrequency === 'monthly' ? 'month' : 'year'}</span>
              </div>
              {billingFrequency === 'annual' && (
                <p className="text-sm text-conve-gold">Save $10 per seat annually</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="luxury-card border-2 border-conve-gold/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-conve-gold">
              <Star className="w-5 h-5" />
              Executive Upgrades
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">Executive Seats:</span>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setExecutiveSeats(Math.max(0, executiveSeats - 1))}
                  disabled={executiveSeats <= 0}
                >
                  -
                </Button>
                <span className="w-12 text-center font-bold">{executiveSeats}</span>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setExecutiveSeats(Math.min(seats, executiveSeats + 1))}
                  disabled={executiveSeats >= seats}
                >
                  +
                </Button>
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-conve-gold">
                +${executiveUpgradePrice} <span className="text-sm text-gray-500">per upgrade/{billingFrequency === 'monthly' ? 'month' : 'year'}</span>
              </div>
              {billingFrequency === 'annual' && (
                <p className="text-sm text-conve-red">Save $3 per upgrade annually</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between pt-6">
        <Button 
          variant="outline"
          onClick={() => setStep(1)}
          className="px-8"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button 
          onClick={() => setStep(3)}
          className="luxury-button px-8"
        >
          Review Order
        </Button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="font-playfair text-3xl font-bold mb-4 luxury-heading">
          Review Your Order
        </h2>
        <p className="text-gray-600">
          Confirm your corporate wellness program details
        </p>
      </div>

      {/* Company Summary */}
      <Card className="luxury-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Company Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Company:</span>
            <span className="font-medium">{companyInfo.companyName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Contact Email:</span>
            <span className="font-medium">{companyInfo.contactEmail}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Location:</span>
            <span className="font-medium">{companyInfo.city}, {companyInfo.state}</span>
          </div>
        </CardContent>
      </Card>

      {/* Order Summary */}
      <Card className="luxury-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Order Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center py-2 border-b">
            <div>
              <span className="font-medium">Corporate Seats</span>
              <p className="text-sm text-gray-600">{seats} seats × ${corporateSeatPrice}/{billingFrequency === 'monthly' ? 'month' : 'year'}</p>
            </div>
            <span className="font-bold">${seats * corporateSeatPrice}</span>
          </div>
          
          {executiveSeats > 0 && (
            <div className="flex justify-between items-center py-2 border-b">
              <div>
                <span className="font-medium">Executive Upgrades</span>
                <p className="text-sm text-gray-600">{executiveSeats} upgrades × ${executiveUpgradePrice}/{billingFrequency === 'monthly' ? 'month' : 'year'}</p>
              </div>
              <span className="font-bold">${executiveSeats * executiveUpgradePrice}</span>
            </div>
          )}
          
          <div className="flex justify-between items-center py-2 text-lg font-bold border-t">
            <span>Total {billingFrequency === 'monthly' ? 'Monthly' : 'Annual'} Cost:</span>
            <span className="text-conve-red">${totalMonthlyCost}{billingFrequency === 'annual' ? '/year' : '/month'}</span>
          </div>
          
          {billingFrequency === 'annual' && (
            <div className="bg-conve-gold/10 p-4 rounded-lg">
              <p className="text-sm text-conve-gold font-medium">
                <CheckCircle className="w-4 h-4 inline mr-2" />
                You're saving ${(seats * 10) + (executiveSeats * 3)} annually with yearly billing!
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between pt-6">
        <Button 
          variant="outline"
          onClick={() => setStep(2)}
          className="px-8"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button 
          onClick={handleProceedToCheckout}
          disabled={loading}
          className="luxury-button px-8"
        >
          {loading ? 'Processing...' : 'Proceed to Payment'}
          <CreditCard className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Corporate Checkout | ConveLabs Enterprise</title>
        <meta name="description" content="Set up your corporate wellness program with ConveLabs. Configure seats, billing, and start your enterprise health solution." />
        <link rel="canonical" href="https://convelabs.com/corporate-checkout" />
      </Helmet>

      <Header />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white py-12">
        <div className="max-w-4xl mx-auto px-4">
          {/* Progress Indicator */}
          <div className="mb-8">
            <div className="flex items-center justify-center space-x-4">
              {[1, 2, 3].map((stepNumber) => (
                <div key={stepNumber} className="flex items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                    step >= stepNumber 
                      ? 'bg-conve-red text-white' 
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                    {stepNumber}
                  </div>
                  {stepNumber < 3 && (
                    <div className={`w-16 h-1 mx-2 ${
                      step > stepNumber ? 'bg-conve-red' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-center mt-4">
              <p className="text-gray-600">
                Step {step} of 3: {
                  step === 1 ? 'Company Information' :
                  step === 2 ? 'Seat Configuration' :
                  'Order Review'
                }
              </p>
            </div>
          </div>

          {/* Main Content */}
          <Card className="luxury-card">
            <CardContent className="p-8">
              {step === 1 && renderStep1()}
              {step === 2 && renderStep2()}
              {step === 3 && renderStep3()}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default CorporateCheckout;