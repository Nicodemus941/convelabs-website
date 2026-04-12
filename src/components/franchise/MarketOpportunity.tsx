
import React from "react";
import { DollarSign, LineChart, Award, Percent } from "lucide-react";
import { LucideIcon } from "lucide-react";
import MarketShareChart from "./MarketShareChart";
import RevenueProjectionChart from "./RevenueProjectionChart";

// Market opportunity stat card component
interface StatCardProps {
  icon: LucideIcon;
  value: string;
  label: string;
}

const StatCard = ({ icon: Icon, value, label }: StatCardProps) => (
  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
    <div className="flex flex-col items-center text-center">
      <div className="mb-3 bg-conve-red/10 p-3 rounded-full">
        <Icon className="h-6 w-6 text-conve-red" />
      </div>
      <p className="text-2xl font-bold mb-1">{value}</p>
      <p className="text-gray-600 text-sm">{label}</p>
    </div>
  </div>
);

const MarketOpportunity: React.FC = () => {
  // Create empty arrays for the required props
  const emptyData = [];
  const emptyTerritories = [];

  return (
    <section className="py-16 bg-white">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">Market Opportunity</h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          <StatCard 
            icon={DollarSign}
            value="$12.5B"
            label="Concierge Healthcare Market (U.S.)"
          />
          <StatCard 
            icon={LineChart}
            value="9.8%"
            label="Annual Growth Rate in Mobile Phlebotomy"
          />
          <StatCard 
            icon={DollarSign}
            value="$50K–$120K+"
            label="Monthly Earning Potential"
          />
          <StatCard 
            icon={Percent}
            value="30–50%"
            label="Average Net Profit Margins"
          />
          <StatCard 
            icon={Award}
            value="#1"
            label="Trend Among Executives & Athletes: In-home lab services"
          />
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <MarketShareChart data={emptyData} territories={emptyTerritories} />
          <RevenueProjectionChart data={emptyData} territories={emptyTerritories} />
        </div>
        
        <div className="max-w-3xl mx-auto text-center mt-12">
          <p className="text-xl italic text-gray-700">
            "There has never been a better time to invest in a luxury medical franchise. Healthcare is moving into the home—and we're leading the way."
          </p>
        </div>
      </div>
    </section>
  );
};

export default MarketOpportunity;
