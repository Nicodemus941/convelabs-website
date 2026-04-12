import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  // Determine the current section based on URL path
  const getSection = () => {
    const path = location.pathname.toLowerCase();
    if (path.includes("/blog")) return "blog";
    if (path.includes("/services")) return "services";
    if (path.includes("/membership")) return "membership";
    return "";
  };

  const currentSection = getSection();

  // Handle search form submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // For now, just redirect to home page
      // In the future, could be connected to a real search functionality
      navigate(`/?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-grow flex items-center justify-center bg-gray-50 py-12 px-4">
        <div className="w-full max-w-lg text-center">
          <h1 className="text-6xl font-bold mb-4 text-gray-900">404</h1>
          <p className="text-xl text-gray-600 mb-8">
            We couldn't find the page you're looking for
          </p>
          
          {/* Search form */}
          <form onSubmit={handleSearch} className="mb-8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input
                type="text"
                placeholder="Search our website..."
                className="pl-10 pr-4 py-2"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </form>
          
          <div className="space-y-6">
            {/* Main navigation links */}
            <div>
              <h2 className="font-medium mb-3 text-gray-700">Popular destinations:</h2>
              <div className="flex flex-wrap justify-center gap-3">
                <Link to="/" className="text-conve-red hover:text-red-700 font-medium">
                  Home
                </Link>
                <Link to="/pricing" className="text-conve-red hover:text-red-700 font-medium">
                  Pricing
                </Link>
                <Link to="/blog" className="text-conve-red hover:text-red-700 font-medium">
                  Blog
                </Link>
                <Link to="/contact" className="text-conve-red hover:text-red-700 font-medium">
                  Contact Us
                </Link>
                <Link to="/about" className="text-conve-red hover:text-red-700 font-medium">
                  About Us
                </Link>
              </div>
            </div>
            
            {/* Section specific links */}
            {currentSection === "blog" && (
              <div>
                <h2 className="font-medium mb-3 text-gray-700">Blog articles you might like:</h2>
                <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3">
                  <Link to="/blog/benefits-at-home-lab-testing-central-florida" className="text-conve-red hover:text-red-700">
                    Benefits of At-Home Lab Testing
                  </Link>
                  <Link to="/blog/understanding-blood-test-results-florida-guide" className="text-conve-red hover:text-red-700">
                    Understanding Blood Test Results
                  </Link>
                </div>
              </div>
            )}
            
            {currentSection === "services" && (
              <div>
                <h2 className="font-medium mb-3 text-gray-700">Our services:</h2>
                <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3">
                  <Link to="/services/at-home" className="text-conve-red hover:text-red-700">
                    At-Home Services
                  </Link>
                  <Link to="/services/in-office" className="text-conve-red hover:text-red-700">
                    In-Office Services
                  </Link>
                  <Link to="/services/result-tracking" className="text-conve-red hover:text-red-700">
                    Result Tracking
                  </Link>
                </div>
              </div>
            )}
            
            {currentSection === "membership" && (
              <div>
                <h2 className="font-medium mb-3 text-gray-700">Membership options:</h2>
                <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3">
                  <Link to="/membership/individual" className="text-conve-red hover:text-red-700">
                    Individual Membership
                  </Link>
                  <Link to="/membership/plus-one" className="text-conve-red hover:text-red-700">
                    Individual +1 Membership
                  </Link>
                  <Link to="/membership/family" className="text-conve-red hover:text-red-700">
                    Family Membership
                  </Link>
                  <Link to="/membership/concierge-doctor" className="text-conve-red hover:text-red-700">
                    Concierge Doctor
                  </Link>
                </div>
              </div>
            )}
            
            <Button 
              onClick={() => navigate(-1)} 
              variant="outline"
              className="mt-4"
            >
              Go Back
            </Button>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default NotFound;
