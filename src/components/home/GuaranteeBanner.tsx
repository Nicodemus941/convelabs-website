import React from 'react';
import { Shield, Clock, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

const GuaranteeBanner: React.FC = () => {
  return (
    <section className="bg-gradient-to-r from-gray-950 to-gray-900 text-white py-6">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
          <div className="flex items-center gap-3 justify-center sm:justify-start">
            <div className="w-10 h-10 rounded-full bg-[#B91C1C]/20 flex items-center justify-center flex-shrink-0">
              <Clock className="h-5 w-5 text-[#B91C1C]" />
            </div>
            <div>
              <p className="font-semibold text-sm">On-Time Guarantee</p>
              <p className="text-xs text-gray-400">30-min window or your visit is free</p>
            </div>
          </div>
          <div className="flex items-center gap-3 justify-center">
            <div className="w-10 h-10 rounded-full bg-[#B91C1C]/20 flex items-center justify-center flex-shrink-0">
              <Shield className="h-5 w-5 text-[#B91C1C]" />
            </div>
            <div>
              <p className="font-semibold text-sm">Satisfaction Promise</p>
              <p className="text-xs text-gray-400">Not happy? We make it right — free</p>
            </div>
          </div>
          <div className="flex items-center gap-3 justify-center sm:justify-end">
            <div className="w-10 h-10 rounded-full bg-[#B91C1C]/20 flex items-center justify-center flex-shrink-0">
              <RefreshCw className="h-5 w-5 text-[#B91C1C]" />
            </div>
            <div>
              <p className="font-semibold text-sm">Specimen Tracking</p>
              <p className="text-xs text-gray-400">Real-time delivery confirmation</p>
            </div>
          </div>
        </div>
        <p className="text-center mt-4">
          <Link to="/guarantee" className="text-xs text-[#B91C1C] hover:text-red-400 font-medium hover:underline">
            Learn more about our guarantees →
          </Link>
        </p>
      </div>
    </section>
  );
};

export default GuaranteeBanner;
