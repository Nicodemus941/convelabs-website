
import React from 'react';
import { BarChart3, Calendar, CircleDollarSign, FileSpreadsheet, Smartphone, Users } from "lucide-react";

const AdvancedFeaturesSection = () => {
  return (
    <section className="py-16 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Enhanced Platform Features
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Our comprehensive franchise platform provides everything you need to run a successful ConveLabs business
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
          {/* Feature 1 */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <div className="bg-conve-red/10 p-3 rounded-full mb-4">
              <Smartphone className="h-6 w-6 text-conve-red" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Mobile Optimized</h3>
            <p className="text-gray-600">
              Full-featured mobile app for your team and customers with appointment scheduling, communications, and payment processing.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <div className="bg-conve-red/10 p-3 rounded-full mb-4">
              <Calendar className="h-6 w-6 text-conve-red" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Smart Scheduling</h3>
            <p className="text-gray-600">
              AI-powered scheduling system optimizes phlebotomist routes and maximizes daily appointments efficiency.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <div className="bg-conve-red/10 p-3 rounded-full mb-4">
              <CircleDollarSign className="h-6 w-6 text-conve-red" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Advanced Payroll</h3>
            <p className="text-gray-600">
              Comprehensive staff payment system with time tracking, multiple payment methods, and automated compensation management.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <div className="bg-conve-red/10 p-3 rounded-full mb-4">
              <Users className="h-6 w-6 text-conve-red" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Staff Management</h3>
            <p className="text-gray-600">
              Complete tools for hiring, training, and managing your phlebotomy team with performance tracking.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <div className="bg-conve-red/10 p-3 rounded-full mb-4">
              <BarChart3 className="h-6 w-6 text-conve-red" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Analytics Dashboard</h3>
            <p className="text-gray-600">
              Real-time performance metrics, revenue tracking, and business intelligence tools to optimize operations.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <div className="bg-conve-red/10 p-3 rounded-full mb-4">
              <FileSpreadsheet className="h-6 w-6 text-conve-red" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Financial Reporting</h3>
            <p className="text-gray-600">
              Comprehensive financial reports, reconciliation tools, and transaction management for accurate accounting.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AdvancedFeaturesSection;
