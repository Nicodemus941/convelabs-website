
import React from "react";
import { Link } from "react-router-dom";

const DoctorPlan = () => {
  return (
    <div className="mt-12 max-w-4xl mx-auto">
      <div className="luxury-card p-6">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-6 md:mb-0 md:pr-6">
            <h3 className="text-xl font-bold mb-2">Concierge Doctor Plan</h3>
            <p className="text-gray-700 mb-4">
              Custom solutions for concierge medical practices and their patients.
              Annual pricing based on projected usage.
            </p>
            <ul className="space-y-2">
              <li className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B91C1C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span>Add unlimited patients to your plan</span>
              </li>
              <li className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B91C1C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span>Custom reporting and usage tracking</span>
              </li>
              <li className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B91C1C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span>Dedicated practice support</span>
              </li>
            </ul>
          </div>
          <div className="w-full md:w-auto text-center md:text-left">
            <Link to="/concierge-doctor-signup" className="luxury-button-outline inline-block w-full md:w-auto">
              Enroll Now
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorPlan;
