import React from 'react';
import { Link } from 'react-router-dom';
import { Container } from "@/components/ui/container";
import { useAuth } from "@/contexts/AuthContext";
import { Gem, FlaskConical, CalendarDays, User, Stethoscope, Shield } from "lucide-react";
import { ENROLLMENT_URL, TESTS_URL, BOOKING_URL, AUTH_URL, withSource } from '@/lib/constants/urls';
import { useBookingModalSafe } from '@/contexts/BookingModalContext';

const Footer = () => {
  const { user } = useAuth();
  const bookingModal = useBookingModalSafe();
  return (
    <footer className="bg-gray-900 text-white py-12">
      <Container>
        {/* Quick Links Section */}
        <div className="mb-12 pb-8 border-b border-gray-800">
          <h3 className="text-lg font-semibold mb-4 text-center">Quick Access</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <button
              onClick={() => bookingModal?.openModal('footer') || (window.location.href = BOOKING_URL)}
              className="flex flex-col items-center p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors group"
            >
              <CalendarDays className="h-6 w-6 mb-2 text-conve-red" />
              <span className="text-xs font-medium text-center group-hover:text-conve-red transition-colors">
                Book Appointment
              </span>
            </button>
            <a
              href="/login?redirect=/dashboard"
              className="flex flex-col items-center p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors group"
            >
              <User className="h-6 w-6 mb-2 text-conve-red" />
              <span className="text-xs font-medium text-center group-hover:text-conve-red transition-colors">
                Patient Portal
              </span>
            </a>
            {/* Staff & Provider portals — only visible to non-patients */}
            {(!user || !['patient'].includes(user.role || '')) && (
              <>
                <a href="/login?redirect=/dashboard/phlebotomist" className="flex flex-col items-center p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors group">
                  <Shield className="h-6 w-6 mb-2 text-conve-red" />
                  <span className="text-xs font-medium text-center group-hover:text-conve-red transition-colors">Staff Portal</span>
                </a>
                <a href="/login?redirect=/dashboard/concierge_doctor" className="flex flex-col items-center p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors group">
                  <Stethoscope className="h-6 w-6 mb-2 text-conve-red" />
                  <span className="text-xs font-medium text-center group-hover:text-conve-red transition-colors">Provider Portal</span>
                </a>
              </>
            )}
            <a
              href="/pricing"
              className="flex flex-col items-center p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors group"
            >
              <Gem className="h-6 w-6 mb-2 text-conve-red" />
              <span className="text-xs font-medium text-center group-hover:text-conve-red transition-colors">
                Membership
              </span>
            </a>
            <a
              href="/lab-testing"
              className="flex flex-col items-center p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors group"
            >
              <FlaskConical className="h-6 w-6 mb-2 text-conve-red" />
              <span className="text-xs font-medium text-center group-hover:text-conve-red transition-colors">
                Lab Tests
              </span>
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-1">
            <h3 className="text-xl font-bold mb-4">ConveLabs<span className="text-conve-red">.</span></h3>
            <p className="text-gray-400 mb-4">
              Luxury mobile phlebotomy services, bringing healthcare to your doorstep.
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Services</h4>
            <ul className="space-y-3">
              <li><Link to="/pricing" className="text-gray-400 hover:text-white transition-colors inline-block py-1">Memberships</Link></li>
              <li><Link to="/partnerships" className="text-gray-400 hover:text-white transition-colors inline-block py-1">Partnerships</Link></li>
              <li><Link to="/services/at-home" className="text-gray-400 hover:text-white transition-colors inline-block py-1">At-Home Testing</Link></li>
              <li><Link to="/services/concierge-doctor" className="text-gray-400 hover:text-white transition-colors inline-block py-1">Concierge Doctor</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Company</h4>
            <ul className="space-y-3">
              <li><Link to="/about" className="text-gray-400 hover:text-white transition-colors inline-block py-1">About Us</Link></li>
              <li><Link to="/contact" className="text-gray-400 hover:text-white transition-colors inline-block py-1">Contact</Link></li>
              <li><Link to="/services" className="text-gray-400 hover:text-white transition-colors inline-block py-1">Services</Link></li>
              <li><Link to="/privacy-policy" className="text-gray-400 hover:text-white transition-colors inline-block py-1">Privacy Policy</Link></li>
              <li><Link to="/terms" className="text-gray-400 hover:text-white transition-colors inline-block py-1">Terms & Conditions</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Locations</h4>
            <ul className="space-y-3">
              <li><Link to="/locations/orlando" className="text-gray-400 hover:text-white transition-colors inline-block py-1">Orlando</Link></li>
              <li><Link to="/locations/winter-park" className="text-gray-400 hover:text-white transition-colors inline-block py-1">Winter Park</Link></li>
              <li><Link to="/locations/windermere" className="text-gray-400 hover:text-white transition-colors inline-block py-1">Windermere</Link></li>
              <li><Link to="/locations/doctor-phillips" className="text-gray-400 hover:text-white transition-colors inline-block py-1">Doctor Phillips</Link></li>
              <li><Link to="/contact" className="text-gray-400 hover:text-white transition-colors inline-block py-1">All Locations</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-gray-800 mt-8 pt-6 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400">© {new Date().getFullYear()} ConveLabs. All rights reserved.</p>
          <div className="flex space-x-4 mt-4 md:mt-0">
            <a href="https://twitter.com/convelabs" className="text-gray-400 hover:text-white" aria-label="Twitter" target="_blank" rel="noopener noreferrer">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84"></path></svg>
            </a>
            <a href="https://facebook.com/convelabs" className="text-gray-400 hover:text-white" aria-label="Facebook" target="_blank" rel="noopener noreferrer">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"></path></svg>
            </a>
            <a href="https://instagram.com/convelabs" className="text-gray-400 hover:text-white" aria-label="Instagram" target="_blank" rel="noopener noreferrer">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.045-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z"></path></svg>
            </a>
          </div>
        </div>
      </Container>
    </footer>
  );
};

export default Footer;
