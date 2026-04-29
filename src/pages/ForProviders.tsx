/**
 * /for-providers — single-page reference for medical providers asking
 * about ConveLabs services, pricing, hours, and how the system works.
 *
 * Triggered by Courtney Forbes (PrivateHealthMD) email 2026-04-29:
 *   "What is the draw fee? Do you use your own lab or send to Quest/
 *    AdventHealth? How early can appointments be scheduled?"
 *
 * One page that:
 *   - Answers every common provider question without an email round-trip
 *   - Linkable from outreach emails (no login required)
 *   - Embedded in ProviderDashboard so logged-in partners can reference it
 *   - Print-friendly so practices can keep a copy at the front desk
 */

import React from 'react';
import { Helmet } from 'react-helmet';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, MapPin, FlaskConical, DollarSign, Users, Phone, Mail, FileText, Building2, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const ForProviders: React.FC = () => (
  <>
    <Helmet>
      <title>For Providers · ConveLabs Services & Pricing</title>
      <meta name="description" content="ConveLabs concierge mobile lab services for medical providers. Pricing, hours, lab destinations (Quest, LabCorp, AdventHealth, Orlando Health), and how to refer patients." />
    </Helmet>

    <Header />

    <main className="bg-gray-50 min-h-screen">
      <section className="bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] text-white py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs uppercase tracking-wider opacity-80 mb-2">For medical providers</p>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">Concierge mobile lab services — at a glance</h1>
          <p className="text-base opacity-90">
            Everything you and your front desk need to refer patients to ConveLabs:
            services, pricing, lab destinations, scheduling, and billing options.
          </p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto py-8 px-6 space-y-6">

        {/* PRICING TABLE */}
        <Card className="shadow-sm">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-[#B91C1C]" />
              <h2 className="text-lg font-bold">Services & pricing</h2>
            </div>
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-gray-500">
                    <th className="text-left py-2 px-2">Service</th>
                    <th className="text-right py-2 px-2">Patient pays</th>
                    <th className="text-left py-2 px-2 hidden sm:table-cell">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr><td className="py-3 px-2 font-medium">Mobile blood draw (at home)</td><td className="text-right px-2">$150</td><td className="text-xs text-gray-500 hidden sm:table-cell px-2">60 min visit. Includes phlebotomist travel + delivery to lab.</td></tr>
                  <tr><td className="py-3 px-2 font-medium">Senior mobile draw (65+)</td><td className="text-right px-2">$100</td><td className="text-xs text-gray-500 hidden sm:table-cell px-2">Same service, discounted for seniors.</td></tr>
                  <tr><td className="py-3 px-2 font-medium">Office visit (standard)</td><td className="text-right px-2">$55</td><td className="text-xs text-gray-500 hidden sm:table-cell px-2">Patient comes to our partner office.</td></tr>
                  <tr><td className="py-3 px-2 font-medium">Specialty collection kit</td><td className="text-right px-2">$185</td><td className="text-xs text-gray-500 hidden sm:table-cell px-2">UPS/FedEx kits (e.g., functional medicine).</td></tr>
                  <tr><td className="py-3 px-2 font-medium">Genova Diagnostics kit</td><td className="text-right px-2">$200</td><td className="text-xs text-gray-500 hidden sm:table-cell px-2">Specialty Genova collection.</td></tr>
                  <tr><td className="py-3 px-2 font-medium">Therapeutic phlebotomy</td><td className="text-right px-2">$200</td><td className="text-xs text-gray-500 hidden sm:table-cell px-2">Blood removal per doctor order.</td></tr>
                  <tr><td className="py-3 px-2 font-medium">Additional patient (same visit)</td><td className="text-right px-2">+$75</td><td className="text-xs text-gray-500 hidden sm:table-cell px-2">Add household members at the same draw.</td></tr>
                </tbody>
              </table>
            </div>
            <div className="text-xs text-gray-600 space-y-1 pt-2 border-t">
              <p><strong>Surcharges:</strong> Same-day +$100 · Weekend +$75 · Extended-area cities (Clermont, Sanford, Lake Mary, etc.) +$75</p>
              <p><strong>Membership tiers:</strong> Member ($99/yr) saves $35 per visit · VIP ($199/yr) saves $50 + priority booking · Concierge ($399/yr) saves $85 + same-day at no surcharge</p>
            </div>
          </CardContent>
        </Card>

        {/* HOURS */}
        <Card className="shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-[#B91C1C]" />
              <h2 className="text-lg font-bold">Hours & scheduling</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-semibold text-gray-900">Standard appointments</p>
                <p className="text-gray-700">6:00 AM – 6:00 PM, Monday through Sunday</p>
                <p className="text-xs text-gray-500 mt-1">15-minute increments. Earliest morning slot is 6:00 AM.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">After-hours availability</p>
                <p className="text-gray-700">Up to 8:00 PM when phlebotomist is on duty</p>
                <p className="text-xs text-gray-500 mt-1">Same-day patients see only what's actually bookable.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Same-day cutoff</p>
                <p className="text-gray-700">3:00 PM (extended when phleb is on duty)</p>
                <p className="text-xs text-gray-500 mt-1">+$100 same-day surcharge applies.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Lead time</p>
                <p className="text-gray-700">Minimum 90 minutes before appointment start</p>
                <p className="text-xs text-gray-500 mt-1">Travel time + tube prep.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* LAB DESTINATIONS */}
        <Card className="shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-[#B91C1C]" />
              <h2 className="text-lg font-bold">Lab destinations</h2>
            </div>
            <p className="text-sm text-gray-700">
              Patients pick their preferred lab during booking. We <strong>do not run our own lab</strong> — we collect the specimen and deliver same-day so results route through the lab the provider already uses.
            </p>
            <ul className="text-sm space-y-1.5 ml-4 list-disc text-gray-700">
              <li><strong>Quest Diagnostics</strong> — Orlando, multiple drop-off locations</li>
              <li><strong>LabCorp</strong> — Orlando, includes extended-route locations</li>
              <li><strong>AdventHealth</strong> — 24/7 deliveries, no day-of cutoff</li>
              <li><strong>Orlando Health</strong> — outpatient lab</li>
              <li><strong>Genova Diagnostics</strong> — UPS/FedEx specialty kits</li>
              <li><strong>UPS / FedEx shipping</strong> — for specialty collection kits the provider has chosen</li>
            </ul>
            <p className="text-xs text-gray-500 mt-2">
              The patient gets a tracking ID once we drop the specimen. Results post in the lab's own portal — we don't intermediate them.
            </p>
          </CardContent>
        </Card>

        {/* HOW IT WORKS */}
        <Card className="shadow-sm">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-[#B91C1C]" />
              <h2 className="text-lg font-bold">How it works for your patients</h2>
            </div>
            <ol className="text-sm space-y-3 text-gray-700">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#B91C1C] text-white text-xs font-bold flex items-center justify-center">1</span>
                <div>
                  <p className="font-medium text-gray-900">Patient books at convelabs.com/book-now</p>
                  <p className="text-xs">Picks service, date, time, and lab destination. Uploads lab order (or our OCR pulls panels from a photo).</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#B91C1C] text-white text-xs font-bold flex items-center justify-center">2</span>
                <div>
                  <p className="font-medium text-gray-900">Pays via Stripe at checkout</p>
                  <p className="text-xs">Card, Apple Pay, or invoice. Confirmation email + SMS go out immediately.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#B91C1C] text-white text-xs font-bold flex items-center justify-center">3</span>
                <div>
                  <p className="font-medium text-gray-900">Phleb arrives within their selected window</p>
                  <p className="text-xs">Standard mobile visit is 60 minutes including draw + post-visit prep.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#B91C1C] text-white text-xs font-bold flex items-center justify-center">4</span>
                <div>
                  <p className="font-medium text-gray-900">Specimens delivered same-day to the chosen lab</p>
                  <p className="text-xs">Patient gets a delivery confirmation + tracking ID via SMS and email.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#B91C1C] text-white text-xs font-bold flex items-center justify-center">5</span>
                <div>
                  <p className="font-medium text-gray-900">Results post in the lab's portal — we check in at 72h</p>
                  <p className="text-xs">If the patient hasn't received them, we follow up directly with the lab. Provider sees results in their normal portal (Quest Quanum, LabCorp Link, AdventHealth, etc.).</p>
                </div>
              </li>
            </ol>
          </CardContent>
        </Card>

        {/* BILLING OPTIONS */}
        <Card className="shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[#B91C1C]" />
              <h2 className="text-lg font-bold">Billing options for partner practices</h2>
            </div>
            <p className="text-sm text-gray-700">
              Two ways to refer patients — pick whichever fits your practice's workflow:
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="border rounded-lg p-3 bg-gray-50">
                <p className="font-semibold text-sm text-gray-900">Patient-billed (default)</p>
                <p className="text-xs text-gray-600 mt-1">Patient pays ConveLabs directly at booking. You refer them, we handle the rest. No paperwork on your end.</p>
              </div>
              <div className="border rounded-lg p-3 bg-gray-50">
                <p className="font-semibold text-sm text-gray-900">Org-billed (partner discount)</p>
                <p className="text-xs text-gray-600 mt-1">We invoice your practice monthly at a discounted rate. Available for partner practices with regular volume — contact us to set up.</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Existing partner practices today: ND Wellness, NaturaMed, The Restoration Place, Elite Medical Concierge, Aristotle Education, and others.
            </p>
          </CardContent>
        </Card>

        {/* SERVICE AREA */}
        <Card className="shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-[#B91C1C]" />
              <h2 className="text-lg font-bold">Service area</h2>
            </div>
            <p className="text-sm text-gray-700">
              <strong>Greater Orlando metro</strong> — Orlando, Winter Park, Windermere, Doctor Phillips, Bay Hill, Isleworth, Maitland, Heathrow.
            </p>
            <p className="text-sm text-gray-700">
              <strong>Extended area (+$75 surcharge):</strong> Clermont, Lake Nona, Celebration, Kissimmee, Sanford, Lake Mary, Altamonte Springs, Oviedo, Reunion, Eustis, Mount Dora, Leesburg, Daytona Beach, DeLand.
            </p>
          </CardContent>
        </Card>

        {/* REFER A PATIENT CTA */}
        <Card className="shadow-sm bg-gradient-to-br from-[#B91C1C]/5 to-[#7F1D1D]/5 border-[#B91C1C]/20">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#B91C1C]" />
              <h2 className="text-lg font-bold">Ready to refer a patient?</h2>
            </div>
            <p className="text-sm text-gray-700">
              Send them this link directly: <code className="text-xs bg-white px-2 py-1 rounded border">convelabs.com/book-now</code>
            </p>
            <p className="text-sm text-gray-700">
              For partner practices: log into your provider portal to send a tokenized booking link with the lab order pre-attached.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild className="bg-[#B91C1C] hover:bg-[#991B1B] text-white">
                <Link to="/book-now">Patient booking link</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/login">Provider portal login</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/partner-with-us">Become a partner practice</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* CONTACT */}
        <Card className="shadow-sm">
          <CardContent className="p-6 space-y-3">
            <h2 className="text-lg font-bold">Contact us directly</h2>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-[#B91C1C]" />
                <a href="tel:+19415279169" className="font-medium hover:underline">(941) 527-9169</a>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-[#B91C1C]" />
                <a href="mailto:info@convelabs.com" className="font-medium hover:underline">info@convelabs.com</a>
              </div>
            </div>
            <p className="text-xs text-gray-500 pt-1">
              ConveLabs · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810
            </p>
          </CardContent>
        </Card>

      </div>
    </main>

    <Footer />
  </>
);

export default ForProviders;
