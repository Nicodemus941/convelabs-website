import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowRight, Phone, Star, Clock, AlertCircle,
  Droplet, Stethoscope, Heart, UserPlus, Thermometer, Syringe, FlaskConical
} from 'lucide-react';
import { getServiceCatalog, type GHSServiceCatalogItem, type GHSAddOn } from '@/services/ghsBookingService';

const ICON_MAP: Record<string, React.ElementType> = {
  droplet: Droplet,
  stethoscope: Stethoscope,
  heart: Heart,
  'user-plus': UserPlus,
  thermometer: Thermometer,
  syringe: Syringe,
  flask: FlaskConical,
};

interface ServiceCatalogStepProps {
  onSelectService: (service: GHSServiceCatalogItem, addOns: GHSAddOn[]) => void;
  onRequestConcierge: () => void;
  partnerCode?: string | null;
}

const ServiceCatalogStep: React.FC<ServiceCatalogStepProps> = ({ onSelectService, onRequestConcierge, partnerCode }) => {
  const [services, setServices] = useState<GHSServiceCatalogItem[]>([]);
  const [addOns, setAddOns] = useState<GHSAddOn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedService, setSelectedService] = useState<GHSServiceCatalogItem | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await getServiceCatalog();
        if (!cancelled) {
          // Filter: only show public services (not partner services)
          let publicServices = (res.services || []).filter(s => !s.is_partner);
          
          // Always include partner services so users can see all pricing options
          const allPartnerServices = res.partnerServices || [];
          
          if (partnerCode) {
            // If partner code is set, prioritize matching partner service at top
            const matchedPartner = allPartnerServices.filter(
              (s: any) => s.partner_code?.toUpperCase() === partnerCode.toUpperCase()
            );
            const otherPartners = allPartnerServices.filter(
              (s: any) => s.partner_code?.toUpperCase() !== partnerCode.toUpperCase()
            );
            publicServices = [...matchedPartner, ...publicServices, ...otherPartners];
          } else {
            // No partner code — show all partner services after public services
            publicServices = [...publicServices, ...allPartnerServices];
          }
          
          // Sort by display_order
          publicServices.sort((a, b) => a.display_order - b.display_order);
          
          setServices(publicServices);
          setAddOns(res.addOns || []);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Unable to load services');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [partnerCode]);

  const toggleAddOn = (id: string) => {
    setSelectedAddOns(prev => 
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const handleContinue = () => {
    if (!selectedService) return;
    const chosen = addOns.filter(a => selectedAddOns.includes(a.id));
    onSelectService(selectedService, chosen);
  };

  const renderIcon = (iconName?: string) => {
    const Icon = iconName ? ICON_MAP[iconName] : Droplet;
    return Icon ? <Icon className="h-5 w-5" /> : <Droplet className="h-5 w-5" />;
  };

  const totalPrice = (selectedService?.starting_price || 0) + 
    addOns.filter(a => selectedAddOns.includes(a.id)).reduce((sum, a) => sum + a.price, 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <Skeleton className="h-8 w-48 mx-auto mb-2" />
          <Skeleton className="h-4 w-64 mx-auto" />
        </div>
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  if (error || services.length === 0) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
        <p className="text-foreground font-medium mb-2">
          {error || "We're having trouble loading services right now."}
        </p>
        <p className="text-muted-foreground text-sm mb-4">Please try again or reach out to us directly.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a href="tel:+19415279169" className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-conve-red text-white rounded-xl font-semibold min-h-[44px]">
            <Phone className="h-4 w-4" /> Call (941) 527-9169
          </a>
          <Button variant="outline" className="rounded-xl min-h-[44px]" onClick={onRequestConcierge}>
            Contact Concierge Support
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Choose Your Service</h2>
        <p className="text-muted-foreground">Select the service that fits your needs</p>
      </div>

      {/* Primary Service Cards */}
      <div className="space-y-3 mb-6">
        {services.map((service, i) => {
          const isSelected = selectedService?.id === service.id;
          return (
            <motion.button
              key={service.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => { setSelectedService(service); setSelectedAddOns([]); }}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left min-h-[72px] ${
                isSelected
                  ? 'border-conve-red bg-conve-red/5 ring-1 ring-conve-red/20'
                  : 'border-border hover:border-conve-red/40 hover:bg-accent/30'
              }`}
            >
              <div className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${
                isSelected ? 'bg-conve-red/10 text-conve-red' : 'bg-muted text-muted-foreground'
              }`}>
                {renderIcon(service.icon)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-foreground">{service.public_name}</span>
                  {service.is_partner && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                      Partner Pricing
                    </span>
                  )}
                  {service.badge_text && !service.is_partner && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-conve-red text-white px-2 py-0.5 rounded-full">
                      <Star className="h-2.5 w-2.5" /> {service.badge_text}
                    </span>
                  )}
                  {service.same_day_available && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                      <Clock className="h-2.5 w-2.5" /> Same-Day
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground line-clamp-1">{service.short_description}</span>
              </div>
              <div className="flex-shrink-0 text-right">
                <span className={`text-lg font-bold ${isSelected ? 'text-conve-red' : 'text-foreground'}`}>
                  ${service.starting_price}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Add-Ons Section (shown after service selected) */}
      {selectedService && addOns.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.25 }}
          className="mb-6"
        >
          <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wide">Optional Add-Ons</h3>
          <div className="space-y-2">
            {addOns.map(addOn => {
              const isChecked = selectedAddOns.includes(addOn.id);
              return (
                <label
                  key={addOn.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all min-h-[52px] ${
                    isChecked
                      ? 'border-conve-red/50 bg-conve-red/5'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => toggleAddOn(addOn.id)}
                    className="data-[state=checked]:bg-conve-red data-[state=checked]:border-conve-red"
                  />
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                    {renderIcon(addOn.icon)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground">{addOn.name}</span>
                    <span className="block text-xs text-muted-foreground">{addOn.description}</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground flex-shrink-0">+${addOn.price}</span>
                </label>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Continue Button */}
      {selectedService && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-sm text-muted-foreground">Estimated total</span>
            <span className="text-xl font-bold text-conve-red">${totalPrice}</span>
          </div>
          <Button
            onClick={handleContinue}
            className="w-full h-14 bg-conve-red hover:bg-conve-red-dark text-white font-semibold text-base rounded-xl min-h-[44px]"
          >
            Continue <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </motion.div>
      )}
    </div>
  );
};

export default ServiceCatalogStep;
