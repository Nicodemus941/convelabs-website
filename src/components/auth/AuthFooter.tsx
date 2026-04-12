
import React from 'react';
import { Link } from 'react-router-dom';
import { AUTH_URL } from '@/lib/constants/urls';

type AuthFooterProps = {
  type: 'login' | 'signup';
};

export const AuthFooter: React.FC<AuthFooterProps> = ({ type }) => {
  return (
    <div className="mt-6">
      {type === 'login' ? (
        <div className="space-y-3">
          <p className="text-center text-sm text-muted-foreground">
            Don't have an account yet?{" "}
            <a href={AUTH_URL} className="text-conve-red hover:underline">
              Sign up
            </a>
          </p>
          <p className="text-center text-sm text-muted-foreground">
            Need to register your organization?{" "}
            <Link to="/tenant-signup" className="text-blue-600 hover:underline">
              Create Organization
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <a href={AUTH_URL} className="text-conve-red hover:underline">
              Sign in
            </a>
          </p>
          <p className="text-center text-sm text-muted-foreground">
            Need to register your organization?{" "}
            <Link to="/tenant-signup" className="text-blue-600 hover:underline">
              Create Organization
            </Link>
          </p>
        </div>
      )}
    </div>
  );
};
