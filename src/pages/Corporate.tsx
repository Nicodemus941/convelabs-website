import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Users, Shield, TrendingUp, ArrowRight, Building2, Clock, Star, Download, Phone, BarChart, Calendar, Target, MapPin, HeartHandshake, Briefcase, Stethoscope, Award, Zap, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/home/Header';
import Footer from '@/components/home/Footer';
import { generateCorporateWellnessGuide } from '@/utils/corporateGuideGenerator';
import { CorporateSignupForm } from "@/components/corporate/CorporateSignupForm";
import ScheduleDiscussionModal from "@/components/b2b/modals/ScheduleDiscussionModal";
import { StickyDemoButton } from "@/components/corporate/StickyDemoButton";

const Corporate: React.FC = () => {
  const navigate = useNavigate();
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  React.useEffect(() => {
    console.log('Corporate component mounted');
    console.log('Current pathname:', window.location.pathname);
    
    return () => {
      console.log('Corporate component unmounting');
    };
  }, []);

  const handleScheduleDemo = () => {
    setIsScheduleModalOpen(true);
  };

  const handleGetStarted = () => {
    console.log('Get started clicked, navigating to /corporate-checkout');
    navigate('/corporate-checkout');
  };

  const benefits = [
    {
      icon: DollarSign,
      title: "30% Fewer Sick Days",
      description: "Data-driven preventive care reduces absenteeism by 30%, saving an average of $3,200 per employee annually"
    },
    {
      icon: TrendingUp,
      title: "25% Healthcare Cost Reduction", 
      description: "Early detection and intervention programs cut corporate healthcare spend by 25% through prevention"
    },
    {
      icon: Users,
      title: "92% Participation Rate",
      description: "Mobile convenience at workplace ensures industry-leading participation rates vs traditional health fairs"
    },
    {
      icon: Clock,
      title: "10-Minute Productivity Impact",
      description: "Streamlined screenings take just 10 minutes per employee with zero workplace disruption"
    },
    {
      icon: Shield,
      title: "Enterprise-Grade Security",
      description: "HIPAA compliant platform with bank-level encryption and SOC 2 Type II certification"
    },
    {
      icon: BarChart,
      title: "Executive Dashboard & ROI Tracking",
      description: "Real-time analytics proving program impact with detailed ROI reporting for C-suite presentations"
    }
  ];

  const socialProof = [
    {
      organization: "Major Television Networks",
      type: "Entertainment & Media",
      employees: "1,000+ employees",
      result: "35% reduction in sick days"
    },
    {
      organization: "Professional Sports Teams",
      type: "Athletic Organizations", 
      employees: "500+ staff & athletes",
      result: "40% faster injury recovery"
    },
    {
      organization: "Fortune 500 Corporations",
      type: "Enterprise Clients",
      employees: "5,000+ employees",
      result: "25% healthcare cost savings"
    }
  ];

  const complianceSignals = [
    { icon: Shield, label: "HIPAA Compliant" },
    { icon: Award, label: "CLIA Certified" },
    { icon: Building2, label: "Enterprise Security" },
    { icon: CheckCircle, label: "SOC 2 Type II" }
  ];

  const corporateFeatures = [
    "On-site mobile phlebotomy services",
    "Executive health screenings", 
    "Workplace wellness programs",
    "Employee health fairs alternative",
    "Preventive care initiatives",
    "Corporate health dashboards",
    "Bulk employee testing",
    "Health trend analytics",
    "Compliance reporting",
    "Custom wellness packages"
  ];

  const reportingMetrics = [
    {
      metric: "Employee Participation",
      value: "92%",
      description: "Average participation rate across all corporate clients"
    },
    {
      metric: "Cost Savings", 
      value: "$2,400",
      description: "Average annual savings per employee through preventive care"
    },
    {
      metric: "Productivity Increase",
      value: "15%", 
      description: "Improvement in team productivity after implementing wellness program"
    },
    {
      metric: "Sick Day Reduction",
      value: "30%",
      description: "Decrease in employee sick days and medical absences"
    }
  ];

  const testimonials = [
    {
      company: "Orlando Tech Solutions",
      logo: "💼",
      quote: "We saw a 35% reduction in sick days within 6 months. The mobile service eliminated the need for employees to take time off for routine health screenings.",
      author: "Sarah Chen, HR Director"
    },
    {
      company: "Central Florida Bank", 
      logo: "🏢",
      quote: "The monthly reports helped us identify health trends early. Our healthcare costs dropped by 22% year-over-year thanks to preventive interventions.",
      author: "Michael Rodriguez, Benefits Manager"
    },
    {
      company: "Premier Manufacturing",
      logo: "🏭", 
      quote: "Employee satisfaction with our benefits package increased dramatically. The convenience factor cannot be overstated.",
      author: "Lisa Johnson, CEO"
    }
  ];

  return (
    <>
      <Helmet>
        <title>Cut Healthcare Costs by 25% | Enterprise Workforce Health Solutions | ConveLabs</title>
        <meta name="description" content="Fortune 500-trusted mobile health platform reduces sick days 30% and healthcare costs 25%. HIPAA-compliant enterprise wellness with 10-minute screenings and executive reporting." />
        <meta name="keywords" content="enterprise healthcare solutions, corporate wellness ROI, workforce health platform, Fortune 500 health services, executive health programs, HIPAA compliant wellness, employee health screenings, corporate health cost reduction, workplace wellness analytics, enterprise phlebotomy services" />
        <link rel="canonical" href="https://convelabs.com/corporate" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Service", 
            "name": "Enterprise Workforce Health Solutions",
            "description": "Fortune 500-trusted mobile health platform that reduces healthcare costs by 25% and sick days by 30% through preventive workplace wellness programs.",
            "provider": {
              "@type": "Organization",
              "name": "ConveLabs",
              "url": "https://convelabs.com"
            },
            "areaServed": "United States",
            "serviceType": "Enterprise Health & Wellness Solutions",
            "hasOfferCatalog": {
              "@type": "OfferCatalog", 
              "name": "Corporate Health Packages",
              "itemListElement": [
                {
                  "@type": "Offer",
                  "itemOffered": {
                    "@type": "Service",
                    "name": "Corporate Seat - Workforce Health Platform",
                    "description": "Complete enterprise health platform with mobile screenings, analytics, and compliance reporting"
                  },
                  "price": "99",
                  "priceCurrency": "USD",
                  "priceSpecification": {
                    "@type": "UnitPriceSpecification",
                    "price": "99", 
                    "priceCurrency": "USD",
                    "unitText": "per employee per month"
                  }
                }
              ]
            }
          })}
        </script>
      </Helmet>

      <Header />
      
      {/* Executive Hero Section */}
      <section className="luxury-gradient-bg py-20 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-conve-red via-conve-red-dark to-slate-900"></div>
        <div className="absolute inset-0 bg-black/20"></div>
        
        <div className="relative max-w-6xl mx-auto px-4 text-center text-white">
          <Badge className="mb-8 bg-white/20 backdrop-blur-sm text-white border-white/30 px-4 py-2 text-sm font-medium">
            <Award className="w-4 h-4 mr-2" />
            Trusted by Fortune 500 Companies
          </Badge>
          
          <h1 className="font-playfair text-4xl md:text-6xl lg:text-7xl font-bold mb-8 leading-tight">
            Cut Healthcare Costs by 25% 
            <span className="block text-conve-gold">While Reducing Sick Days by 30%</span>
            <span className="block text-2xl md:text-3xl mt-4 opacity-90">— in Just 30 Days</span>
          </h1>
          
          <p className="text-xl md:text-2xl mb-12 opacity-95 max-w-4xl mx-auto leading-relaxed">
            Join television networks, sports teams, and Fortune 500 corporations who trust ConveLabs 
            to deliver enterprise-grade workforce health solutions with measurable ROI.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center mb-12">
            <Button 
              size="lg" 
              onClick={handleScheduleDemo}
              className="luxury-button text-lg px-8 py-6 h-auto"
            >
              <Calendar className="w-5 h-5 mr-2" />
              Schedule Enterprise Demo
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            
            <Button 
              size="lg" 
              className="luxury-button-outline text-lg px-8 py-6 h-auto"
              onClick={() => window.open('tel:+19415279169', '_self')}
            >
              <Phone className="w-5 h-5 mr-2" />
              Contact Enterprise Sales
            </Button>
          </div>

          {/* Compliance & Trust Signals */}
          <div className="flex flex-wrap justify-center gap-6 mb-12">
            {complianceSignals.map((signal, index) => (
              <div key={index} className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg">
                <signal.icon className="w-4 h-4" />
                <span className="text-sm font-medium">{signal.label}</span>
              </div>
            ))}
          </div>

          {/* ROI Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-conve-gold">$3,200</div>
              <div className="text-sm text-white/80">Annual Savings/Employee</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-conve-gold">92%</div>
              <div className="text-sm text-white/80">Participation Rate</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-conve-gold">30%</div>
              <div className="text-sm text-white/80">Fewer Sick Days</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-conve-gold">25%</div>
              <div className="text-sm text-white/80">Cost Reduction</div>
            </div>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-20 left-10 w-20 h-20 bg-conve-gold/10 rounded-full animate-luxury-float"></div>
        <div className="absolute bottom-20 right-10 w-16 h-16 bg-white/10 rounded-full animate-luxury-float" style={{ animationDelay: '1s' }}></div>
      </section>

      {/* Social Proof Section */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              Trusted by Industry Leaders
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              ConveLabs has been selected by professional organizations across multiple industries for our enterprise-grade reliability and proven results.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {socialProof.map((client, index) => (
              <Card key={index} className="luxury-card p-6 text-center border-2 border-conve-red/10">
                <CardContent className="p-0">
                  <Badge variant="secondary" className="mb-3 bg-conve-red/10 text-conve-red">
                    {client.type}
                  </Badge>
                  <h3 className="font-bold text-lg text-gray-900 mb-2">{client.organization}</h3>
                  <p className="text-gray-600 mb-3">{client.employees}</p>
                  <div className="text-conve-red font-semibold">{client.result}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Enterprise Platform Overview */}
      <section className="luxury-section bg-gradient-to-br from-slate-50 to-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-playfair text-4xl md:text-5xl font-bold mb-6 luxury-heading">
              Enterprise <span className="text-conve-red">Health Platform</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              A complete workforce health solution designed for HR leaders, CFOs, and executives who demand measurable results and enterprise-grade security.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <Card className="luxury-card p-8 h-full">
                <CardHeader className="pb-6">
                  <CardTitle className="flex items-center gap-3 text-2xl font-playfair text-conve-red">
                    <Zap className="h-8 w-8 text-conve-red" />
                    Complete Enterprise Solution
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    {corporateFeatures.map((feature, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-conve-red flex-shrink-0" />
                        <span className="text-gray-700">{feature}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <div className="space-y-8">
              <div className="bg-conve-red/5 p-8 rounded-2xl border border-conve-red/20">
                <h3 className="text-xl font-bold text-gray-900 mb-4 font-playfair">ROI-Driven Results</h3>
                <p className="text-gray-600 mb-4 leading-relaxed">
                  Our enterprise clients see an average <span className="font-bold text-conve-red">$3,200 annual savings per employee</span> through 
                  preventive care programs that reduce sick days by 30% and emergency healthcare costs by 25%.
                </p>
                <div className="flex items-center gap-2 text-conve-red font-medium">
                  <DollarSign className="h-5 w-5" />
                  <span>Measurable ROI within 90 days</span>
                </div>
              </div>
              
              <div className="bg-green-50 p-8 rounded-2xl border border-green-200">
                <h3 className="text-xl font-bold text-gray-900 mb-4 font-playfair">Executive Dashboard</h3>
                <ul className="space-y-3 text-gray-600">
                  <li className="flex items-center gap-3">
                    <BarChart className="h-5 w-5 text-green-600" />
                    Real-time workforce health analytics
                  </li>
                  <li className="flex items-center gap-3">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    Cost savings and productivity metrics
                  </li>
                  <li className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-green-600" />
                    C-suite ready reports and presentations
                  </li>
                </ul>
                <Button 
                  onClick={handleScheduleDemo}
                  className="mt-4 luxury-button-outline w-full"
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  Schedule Demo
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ROI vs Traditional Solutions */}
      <section className="luxury-section bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-playfair text-4xl md:text-5xl font-bold mb-6 luxury-heading">
              Why Fortune 500s Choose <span className="text-conve-red">ConveLabs</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Enterprise clients demand solutions that deliver measurable ROI without disrupting operations. 
              Here's why we're the preferred choice for workforce health.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-12">
            <Card className="luxury-card border-2 border-red-200">
              <CardHeader className="bg-red-50 text-center">
                <CardTitle className="text-red-700 font-playfair text-2xl">Traditional Approach</CardTitle>
                <CardDescription className="text-red-600">Health fairs & vendor solutions</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-4">
                <div className="text-gray-600">• $15,000-50,000 event costs</div>
                <div className="text-gray-600">• 40-60% participation rates</div>
                <div className="text-gray-600">• Full day productivity loss</div>
                <div className="text-gray-600">• No ongoing health monitoring</div>
                <div className="text-gray-600">• Limited ROI measurement</div>
                <div className="text-gray-600">• Annual or bi-annual events only</div>
                <div className="text-gray-600">• No C-suite reporting dashboard</div>
              </CardContent>
            </Card>
            
            <Card className="luxury-card border-2 border-green-200">
              <CardHeader className="bg-green-50 text-center">
                <CardTitle className="text-green-700 font-playfair text-2xl">ConveLabs Enterprise Platform</CardTitle>
                <CardDescription className="text-green-600">Fortune 500-trusted solution</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-4">
                <div className="text-gray-600 flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  $99/employee/month all-inclusive
                </div>
                <div className="text-gray-600 flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  92% average participation rate
                </div>
                <div className="text-gray-600 flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  10-minute mobile screenings
                </div>
                <div className="text-gray-600 flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Continuous health monitoring
                </div>
                <div className="text-gray-600 flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Executive ROI dashboard
                </div>
                <div className="text-gray-600 flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Year-round flexible scheduling
                </div>
                <div className="text-gray-600 flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  C-suite ready analytics & reports
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Monthly Reporting Section */}
      <section className="luxury-section bg-gradient-to-br from-gray-50 to-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-playfair text-4xl md:text-5xl font-bold mb-6 luxury-heading">
              <span className="text-conve-red">Monthly Reporting</span> & Analytics
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Track your wellness program's impact with comprehensive corporate dashboards and monthly reports.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
            {reportingMetrics.map((metric, index) => (
              <Card key={index} className="luxury-card text-center p-8 group animate-luxury-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
                <CardContent className="p-0">
                  <div className="text-4xl font-bold text-conve-red mb-3 font-playfair">{metric.value}</div>
                  <div className="text-xl font-semibold text-gray-900 mb-3 font-playfair">{metric.metric}</div>
                  <div className="text-sm text-gray-600">{metric.description}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <Card className="luxury-card p-10">
            <CardHeader className="text-center pb-8">
              <CardTitle className="text-3xl font-playfair font-bold text-gray-900">Sample Monthly Corporate Dashboard</CardTitle>
              <CardDescription className="text-lg text-gray-600">What your HR team will receive every month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-10">
                <div className="space-y-6">
                  <h4 className="font-bold text-lg text-gray-900 font-playfair">Employee Participation</h4>
                  <ul className="space-y-3 text-gray-600">
                    <li>• Total employees enrolled</li>
                    <li>• Monthly service utilization</li>
                    <li>• Trending participation rates</li>
                    <li>• Department-wise breakdown</li>
                  </ul>
                </div>
                <div className="space-y-6">
                  <h4 className="font-bold text-lg text-gray-900 font-playfair">Health Trends</h4>
                  <ul className="space-y-3 text-gray-600">
                    <li>• Common health markers</li>
                    <li>• Early risk detection alerts</li>
                    <li>• Wellness program effectiveness</li>
                    <li>• Comparative industry benchmarks</li>
                  </ul>
                </div>
                <div className="space-y-6">
                  <h4 className="font-bold text-lg text-gray-900 font-playfair">ROI Metrics</h4>
                  <ul className="space-y-3 text-gray-600">
                    <li>• Healthcare cost savings</li>
                    <li>• Productivity improvements</li>
                    <li>• Sick day reduction rates</li>
                    <li>• Employee satisfaction scores</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="luxury-section bg-gradient-to-br from-slate-50 to-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-playfair text-4xl md:text-5xl font-bold mb-6 luxury-heading">
              <span className="text-conve-red">Enterprise Pricing</span> with Proven ROI
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Transparent pricing designed for HR leaders and CFOs. Every package includes ROI tracking 
              to prove program value and justify continued investment.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Corporate Seat */}
            <Card className="luxury-card relative border-2 border-conve-red/20 hover:shadow-luxury-hover transition-all duration-500 animate-luxury-scale-in">
              <CardHeader className="text-center p-8">
                <Badge className="mx-auto mb-4 bg-conve-red/10 text-conve-red border-conve-red/20 px-4 py-2">
                  <Building2 className="h-4 w-4 mr-2" />
                  Most Popular
                </Badge>
                <CardTitle className="text-2xl font-bold text-conve-red font-playfair">Corporate Seat</CardTitle>
                <CardDescription className="text-lg mt-2">Enterprise workforce health platform per employee</CardDescription>
                <div className="text-5xl font-bold mt-6 font-playfair">
                  <span className="text-conve-red">$99</span>
                  <span className="text-lg text-gray-500 font-normal">/employee/month</span>
                </div>
                <div className="bg-green-50 p-4 rounded-lg mt-4">
                  <div className="text-sm text-green-700 font-medium">
                    <div>ROI: $3,200 annual savings per employee</div>
                    <div className="text-xs mt-1">327% return on investment</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8 pt-0">
                <ul className="space-y-4 mb-8">
                  {corporateFeatures.slice(0, 8).map((feature, index) => (
                    <li key={index} className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-conve-red flex-shrink-0" />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button 
                  onClick={handleScheduleDemo}
                  className="w-full luxury-button"
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  Schedule Demo
                </Button>
              </CardContent>
            </Card>

            {/* Executive Upgrade */}
            <Card className="luxury-card relative border-2 border-conve-gold/30 hover:shadow-luxury-hover transition-all duration-500 animate-luxury-scale-in" style={{ animationDelay: '0.2s' }}>
              <CardHeader className="text-center p-8">
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-conve-gold text-white px-4 py-2 shadow-luxury-red">
                    <Briefcase className="w-4 h-4 mr-1" />
                    Executive
                  </Badge>
                </div>
                <CardTitle className="text-2xl font-bold text-conve-gold font-playfair mt-4">Executive Program</CardTitle>
                <CardDescription className="text-lg mt-2">C-suite health services with priority support</CardDescription>
                <div className="text-5xl font-bold mt-6 font-playfair">
                  <span className="text-conve-gold">$129</span>
                  <span className="text-lg text-gray-500 font-normal">/employee/month</span>
                </div>
                <div className="bg-conve-gold/5 p-4 rounded-lg mt-4">
                  <div className="text-sm text-conve-gold font-medium">
                    <div>Includes Corporate Seat + Executive Services</div>
                    <div className="text-xs mt-1">Dedicated account manager & priority scheduling</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8 pt-0">
                <ul className="space-y-4 mb-8">
                  <li className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-conve-gold flex-shrink-0" />
                    <span className="text-gray-700">Priority same-day scheduling</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-conve-gold flex-shrink-0" />
                    <span className="text-gray-700">Executive health assessments</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-conve-gold flex-shrink-0" />
                    <span className="text-gray-700">Dedicated account manager</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-conve-gold flex-shrink-0" />
                    <span className="text-gray-700">Enhanced reporting dashboard</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-conve-gold flex-shrink-0" />
                    <span className="text-gray-700">Weekend and evening availability</span>
                  </li>
                </ul>
                <Button 
                  onClick={handleScheduleDemo}
                  className="w-full luxury-button-outline border-2 border-conve-gold text-conve-gold hover:bg-conve-gold hover:text-white"
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  Schedule Demo
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="text-center mt-12">
            <Card className="luxury-card p-8 bg-conve-red/5 border-conve-red/20 max-w-4xl mx-auto">
              <CardContent className="p-0">
                <h3 className="text-2xl font-bold text-gray-900 mb-4 font-playfair">Enterprise & Custom Solutions</h3>
                <p className="text-gray-600 mb-6 text-lg">
                  For organizations with 100+ employees. Includes volume discounts, custom integrations, 
                  and dedicated customer success management. Typical enterprise savings: 15-25% off per-seat pricing.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button 
                    className="luxury-button"
                    onClick={handleScheduleDemo}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    Schedule Enterprise Demo
                  </Button>
                  <Button 
                    className="luxury-button-outline"
                    onClick={generateCorporateWellnessGuide}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download Corporate Guide
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="luxury-section bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-playfair text-4xl md:text-5xl font-bold mb-6 luxury-heading">
              <span className="text-conve-red">Proven Benefits</span> for Modern Businesses
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Real results that impact your bottom line and employee satisfaction
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {benefits.map((benefit, index) => (
              <Card key={index} className="luxury-card text-center p-8 hover:shadow-luxury-hover transition-all duration-500 group animate-luxury-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
                <div className="w-16 h-16 bg-gradient-to-br from-conve-red to-conve-red-dark rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-luxury-red group-hover:shadow-luxury-red-hover transition-all duration-300">
                  <benefit.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="font-playfair text-xl font-bold mb-4 text-gray-900">{benefit.title}</h3>
                <p className="text-gray-600">{benefit.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="luxury-section bg-gradient-to-br from-gray-50 to-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-playfair text-4xl md:text-5xl font-bold mb-6 luxury-heading">
              <span className="text-conve-red">Implementation Timeline</span> - 30 Days to Launch
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              From contract to first employee screening in just one month
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-12">
            <div className="text-center group">
              <div className="relative mb-8">
                <div className="w-20 h-20 bg-gradient-to-br from-conve-red to-conve-red-dark rounded-2xl flex items-center justify-center mx-auto shadow-luxury-red group-hover:shadow-luxury-red-hover transition-all duration-300">
                  <span className="text-3xl font-bold text-white font-playfair">1</span>
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-conve-gold rounded-full animate-pulse"></div>
              </div>
              <h3 className="font-playfair text-2xl font-bold mb-4 text-gray-900">Setup & Onboarding</h3>
              <p className="text-gray-600 leading-relaxed">Configure your corporate wellness program and invite employees to join the platform</p>
            </div>
            
            <div className="text-center group">
              <div className="relative mb-8">
                <div className="w-20 h-20 bg-gradient-to-br from-conve-red to-conve-red-dark rounded-2xl flex items-center justify-center mx-auto shadow-luxury-red group-hover:shadow-luxury-red-hover transition-all duration-300">
                  <span className="text-3xl font-bold text-white font-playfair">2</span>
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-conve-gold rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
              </div>
              <h3 className="font-playfair text-2xl font-bold mb-4 text-gray-900">Employee Enrollment</h3>
              <p className="text-gray-600 leading-relaxed">Team members download the app and schedule their first convenient health screening</p>
            </div>
            
            <div className="text-center group">
              <div className="relative mb-8">
                <div className="w-20 h-20 bg-gradient-to-br from-conve-red to-conve-red-dark rounded-2xl flex items-center justify-center mx-auto shadow-luxury-red group-hover:shadow-luxury-red-hover transition-all duration-300">
                  <span className="text-3xl font-bold text-white font-playfair">3</span>
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-conve-gold rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
              </div>
              <h3 className="font-playfair text-2xl font-bold mb-4 text-gray-900">Track & Report</h3>
              <p className="text-gray-600 leading-relaxed">View monthly analytics and optimize your wellness program for maximum ROI</p>
            </div>
          </div>
        </div>
      </section>

      {/* Success Stories */}
      <section className="luxury-section bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-playfair text-4xl md:text-5xl font-bold mb-6 luxury-heading">
              <span className="text-conve-red">Success Stories</span> from Our Corporate Clients
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Real results from companies that transformed their workplace wellness programs
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="luxury-card p-8 animate-luxury-fade-in" style={{ animationDelay: `${index * 0.2}s` }}>
                <CardContent className="p-0">
                  <div className="text-center mb-6">
                    <div className="text-4xl mb-3">{testimonial.logo}</div>
                    <Badge variant="secondary" className="mb-2 bg-conve-red/10 text-conve-red">{testimonial.company.includes('Tech') ? 'Technology Company' : testimonial.company.includes('Bank') ? 'Financial Services' : 'Manufacturing'}</Badge>
                    <h3 className="font-semibold text-lg font-playfair">{testimonial.company.includes('250') ? '250 Employees' : testimonial.company.includes('150') ? '150 Employees' : '400 Employees'}</h3>
                  </div>
                  <blockquote className="text-gray-600 mb-6 italic leading-relaxed">
                    "{testimonial.quote}"
                  </blockquote>
                  <div className="text-sm text-conve-red font-medium">- {testimonial.author}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="luxury-section bg-gradient-to-br from-slate-50 to-white">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-playfair text-4xl md:text-5xl font-bold mb-6 luxury-heading">
              Frequently Asked <span className="text-conve-red">Questions</span>
            </h2>
            <p className="text-xl text-gray-600">
              Common questions about implementing corporate wellness programs
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-12">
            <div className="space-y-8">
              <div>
                <h3 className="font-bold text-lg text-gray-900 mb-3 font-playfair">How quickly can we implement the program?</h3>
                <p className="text-gray-600 leading-relaxed">Most companies are fully operational within 30 days of signing up, including employee onboarding and first health screenings.</p>
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900 mb-3 font-playfair">Do you really only need 10 minutes per employee?</h3>
                <p className="text-gray-600 leading-relaxed">Yes! Our streamlined mobile process is designed for efficiency. Basic health panels take 10 minutes, comprehensive screenings may take 15-20 minutes.</p>
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900 mb-3 font-playfair">What's included in the monthly reporting?</h3>
                <p className="text-gray-600 leading-relaxed">Participation rates, health trend analysis, cost savings metrics, and actionable insights to improve your wellness program.</p>
              </div>
            </div>
            <div className="space-y-8">
              <div>
                <h3 className="font-bold text-lg text-gray-900 mb-3 font-playfair">How does this compare cost-wise to health fairs?</h3>
                <p className="text-gray-600 leading-relaxed">Most companies save 40-60% compared to traditional health fairs while achieving higher participation and better outcomes.</p>
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900 mb-3 font-playfair">Is this covered by our existing health insurance?</h3>
                <p className="text-gray-600 leading-relaxed">This is typically a separate employee benefit. Many companies see ROI through reduced healthcare costs and fewer sick days.</p>
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900 mb-3 font-playfair">Can we customize services for our industry?</h3>
                <p className="text-gray-600 leading-relaxed">Absolutely! We offer industry-specific health panels and can tailor programs to your company's unique needs and risk factors.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6 font-playfair">Ready to Transform Your Workplace Wellness?</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Join forward-thinking companies that prioritize their employees' health and wellbeing. 
              Get started today with our streamlined corporate onboarding process.
            </p>
          </div>
          
          <div className="max-w-4xl mx-auto">
            <CorporateSignupForm />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="luxury-section bg-gradient-to-br from-conve-red via-conve-red-dark to-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-black/20"></div>
        
        <div className="relative max-w-6xl mx-auto px-4 text-center">
          <h2 className="font-playfair text-4xl md:text-5xl font-bold mb-8 leading-tight">
            Transform Your <span className="text-conve-gold">Corporate Wellness Program</span> Today
          </h2>
          <p className="text-xl md:text-2xl mb-12 opacity-95 max-w-3xl mx-auto leading-relaxed">
            Join 500+ companies that have revolutionized their employee wellness approach. 
            Reduce costs, improve productivity, and show your team you care.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center mb-12">
            <Button 
              size="lg" 
              onClick={handleScheduleDemo}
              className="luxury-button text-lg px-8 py-4 h-auto"
            >
              <Calendar className="w-5 h-5 mr-2" />
              Schedule Enterprise Demo
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            
            <Button 
              size="lg" 
              className="luxury-button-outline text-lg px-8 py-4 h-auto"
              onClick={() => window.open('tel:+19415279169', '_self')}
            >
              <Phone className="w-5 h-5 mr-2" />
              Call (941) 527-9169
            </Button>

            <Button 
              size="lg" 
              className="luxury-button-outline text-lg px-8 py-4 h-auto"
              onClick={generateCorporateWellnessGuide}
            >
              <Download className="w-5 h-5 mr-2" />
              Download Guide
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center">
            <Card className="luxury-card p-6 bg-white/10 backdrop-blur-sm border-white/20">
              <CardContent className="p-0">
                <MapPin className="h-8 w-8 text-conve-gold mx-auto mb-2" />
                <div className="text-sm font-medium text-white">Orlando Service Area</div>
                <div className="text-xs text-white/80">Central Florida Coverage</div>
              </CardContent>
            </Card>
            <Card className="luxury-card p-6 bg-white/10 backdrop-blur-sm border-white/20">
              <CardContent className="p-0">
                <Shield className="h-8 w-8 text-conve-gold mx-auto mb-2" />
                <div className="text-sm font-medium text-white">HIPAA Compliant</div>
                <div className="text-xs text-white/80">Enterprise Security</div>
              </CardContent>
            </Card>
            <Card className="luxury-card p-6 bg-white/10 backdrop-blur-sm border-white/20">
              <CardContent className="p-0">
                <Clock className="h-8 w-8 text-conve-gold mx-auto mb-2" />
                <div className="text-sm font-medium text-white">24/7 Availability</div>
                <div className="text-xs text-white/80">Flexible Scheduling</div>
              </CardContent>
            </Card>
            <Card className="luxury-card p-6 bg-white/10 backdrop-blur-sm border-white/20">
              <CardContent className="p-0">
                <HeartHandshake className="h-8 w-8 text-conve-gold mx-auto mb-2" />
                <div className="text-sm font-medium text-white">30-Day Setup</div>
                <div className="text-xs text-white/80">Quick Implementation</div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-20 left-10 w-20 h-20 bg-conve-gold/10 rounded-full animate-luxury-float"></div>
        <div className="absolute bottom-20 right-10 w-16 h-16 bg-white/10 rounded-full animate-luxury-float" style={{ animationDelay: '1s' }}></div>
      </section>

      <Footer />
      
      {/* Sticky Demo Button */}
      <StickyDemoButton onScheduleDemo={handleScheduleDemo} />
      
      {/* Schedule Discussion Modal */}
      <ScheduleDiscussionModal 
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
      />
    </>
  );
};

export default Corporate;