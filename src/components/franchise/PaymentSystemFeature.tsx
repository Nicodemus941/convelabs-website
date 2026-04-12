
import React from 'react';
import { CheckCircle2, CircleDollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PaymentSystemFeature = () => {
  return (
    <section className="py-16 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Advanced Payment & Payroll System</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Our enhanced platform includes a comprehensive payment system to streamline your franchise operations
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <Card className="border-2 border-conve-gold/20 hover:border-conve-gold/50 transition-all shadow">
            <CardHeader className="pb-2">
              <div className="p-3 bg-conve-gold/10 rounded-full w-fit mb-3">
                <CircleDollarSign className="h-6 w-6 text-conve-gold" />
              </div>
              <CardTitle className="text-xl">Streamlined Payroll</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                <li className="flex items-start">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Automated time tracking and work hour calculations</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Customizable pay periods with detailed reporting</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Multiple payment method options for staff</span>
                </li>
              </ul>
            </CardContent>
          </Card>
          
          <Card className="border-2 border-conve-gold/20 hover:border-conve-gold/50 transition-all shadow">
            <CardHeader className="pb-2">
              <div className="p-3 bg-conve-gold/10 rounded-full w-fit mb-3">
                <CircleDollarSign className="h-6 w-6 text-conve-gold" />
              </div>
              <CardTitle className="text-xl">Revenue Management</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                <li className="flex items-start">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Secure transaction processing and reporting</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Real-time financial performance tracking</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Integration with popular accounting software</span>
                </li>
              </ul>
            </CardContent>
          </Card>
          
          <Card className="border-2 border-conve-gold/20 hover:border-conve-gold/50 transition-all shadow">
            <CardHeader className="pb-2">
              <div className="p-3 bg-conve-gold/10 rounded-full w-fit mb-3">
                <CircleDollarSign className="h-6 w-6 text-conve-gold" />
              </div>
              <CardTitle className="text-xl">Staff Management</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                <li className="flex items-start">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Digital time clock with mobile check-in/out</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Performance-based compensation tracking</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Customizable role-based access controls</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default PaymentSystemFeature;
