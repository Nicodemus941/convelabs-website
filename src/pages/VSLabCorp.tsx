import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Container } from '@/components/ui/container';
import { BookNowButton } from '@/components/ui/book-now-button';
import { MembershipButton } from '@/components/ui/membership-button';
import DashboardWrapper from '@/components/dashboards/DashboardWrapper';
import { Shield, Clock, Star, Phone, MapPin, CheckCircle, TrendingUp, X } from 'lucide-react';

const VSLabCorp: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>ConveLabs vs LabCorp Mobile | Why Choose Premium Over Standard | Orlando Executive Healthcare</title>
        <meta 
          name="description" 
          content="Compare ConveLabs luxury mobile lab services vs LabCorp mobile phlebotomy. See why Orlando executives choose ConveLabs for white-glove service, same-day results, and VIP treatment over standard mobile services."
        />
        <meta 
          name="keywords" 
          content="ConveLabs vs LabCorp mobile, luxury mobile lab vs standard, executive mobile phlebotomy comparison, Orlando mobile lab comparison, VIP mobile blood work vs regular service, premium mobile lab services Orlando"
        />
        
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ComparisonTable",
            "name": "ConveLabs vs LabCorp Mobile Lab Services",
            "description": "Detailed comparison between ConveLabs luxury mobile lab services and LabCorp standard mobile phlebotomy",
            "mainEntity": {
              "@type": "Table",
              "name": "Mobile Lab Service Comparison",
              "about": "Executive mobile healthcare services in Orlando"
            }
          })}
        </script>
        
        <link rel="canonical" href="https://convelabs.com/vs-labcorp" />
      </Helmet>

      <DashboardWrapper>
        <Container className="py-12">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-bold font-playfair luxury-heading mb-6">
              ConveLabs vs LabCorp Mobile
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto executive-focus">
              Why Orlando's executives and high-net-worth individuals choose ConveLabs luxury mobile lab services 
              over standard LabCorp mobile phlebotomy. See the premium difference.
            </p>
          </div>

          {/* Comparison Table */}
          <div className="luxury-card p-8 mb-16">
            <h2 className="text-3xl font-bold mb-8 font-playfair text-center">Service Comparison</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-4 px-4 font-semibold">Feature</th>
                    <th className="text-center py-4 px-4 font-semibold text-conve-red">ConveLabs</th>
                    <th className="text-center py-4 px-4 font-semibold text-gray-600">LabCorp Mobile</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="py-4 px-4 font-medium">Service Level</td>
                    <td className="py-4 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-5 w-5" />
                        White-Glove VIP
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center text-gray-600">Standard Service</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-4 px-4 font-medium">Same-Day Results</td>
                    <td className="py-4 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-5 w-5" />
                        Available
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-red-600">
                        <X className="h-5 w-5" />
                        1-3 Days
                      </span>
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-4 px-4 font-medium">Executive Scheduling</td>
                    <td className="py-4 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-5 w-5" />
                        Flexible 6AM-10PM
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center text-gray-600">Limited Hours</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-4 px-4 font-medium">Luxury Locations</td>
                    <td className="py-4 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-5 w-5" />
                        Yacht, Estate, Office
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center text-gray-600">Home/Office Only</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-4 px-4 font-medium">Personal Concierge</td>
                    <td className="py-4 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-5 w-5" />
                        Dedicated Support
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-red-600">
                        <X className="h-5 w-5" />
                        Call Center
                      </span>
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-4 px-4 font-medium">Price Point</td>
                    <td className="py-4 px-4 text-center text-conve-red font-semibold">Premium $89+</td>
                    <td className="py-4 px-4 text-center text-gray-600">Standard $50+</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Why Executives Choose ConveLabs */}
          <div className="grid md:grid-cols-2 gap-8 mb-16">
            <div className="luxury-card p-8">
              <h3 className="text-2xl font-bold mb-4 font-playfair text-conve-red">Why ConveLabs Wins</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-1" />
                  <span><strong>Executive-Level Service:</strong> White-glove treatment that matches your lifestyle standards</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-1" />
                  <span><strong>Same-Day Results:</strong> Critical for busy executives who need immediate health insights</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-1" />
                  <span><strong>Luxury Location Access:</strong> Yacht, private estate, and exclusive venue services</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-1" />
                  <span><strong>Complete Discretion:</strong> Privacy standards that protect high-profile clients</span>
                </li>
              </ul>
            </div>

            <div className="luxury-card p-8">
              <h3 className="text-2xl font-bold mb-4 font-playfair text-gray-600">LabCorp Limitations</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <X className="h-5 w-5 text-red-600 mt-1" />
                  <span><strong>Standard Service Model:</strong> One-size-fits-all approach without luxury customization</span>
                </li>
                <li className="flex items-start gap-3">
                  <X className="h-5 w-5 text-red-600 mt-1" />
                  <span><strong>Slower Results:</strong> 1-3 day turnaround doesn't meet executive urgency needs</span>
                </li>
                <li className="flex items-start gap-3">
                  <X className="h-5 w-5 text-red-600 mt-1" />
                  <span><strong>Limited Locations:</strong> Cannot access exclusive venues or luxury properties</span>
                </li>
                <li className="flex items-start gap-3">
                  <X className="h-5 w-5 text-red-600 mt-1" />
                  <span><strong>Corporate Structure:</strong> Call center support without personal touch</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Call to Action */}
          <div className="text-center luxury-gradient-bg p-12 rounded-2xl">
            <h2 className="text-3xl font-bold mb-4 font-playfair">Choose Executive Excellence</h2>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Join Orlando's executives who've upgraded from standard LabCorp mobile services to ConveLabs' 
              luxury healthcare experience. You deserve better than basic.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <BookNowButton size="lg" />
              <MembershipButton variant="outline" size="lg" />
            </div>
            <div className="mt-6 flex items-center justify-center gap-4 text-gray-600">
              <Phone className="h-5 w-5" />
              <span className="font-semibold">Upgrade Hotline: 941-527-9169</span>
            </div>
          </div>
        </Container>
      </DashboardWrapper>
    </>
  );
};

export default VSLabCorp;