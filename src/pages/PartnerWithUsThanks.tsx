import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { CheckCircle2, Mail, Phone, ArrowLeft, Clock } from 'lucide-react';
import Header from '@/components/home/Header';
import Footer from '@/components/home/Footer';

/**
 * PartnerWithUsThanks — confirmation page after a provider submits the
 * partnership inquiry form. Keeps it warm, sets expectations (24h), and
 * offers a phone number for those who want to skip the wait.
 */
const PartnerWithUsThanks: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>Thank you — ConveLabs partnership inquiry received</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-50 to-white">
        <Header />

        <main className="flex-grow py-16 md:py-24">
          <div className="container mx-auto px-4 max-w-xl text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
              Got it — thanks for reaching out.
            </h1>
            <p className="text-base text-gray-600 mb-8 leading-relaxed">
              Your inquiry landed in my inbox. I read every one personally and reply within 24 hours — usually faster on weekdays.
            </p>

            <div className="bg-white border border-gray-200 rounded-2xl p-6 text-left mb-8">
              <p className="text-[11px] uppercase tracking-widest text-gray-500 font-bold mb-3">What happens next</p>
              <ol className="space-y-3 text-sm text-gray-700">
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 h-6 w-6 rounded-full bg-conve-red text-white text-xs font-bold flex items-center justify-center">1</span>
                  <span>I review your practice info and reply with a short proposal — pricing, timelines, and any questions I have for you.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 h-6 w-6 rounded-full bg-conve-red text-white text-xs font-bold flex items-center justify-center">2</span>
                  <span>If it's a fit, we hop on a 10-minute call to finalize the terms and figure out your first week.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 h-6 w-6 rounded-full bg-conve-red text-white text-xs font-bold flex items-center justify-center">3</span>
                  <span>We spin up your branded portal, add your team, and you're live in under 48 hours from "yes."</span>
                </li>
              </ol>
            </div>

            {/* Fast path: call or email */}
            <div className="bg-conve-red/5 border border-conve-red/20 rounded-xl p-5 mb-8 text-left">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-conve-red" />
                <p className="font-semibold text-sm text-gray-900">Want to skip the wait?</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <a
                  href="tel:+19415279169"
                  className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-semibold text-gray-900 hover:border-conve-red/40 transition-colors"
                >
                  <Phone className="h-4 w-4 text-conve-red" /> (941) 527-9169
                </a>
                <a
                  href="mailto:info@convelabs.com"
                  className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-semibold text-gray-900 hover:border-conve-red/40 transition-colors"
                >
                  <Mail className="h-4 w-4 text-conve-red" /> info@convelabs.com
                </a>
              </div>
            </div>

            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-conve-red"
            >
              <ArrowLeft className="h-4 w-4" /> Back to home
            </Link>

            <p className="text-[11px] text-gray-400 italic mt-10">
              — Nicodemme "Nico" Jean-Baptiste, Founder · ConveLabs
            </p>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default PartnerWithUsThanks;
