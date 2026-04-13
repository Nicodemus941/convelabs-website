import React from 'react';
import Header from '@/components/home/Header';
import Footer from '@/components/home/Footer';
import { Shield, Clock, Award, Heart, CheckCircle2, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const guarantees = [
  {
    icon: Clock,
    title: 'On-Time Arrival Guarantee',
    description: 'Your phlebotomist will arrive within your scheduled 30-minute arrival window. If we\'re late, your visit is on us.',
  },
  {
    icon: Award,
    title: 'Licensed & Certified',
    description: 'Every ConveLabs phlebotomist is licensed, certified, insured, and background-checked. No exceptions.',
  },
  {
    icon: Shield,
    title: 'Specimen Delivery Confirmation',
    description: 'You\'ll receive a confirmation text and email with your lab-generated tracking ID within 4 hours of collection.',
  },
  {
    icon: Heart,
    title: 'Satisfaction Promise',
    description: 'If you\'re not completely satisfied with your experience, we\'ll send another phlebotomist at no additional charge.',
  },
];

const Guarantee = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-grow">
        {/* Hero */}
        <div className="bg-gradient-to-br from-[#B91C1C] to-[#991B1B] text-white py-16 md:py-24">
          <div className="container mx-auto px-4 text-center max-w-3xl">
            <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Shield className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-3xl md:text-5xl font-bold mb-4">The ConveLabs Guarantee</h1>
            <p className="text-lg md:text-xl text-red-100 mb-8">
              We stand behind every blood draw. Your satisfaction is guaranteed — or we make it right.
            </p>
            <Button size="lg" className="bg-white text-[#B91C1C] hover:bg-red-50 font-bold px-8" asChild>
              <Link to="/book-now">Book With Confidence</Link>
            </Button>
          </div>
        </div>

        {/* Guarantees */}
        <div className="container mx-auto px-4 py-16 max-w-4xl">
          <div className="grid md:grid-cols-2 gap-8">
            {guarantees.map((g, i) => {
              const Icon = g.icon;
              return (
                <div key={i} className="flex gap-4 p-6 rounded-2xl border bg-white shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-6 w-6 text-[#B91C1C]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">{g.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{g.description}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Additional assurances */}
          <div className="mt-16 bg-gray-50 rounded-2xl p-8 md:p-12">
            <h2 className="text-2xl font-bold text-center mb-8">Why Patients Trust ConveLabs</h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
              {[
                'HIPAA Compliant',
                'Hospital-Grade Equipment',
                'CLIA-Certified Labs',
                '500+ Patients Served',
                '5-Star Google Rating',
                'Same-Day Appointments',
              ].map(item => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-[#B91C1C] flex-shrink-0" />
                  <span className="text-sm font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="mt-16 text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Ready to Experience the Difference?</h2>
            <p className="text-muted-foreground mb-6">Book your first ConveLabs appointment today. Protected by our guarantee.</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold px-8" asChild>
                <Link to="/book-now">Book Your Visit</Link>
              </Button>
              <Button size="lg" variant="outline" className="gap-2" asChild>
                <a href="tel:9415279169"><Phone className="h-4 w-4" /> (941) 527-9169</a>
              </Button>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Guarantee;
