import React from "react";
import { Helmet } from "react-helmet-async";
import DashboardWrapper from "@/components/dashboards/DashboardWrapper";
import { Container } from "@/components/ui/container";
import { BookNowButton } from "@/components/ui/book-now-button";
import { MembershipButton } from "@/components/ui/membership-button";
import { Briefcase, Clock, Shield, TrendingUp, Users, Calendar } from "lucide-react";

const ExecutiveHealthOrlando: React.FC = () => {
  return (
    <DashboardWrapper>
      <Helmet>
        <title>Executive Health Screening Orlando | Mobile Lab Services for CEOs & Executives | ConveLabs</title>
        <meta name="description" content="Comprehensive executive health screening and mobile lab services in Orlando for busy CEOs, executives, and C-suite professionals. Time-efficient wellness panels with same-day results at your office or home." />
        <meta name="keywords" content="executive health screening at home Orlando, mobile phlebotomist for executives Orlando, CEO health screening Orlando, C-suite wellness programs, executive physical blood work at home, corporate wellness mobile lab services, busy professional health screening" />
        
        {/* Open Graph */}
        <meta property="og:title" content="Executive Health Screening Orlando | Mobile Lab Services | ConveLabs" />
        <meta property="og:description" content="Comprehensive mobile health screening for Orlando executives. Time-efficient wellness panels at your location." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://convelabs.com/executive-health-orlando" />
        
        {/* Executive Health Service Schema */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "MedicalBusiness",
            "name": "ConveLabs Executive Health Services Orlando",
            "description": "Comprehensive executive health screening and mobile lab services for Orlando's business leaders, CEOs, and C-suite professionals.",
            "url": "https://convelabs.com/executive-health-orlando",
            "serviceType": [
              "Executive Health Screening",
              "Corporate Wellness Programs",
              "C-Suite Health Panels",
              "Executive Physical Blood Work"
            ],
            "areaServed": {
              "@type": "City",
              "name": "Orlando",
              "address": {
                "@type": "PostalAddress",
                "addressLocality": "Orlando",
                "addressRegion": "FL"
              }
            }
          })}
        </script>
        
        <link rel="canonical" href="https://convelabs.com/executive-health-orlando" />
      </Helmet>

      <Container className="py-12">
        <div className="max-w-6xl mx-auto">
          {/* Executive Hero Section */}
          <div className="text-center mb-16">
            <div className="flex justify-center mb-6">
              <Briefcase className="h-16 w-16 text-conve-red" />
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-6">
              Executive Health Screening
              <span className="block text-conve-red">Orlando's Business Leaders</span>
            </h1>
            <p className="text-xl text-gray-700 mb-8 max-w-4xl mx-auto leading-relaxed">
              Comprehensive mobile health screening designed specifically for Orlando's busy executives, CEOs, 
              and C-suite professionals. Get critical health insights without disrupting your demanding schedule.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <BookNowButton 
                size="lg" 
                className="bg-conve-red hover:bg-conve-red/90 px-8 py-4 text-lg"
                useQuickBooking={true}
              >
                Schedule Executive Screening
              </BookNowButton>
              <MembershipButton size="lg" className="px-8 py-4 text-lg">
                Corporate Membership
              </MembershipButton>
            </div>
          </div>

          {/* Executive Benefits */}
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="text-center p-8 bg-gray-50 rounded-xl">
              <Clock className="h-12 w-12 text-conve-red mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-3">Time-Efficient</h3>
              <p className="text-gray-600">15-minute appointments that fit your schedule. Early morning, lunch break, or after-hours availability.</p>
            </div>
            <div className="text-center p-8 bg-gray-50 rounded-xl">
              <TrendingUp className="h-12 w-12 text-conve-red mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-3">Performance Optimization</h3>
              <p className="text-gray-600">Health insights that help you maintain peak performance and energy levels for demanding leadership roles.</p>
            </div>
            <div className="text-center p-8 bg-gray-50 rounded-xl">
              <Shield className="h-12 w-12 text-conve-red mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-3">Complete Discretion</h3>
              <p className="text-gray-600">Confidential service with HIPAA compliance. Coordinate seamlessly with your executive assistant.</p>
            </div>
          </div>

          {/* Executive Health Panels */}
          <div className="bg-white rounded-xl shadow-lg p-8 mb-16">
            <h2 className="text-3xl font-bold text-center mb-8">Executive Health Panels</h2>
            <div className="grid md:grid-cols-2 gap-8">
              {[
                {
                  title: "Executive Wellness Panel",
                  description: "Comprehensive metabolic panel designed for high-stress leadership roles",
                  tests: [
                    "Complete Blood Count (CBC)",
                    "Comprehensive Metabolic Panel",
                    "Lipid Profile with Ratios",
                    "Thyroid Function (TSH, T3, T4)",
                    "Vitamin D & B12",
                    "HbA1c (Diabetes Screening)"
                  ],
                  ideal: "Annual executive physicals"
                },
                {
                  title: "Stress & Performance Panel",
                  description: "Biomarkers that impact executive performance and stress resilience",
                  tests: [
                    "Cortisol (Stress Hormone)",
                    "Testosterone (Total & Free)",
                    "DHEA-S",
                    "Inflammatory Markers (CRP)",
                    "Homocysteine",
                    "Magnesium & Essential Minerals"
                  ],
                  ideal: "High-stress periods, merger/acquisition times"
                },
                {
                  title: "Cardiovascular Executive Panel",
                  description: "Heart health screening for high-pressure executive lifestyles",
                  tests: [
                    "Advanced Lipid Profile",
                    "Cardiac Risk Markers",
                    "Lipoprotein(a)",
                    "ApoB/ApoA1 Ratio",
                    "NT-proBNP",
                    "Omega-3 Index"
                  ],
                  ideal: "Executives over 40, family history of heart disease"
                },
                {
                  title: "Travel Health Panel",
                  description: "Health clearance for frequent business travelers",
                  tests: [
                    "Complete Blood Count",
                    "Liver Function Panel",
                    "International Travel Titers",
                    "Hepatitis A/B Status",
                    "Travel Medicine Consultation",
                    "Vaccination Status Review"
                  ],
                  ideal: "International business travel preparation"
                }
              ].map((panel, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-6 hover:border-conve-red/50 transition-all">
                  <h3 className="text-xl font-semibold mb-3 text-conve-red">{panel.title}</h3>
                  <p className="text-gray-600 mb-4">{panel.description}</p>
                  <div className="mb-4">
                    <h4 className="font-medium mb-2">Includes:</h4>
                    <ul className="text-sm text-gray-500 space-y-1">
                      {panel.tests.map((test, testIndex) => (
                        <li key={testIndex} className="flex items-center">
                          <div className="w-1.5 h-1.5 bg-conve-red rounded-full mr-3"></div>
                          {test}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <span className="text-sm font-medium text-gray-700">Ideal for: </span>
                    <span className="text-sm text-gray-600">{panel.ideal}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Corporate Services */}
          <div className="bg-gray-50 rounded-xl p-8 mb-16">
            <h2 className="text-3xl font-bold text-center mb-8">Corporate Wellness Programs</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  icon: Users,
                  title: "C-Suite Packages",
                  description: "Tailored health screening packages for executive teams with coordinated scheduling."
                },
                {
                  icon: Calendar,
                  title: "Quarterly Health Checks",
                  description: "Regular executive health monitoring with trend analysis and performance insights."
                },
                {
                  icon: Shield,
                  title: "Board Meeting Coordination",
                  description: "Health screenings timed with board meetings for out-of-town executives."
                },
                {
                  icon: TrendingUp,
                  title: "Performance Analytics",
                  description: "Health data analysis to optimize executive performance and reduce sick days."
                },
                {
                  icon: Clock,
                  title: "Flexible Scheduling",
                  description: "Early morning, lunch break, or after-hours appointments to fit executive schedules."
                },
                {
                  icon: Briefcase,
                  title: "Office Integration",
                  description: "Seamless integration with corporate wellness programs and executive assistants."
                }
              ].map((service, index) => (
                <div key={index} className="bg-white p-6 rounded-lg shadow-sm">
                  <service.icon className="h-8 w-8 text-conve-red mb-3" />
                  <h3 className="text-lg font-semibold mb-2">{service.title}</h3>
                  <p className="text-gray-600 text-sm">{service.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Executive Locations */}
          <div className="bg-white rounded-xl shadow-lg p-8 mb-16">
            <h2 className="text-3xl font-bold text-center mb-8">Serving Orlando's Business Districts</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {[
                "Downtown Orlando", "Lake Nona Medical City", "Dr. Phillips Business District", "Millenia",
                "MetroWest", "International Drive", "Universal Business District", "Winter Park",
                "Maitland Business Center", "Altamonte Springs", "Heathrow", "Celebration"
              ].map((area) => (
                <div key={area} className="flex items-center bg-gray-50 p-3 rounded-lg">
                  <Briefcase className="h-4 w-4 text-conve-red mr-2 flex-shrink-0" />
                  <span className="text-sm font-medium">{area}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Executive CTA */}
          <div className="text-center bg-gradient-to-r from-conve-red/5 to-gray-50 p-12 rounded-xl border border-conve-red/10">
            <h2 className="text-4xl font-bold mb-6">Invest in Your Executive Performance</h2>
            <p className="text-xl mb-8 max-w-3xl mx-auto">
              Orlando's top executives trust ConveLabs for convenient, comprehensive health screening that fits their demanding schedules. 
              Join leaders from Fortune 500 companies, startups, and professional services who prioritize their health.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center mb-6">
              <BookNowButton 
                size="lg" 
                className="bg-conve-red hover:bg-conve-red/90 px-8 py-4 text-lg"
                useQuickBooking={true}
              >
                Schedule Executive Screening
              </BookNowButton>
              <MembershipButton size="lg" className="px-8 py-4 text-lg">
                Corporate Pricing
              </MembershipButton>
            </div>
            <p className="text-sm text-gray-600">
              Executive scheduling available • Same-day results • Corporate invoicing available
            </p>
          </div>
        </div>
      </Container>
    </DashboardWrapper>
  );
};

export default ExecutiveHealthOrlando;