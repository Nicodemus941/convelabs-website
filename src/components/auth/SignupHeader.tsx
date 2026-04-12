
import React from "react";
import { Link } from "react-router-dom";

interface SignupHeaderProps {
  isFromMembership?: boolean;
}

export const SignupHeader: React.FC<SignupHeaderProps> = ({ isFromMembership = false }) => {
  return (
    <div className="text-center mb-10">
      <h2 className="text-3xl font-bold text-conve-black">
        <Link to="/">
          ConveLabs
          <span className="text-conve-red">.</span>
        </Link>
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        Join our luxury mobile phlebotomy service
      </p>
    </div>
  );
};
