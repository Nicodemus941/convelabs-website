
import React from "react";
import GrowthTrendChart from "./GrowthTrendChart";

const FranchiseOverview: React.FC = () => {
  // Create empty arrays for the required props
  const emptyData = [];
  const emptyTerritories = [];

  return (
    <section className="py-16 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-6">
            Take Your Experience in Healthcare to the Next Level
          </h2>
          <p className="text-lg text-center">
            ConveLabs offers a premium franchise opportunity for healthcare professionals looking to 
            combine mobile lab services with a luxury experience for high-value clients.
          </p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h3 className="text-xl font-semibold mb-3 text-conve-red">Lucrative Margins</h3>
            <p>
              With low overhead, premium pricing, and recurring revenue from memberships, 
              ConveLabs franchisees enjoy industry-leading profit margins.
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h3 className="text-xl font-semibold mb-3 text-conve-red">Built-in Technology</h3>
            <p>
              Skip tech development—our proprietary software handles booking, billing, 
              scheduling, and client management so you can focus on growing your business.
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h3 className="text-xl font-semibold mb-3 text-conve-red">Established Brand</h3>
            <p>
              Join a nationally-recognized brand that conveys luxury, reliability, and 
              exceptional service to high-net-worth clients and concierge physicians.
            </p>
          </div>
        </div>
        
        <div className="mx-auto max-w-4xl">
          <GrowthTrendChart data={emptyData} territories={emptyTerritories} />
        </div>
      </div>
    </section>
  );
};

export default FranchiseOverview;
