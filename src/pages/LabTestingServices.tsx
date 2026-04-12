import React from "react";
import { Helmet } from "react-helmet-async";
import { TESTS_URL } from '@/lib/constants/urls';
import DashboardWrapper from "@/components/dashboards/DashboardWrapper";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { 
  TestTube, 
  Home, 
  Clock, 
  DollarSign, 
  FileCheck, 
  Award,
  Calendar,
  MapPin,
  CheckCircle,
  Phone,
  ArrowRight,
  Shield,
  Star,
  Users
} from "lucide-react";

const LabTestingServices: React.FC = () => {
  const features = [
    {
      icon: TestTube,
      title: "Comprehensive Testing",
      description: "Choose from 200+ professional lab tests for complete health insights"
    },
    {
      icon: Home,
      title: "At-Home Convenience",
      description: "Certified phlebotomist comes to your home, office, or hotel"
    },
    {
      icon: Clock,
      title: "Fast Results",
      description: "Most results delivered securely online in 1-2 business days"
    },
    {
      icon: DollarSign,
      title: "Competitive Pricing",
      description: "Transparent pricing, often lower than traditional labs"
    },
    {
      icon: FileCheck,
      title: "No Doctor Required",
      description: "Order tests directly without a physician referral"
    },
    {
      icon: Award,
      title: "Trusted Partners",
      description: "Samples processed by Labcorp and Quest Diagnostics"
    }
  ];

  const steps = [
    {
      number: 1,
      title: "Browse & Select",
      description: "Choose from our extensive catalog of 200+ lab tests"
    },
    {
      number: 2,
      title: "Schedule Appointment",
      description: "Pick a convenient date and time for at-home blood draw"
    },
    {
      number: 3,
      title: "Meet Your Phlebotomist",
      description: "Certified professional comes to your location"
    },
    {
      number: 4,
      title: "Get Results",
      description: "Receive secure, confidential results online in 1-2 days"
    }
  ];

  const popularTests = [
    { name: "Complete Blood Count (CBC)", description: "Measures different components of blood", price: "$29" },
    { name: "Comprehensive Metabolic Panel", description: "Evaluates overall health and metabolism", price: "$35" },
    { name: "Lipid Panel (Cholesterol)", description: "Checks cholesterol and triglyceride levels", price: "$32" },
    { name: "Thyroid Stimulating Hormone (TSH)", description: "Assesses thyroid function", price: "$45" },
    { name: "Hemoglobin A1C (Diabetes)", description: "Monitors blood sugar control", price: "$38" },
    { name: "Vitamin D Levels", description: "Measures vitamin D in your blood", price: "$52" },
    { name: "Testosterone Panel", description: "Comprehensive hormone assessment", price: "$89" },
    { name: "Basic Metabolic Panel", description: "Evaluates kidney function and electrolytes", price: "$28" },
    { name: "Liver Function Test", description: "Checks liver health and enzyme levels", price: "$42" },
    { name: "Iron Studies", description: "Measures iron and ferritin levels", price: "$48" },
    { name: "PSA (Prostate)", description: "Prostate health screening for men", price: "$55" },
    { name: "Urinalysis", description: "Comprehensive urine analysis", price: "$24" }
  ];

  const serviceCities = [
    "Orlando", "Winter Park", "Apopka", "Maitland", 
    "Kissimmee", "Lake Nona", "Oviedo", "Windermere",
    "Dr. Phillips", "Downtown Orlando", "UCF Area", "Celebration"
  ];

  const benefits = [
    "We come to your home - no driving or waiting rooms",
    "Same-day appointments available",
    "Perfect for elderly, disabled, or busy professionals",
    "Safe, private, and convenient service",
    "Samples delivered directly to Labcorp/Quest",
    "Insurance accepted in most cases",
    "No doctor's order required for most tests",
    "HIPAA compliant and fully confidential"
  ];

  const jsonLdSchema = {
    "@context": "https://schema.org",
    "@type": "MedicalBusiness",
    "name": "ConveLabs Lab Testing Services",
    "description": "Professional lab testing with at-home phlebotomy services",
    "url": "https://convelabs.com/lab-testing",
    "telephone": "+1-941-527-9169",
    "areaServed": {
      "@type": "City",
      "name": "Orlando",
      "addressRegion": "FL",
      "addressCountry": "US"
    },
    "medicalSpecialty": ["Phlebotomy", "Laboratory Testing", "Diagnostic Services"],
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "Lab Testing Services",
      "itemListElement": [
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "MedicalTest",
            "name": "At-Home Lab Testing",
            "description": "Over 200 professional lab tests with mobile phlebotomy service"
          }
        }
      ]
    },
    "priceRange": "$$",
    "openingHours": "Mo-Fr 06:00-13:30"
  };

  return (
    <DashboardWrapper requireAuth={false}>
      <Helmet>
        <title>Professional Lab Tests - At-Home Blood Work | ConveLabs</title>
        <meta 
          name="description" 
          content="Order from 200+ professional lab tests with convenient at-home phlebotomy service. Fast results, competitive prices, CLIA certified labs. Orlando metro area." 
        />
        <meta 
          name="keywords" 
          content="lab tests, blood work, at-home testing, mobile phlebotomy, diagnostic tests, health screening, Orlando lab testing, home blood draw, medical testing, preventive health" 
        />
        <link rel="canonical" href="https://convelabs.com/lab-testing" />
        
        {/* Open Graph */}
        <meta property="og:title" content="Professional Lab Tests - At-Home Blood Work | ConveLabs" />
        <meta property="og:description" content="Order from 200+ professional lab tests with convenient at-home phlebotomy service. Orlando metro area." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://convelabs.com/lab-testing" />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Professional Lab Tests - At-Home Blood Work | ConveLabs" />
        <meta name="twitter:description" content="200+ lab tests with at-home phlebotomy. Fast results, competitive prices." />
        
        {/* Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify(jsonLdSchema)}
        </script>
      </Helmet>

      {/* Hero Section */}
      <section className="luxury-gradient-bg py-16 md:py-24">
        <Container>
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 luxury-heading font-playfair">
              Professional Lab Testing with At-Home Phlebotomy
            </h1>
            <p className="text-lg md:text-xl text-gray-600 mb-8 executive-focus">
              Order from 200+ lab tests and we'll come to you. Fast results, competitive prices, no doctor visit required.
            </p>
            
            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Button 
                size="lg"
                className="luxury-button text-base"
                asChild
              >
                <a 
                  href={TESTS_URL} 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  Browse Lab Tests <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </Button>
              <Button 
                size="lg"
                variant="outline"
                className="luxury-button-outline text-base"
                asChild
              >
                <a href="tel:941-527-9169">
                  <Phone className="mr-2 h-5 w-5" /> Call (941) 527-9169
                </a>
              </Button>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap justify-center gap-6 text-sm">
              <div className="flex items-center gap-2 text-gray-700">
                <Shield className="h-5 w-5 text-conve-red" />
                <span className="font-medium">CLIA Certified Labs</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <Calendar className="h-5 w-5 text-conve-red" />
                <span className="font-medium">Same-Day Appointments</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <Star className="h-5 w-5 text-conve-red" />
                <span className="font-medium">Insurance Accepted</span>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Key Features */}
      <section className="py-16 md:py-20 bg-white">
        <Container>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 font-playfair">Why Choose Our Lab Testing Service</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Comprehensive testing with unmatched convenience and quality
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div 
                key={index} 
                className="luxury-card p-6 hover:shadow-luxury-red transition-all duration-300 hover:-translate-y-1"
              >
                <feature.icon className="h-12 w-12 text-conve-red mb-4" />
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* How It Works */}
      <section className="py-16 md:py-20 luxury-gradient-bg">
        <Container>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 font-playfair">How It Works</h2>
            <p className="text-lg text-gray-600">Simple, fast, and convenient testing process</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="text-center">
                <div className="luxury-card p-6 mb-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-conve-red to-red-700 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                    {step.number}
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                  <p className="text-gray-600 text-sm">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-4 transform -translate-y-1/2">
                    <ArrowRight className="h-6 w-6 text-gray-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Popular Tests */}
      <section className="py-16 md:py-20 bg-white">
        <Container>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 font-playfair">Popular Lab Tests</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Our most commonly ordered tests with transparent pricing
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {popularTests.map((test, index) => (
              <div 
                key={index} 
                className="luxury-card p-5 hover:shadow-luxury-red transition-all duration-300 hover:scale-105"
              >
                <div className="flex items-start justify-between mb-3">
                  <TestTube className="h-8 w-8 text-conve-red flex-shrink-0" />
                  <span className="text-lg font-bold text-conve-red">{test.price}</span>
                </div>
                <h3 className="font-semibold mb-2 text-sm">{test.name}</h3>
                <p className="text-xs text-gray-600">{test.description}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Button 
              size="lg"
              className="luxury-button"
              asChild
            >
              <a 
                href={TESTS_URL} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                View All 200+ Tests <ArrowRight className="ml-2 h-5 w-5" />
              </a>
            </Button>
          </div>
        </Container>
      </section>

      {/* Service Areas */}
      <section className="py-16 md:py-20 luxury-gradient-bg">
        <Container>
          <div className="text-center mb-12">
            <MapPin className="h-12 w-12 text-conve-red mx-auto mb-4" />
            <h2 className="text-3xl md:text-4xl font-bold mb-4 font-playfair">Orlando Metro Area</h2>
            <p className="text-lg text-gray-600">
              Currently serving the greater Orlando region with plans to expand
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
              {serviceCities.map((city, index) => (
                <div 
                  key={index} 
                  className="luxury-card p-4 text-center hover:bg-red-50 transition-colors"
                >
                  <span className="font-medium text-gray-700">{city}</span>
                </div>
              ))}
            </div>

            <div className="luxury-card p-6 text-center bg-red-50 border-conve-red">
              <p className="text-sm text-gray-600 mb-2">
                <strong>ZIP Codes Served:</strong> 32801-32899, 32703, 32704, 32712
              </p>
              <p className="text-sm font-medium text-conve-red">
                ✨ Expanding to new locations soon
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* Why Choose ConveLabs */}
      <section className="py-16 md:py-20 bg-white">
        <Container>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 font-playfair">Why Choose ConveLabs</h2>
            <p className="text-lg text-gray-600">
              Premium service that puts your convenience first
            </p>
          </div>

          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-conve-red flex-shrink-0 mt-1" />
                <p className="text-gray-700">{benefit}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Pricing Information */}
      <section className="py-16 md:py-20 luxury-gradient-bg">
        <Container>
          <div className="max-w-3xl mx-auto luxury-card p-8 md:p-10 border-2 border-conve-red">
            <div className="text-center mb-6">
              <DollarSign className="h-12 w-12 text-conve-red mx-auto mb-4" />
              <h2 className="text-2xl md:text-3xl font-bold mb-4 font-playfair">Transparent Pricing</h2>
            </div>
            
            <div className="space-y-4 text-center">
              <div className="p-4 bg-red-50 rounded-lg">
                <p className="text-lg font-semibold text-gray-800 mb-1">Mobile Draw Fee: $85</p>
                <p className="text-sm text-gray-600">Waived for orders $150 or more</p>
              </div>
              <div className="p-4 bg-white rounded-lg border border-gray-200">
                <p className="text-lg font-semibold text-gray-800 mb-1">Lab Tests: Starting from $20</p>
                <p className="text-sm text-gray-600">Competitive pricing on all 200+ tests</p>
              </div>
            </div>

            <div className="mt-8 text-center">
              <Button 
                size="lg"
                className="luxury-button w-full sm:w-auto"
                asChild
              >
                <a 
                  href={TESTS_URL} 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  View Full Catalog & Pricing
                </a>
              </Button>
            </div>
          </div>
        </Container>
      </section>

      {/* Service Hours */}
      <section className="py-12 bg-white">
        <Container>
          <div className="max-w-2xl mx-auto luxury-card p-6 text-center">
            <Clock className="h-10 w-10 text-conve-red mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-4">Collection Hours</h3>
            <div className="space-y-2 text-gray-700">
              <p><strong>Monday - Friday:</strong> 6:00 AM - 1:30 PM</p>
              <p className="text-sm text-gray-600">60-day advance booking available</p>
              <p className="text-sm text-gray-600">No weekend collections (UPS closed for specimen shipping)</p>
            </div>
          </div>
        </Container>
      </section>

      {/* Final CTA */}
      <section className="py-16 md:py-24 bg-gradient-to-br from-conve-red via-red-700 to-red-800 text-white">
        <Container>
          <div className="max-w-3xl mx-auto text-center">
            <Users className="h-16 w-16 mx-auto mb-6 opacity-90" />
            <h2 className="text-3xl md:text-4xl font-bold mb-6 font-playfair">Ready to Get Started?</h2>
            <p className="text-lg md:text-xl mb-8 opacity-90">
              Browse our full catalog of professional lab tests and schedule your convenient at-home blood draw today.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg"
                className="bg-white text-conve-red hover:bg-gray-100 font-semibold px-8 py-6 text-base"
                asChild
              >
                <a 
                  href={TESTS_URL} 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  Browse Full Test Catalog <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </Button>
              <Button 
                size="lg"
                variant="outline"
                className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-conve-red font-semibold px-8 py-6 text-base"
                asChild
              >
                <a href="/contact">
                  Questions? Contact Us
                </a>
              </Button>
            </div>

            <div className="mt-8 flex items-center justify-center gap-2 text-white/90">
              <Phone className="h-5 w-5" />
              <a href="tel:941-527-9169" className="text-lg font-medium hover:underline">
                (941) 527-9169
              </a>
            </div>
          </div>
        </Container>
      </section>

      {/* Disclaimers */}
      <section className="py-8 bg-gray-50">
        <Container>
          <div className="max-w-4xl mx-auto text-xs text-gray-600 space-y-2">
            <p>
              <strong>Medical Disclaimer:</strong> Results from lab tests should be reviewed with a healthcare provider for proper interpretation and medical advice.
            </p>
            <p>
              <strong>Service Availability:</strong> Not all tests available in all locations. Some tests may require physician authorization based on state regulations.
            </p>
            <p>
              <strong>Insurance:</strong> Insurance coverage varies by plan and test. Contact us for verification and billing assistance.
            </p>
            <p>
              <strong>Privacy:</strong> All testing is HIPAA compliant. Your health information is kept strictly confidential.
            </p>
          </div>
        </Container>
      </section>
    </DashboardWrapper>
  );
};

export default LabTestingServices;
