
import React from "react";
import { Link } from "react-router-dom";

interface MembershipHeroProps {
  title: string;
  tagline: string;
  type?: 'individual' | 'family' | 'plus-one' | 'concierge-doctor';
}

export const MembershipHero: React.FC<MembershipHeroProps> = ({ title, tagline, type }) => {
  return (
    <>
      {/* Breadcrumb Navigation */}
      <div className="bg-gray-50 py-3">
        <div className="container mx-auto px-4">
          <nav className="text-sm">
            <ol className="flex items-center space-x-2">
              <li>
                <Link to="/" className="text-conve-red hover:underline">Home</Link>
              </li>
              <li className="flex items-center">
                <span className="mx-1 text-gray-400">/</span>
                <Link to="/pricing" className="text-conve-red hover:underline">Memberships</Link>
              </li>
              <li className="flex items-center">
                <span className="mx-1 text-gray-400">/</span>
                <span className="text-gray-600">{title}</span>
              </li>
            </ol>
          </nav>
        </div>
      </div>
      
      {/* Hero Section */}
      <section className="py-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{title} Membership</h1>
          <p className="text-xl md:text-2xl text-gray-700 max-w-3xl mx-auto">{tagline}</p>
        </div>
      </section>
    </>
  );
};
