
import React from "react";
import { Users, Shield, Sparkles, LineChart } from "lucide-react";

const FranchiseeRole: React.FC = () => {
  return (
    <section className="py-16 bg-white">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">Your Role as a Franchise Owner</h2>
        
        <div className="max-w-3xl mx-auto">
          <div className="space-y-5">
            <div className="flex items-start gap-4">
              <div className="bg-conve-red/10 p-2 rounded-full">
                <Users className="h-5 w-5 text-conve-red" />
              </div>
              <p className="text-lg">Hire/manage your team of licensed phlebotomists</p>
            </div>
            <div className="flex items-start gap-4">
              <div className="bg-conve-red/10 p-2 rounded-full">
                <Shield className="h-5 w-5 text-conve-red" />
              </div>
              <p className="text-lg">Deliver in-home or in-office services in your territory</p>
            </div>
            <div className="flex items-start gap-4">
              <div className="bg-conve-red/10 p-2 rounded-full">
                <Users className="h-5 w-5 text-conve-red" />
              </div>
              <p className="text-lg">Network with concierge doctors and wellness providers</p>
            </div>
            <div className="flex items-start gap-4">
              <div className="bg-conve-red/10 p-2 rounded-full">
                <Sparkles className="h-5 w-5 text-conve-red" />
              </div>
              <p className="text-lg">Market your territory with our prebuilt materials</p>
            </div>
            <div className="flex items-start gap-4">
              <div className="bg-conve-red/10 p-2 rounded-full">
                <LineChart className="h-5 w-5 text-conve-red" />
              </div>
              <p className="text-lg">Track revenue, usage, and KPIs via your Super Admin Dashboard</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FranchiseeRole;
