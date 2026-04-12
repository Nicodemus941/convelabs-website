
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Check, X } from 'lucide-react';
import { VideoSection } from '@/components/ui/video-section';
import { Link } from 'react-router-dom';

export const PricingDoctorTab = () => {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold mb-3">Concierge Doctor Plans</h2>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Elevate your concierge practice with customized lab services tailored specifically for your patients.
        </p>
      </div>

      <VideoSection
        videoId="sc_BYydPz04"
        title="Partnering with Concierge Practices"
        description="See how ConveLabs integrates with your practice to provide exceptional lab services to your patients."
      />

      <div className="mt-12 grid md:grid-cols-3 gap-8">
        {/* Essential Plan */}
        <Card className="overflow-hidden border-2">
          <div className="bg-blue-50 p-6 text-center border-b">
            <h3 className="text-xl font-bold">Essential</h3>
            <div className="mt-2">
              <span className="text-3xl font-bold">$399</span>
              <span className="text-gray-600">/month</span>
            </div>
            <p className="text-sm text-gray-600 mt-2">For smaller practices</p>
            <p className="text-sm text-gray-600 mt-1">Up to 50 patients</p>
          </div>
          <CardContent className="p-6">
            <ul className="space-y-4">
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                <span>Up to 100 lab services per year</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                <span>Dedicated practice portal</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                <span>Patient scheduling tools</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                <span>Online result delivery</span>
              </li>
              <li className="flex items-start opacity-50">
                <X className="h-5 w-5 text-gray-400 mr-2 mt-0.5" />
                <span>EMR integration</span>
              </li>
              <li className="flex items-start opacity-50">
                <X className="h-5 w-5 text-gray-400 mr-2 mt-0.5" />
                <span>Priority scheduling</span>
              </li>
            </ul>
            <Button className="w-full mt-6" asChild>
              <Link to="/concierge-doctor-signup">Enroll Now</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Professional Plan */}
        <Card className="overflow-hidden border-2 border-blue-500 shadow-lg relative">
          <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs font-bold py-1 px-3 rounded-bl">
            MOST POPULAR
          </div>
          <div className="bg-blue-50 p-6 text-center border-b border-blue-100">
            <h3 className="text-xl font-bold">Professional</h3>
            <div className="mt-2">
              <span className="text-3xl font-bold">$799</span>
              <span className="text-gray-600">/month</span>
            </div>
            <p className="text-sm text-gray-600 mt-2">For growing practices</p>
            <p className="text-sm text-gray-600 mt-1">51-150 patients</p>
          </div>
          <CardContent className="p-6">
            <ul className="space-y-4">
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                <span>Up to 300 lab services per year</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                <span>Dedicated practice portal</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                <span>Patient scheduling tools</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                <span>Online result delivery</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                <span>Basic EMR integration</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                <span>Priority scheduling</span>
              </li>
            </ul>
            <Button className="w-full mt-6 bg-blue-600 hover:bg-blue-700" asChild>
              <Link to="/concierge-doctor-signup">Enroll Now</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Premium Plan */}
        <Card className="overflow-hidden border-2">
          <div className="bg-blue-50 p-6 text-center border-b">
            <h3 className="text-xl font-bold">Premium</h3>
            <div className="mt-2">
              <span className="text-3xl font-bold">$1,499</span>
              <span className="text-gray-600">/month</span>
            </div>
            <p className="text-sm text-gray-600 mt-2">For established practices</p>
            <p className="text-sm text-gray-600 mt-1">151-300 patients</p>
          </div>
          <CardContent className="p-6">
            <ul className="space-y-4">
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                <span>Up to 600 lab services per year</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                <span>Dedicated practice portal</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                <span>Patient scheduling tools</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                <span>Online result delivery</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                <span>Advanced EMR integration</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                <span>VIP priority scheduling</span>
              </li>
            </ul>
            <Button className="w-full mt-6" asChild>
              <Link to="/concierge-doctor-signup">Enroll Now</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Contact Section */}
      <div className="bg-blue-50 p-8 rounded-xl mt-12 text-center">
        <h3 className="text-xl font-bold mb-3">Need a custom plan?</h3>
        <p className="mb-6">
          Practices with over 300 patients can benefit from our Enterprise solutions.
          Contact our team to create a tailored plan for your practice.
        </p>
        <Button className="bg-blue-600 hover:bg-blue-700" asChild>
          <Link to="/contact">Schedule a Consultation</Link>
        </Button>
      </div>
    </div>
  );
};

export default PricingDoctorTab;
