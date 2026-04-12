
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/AuthContext';

interface MembershipAgreementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  planName: string;
  billingFrequency: 'monthly' | 'quarterly' | 'annual';
  isSupernovaMember?: boolean;
  selectedAddOnId?: string | null;
  onAccept: () => void;
}

const MembershipAgreementModal: React.FC<MembershipAgreementModalProps> = ({
  open,
  onOpenChange,
  planId,
  planName,
  billingFrequency,
  isSupernovaMember = false,
  selectedAddOnId,
  onAccept,
}) => {
  const { user } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const handleAccept = async () => {
    if (!agreed) return;
    setLoading(true);
    
    try {
      await onAccept();
    } catch (error) {
      console.error('Error accepting agreement:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const billingText = billingFrequency === 'monthly' 
    ? 'monthly'
    : billingFrequency === 'quarterly'
      ? 'quarterly'
      : 'annual';
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">ConveLabs Membership Agreement</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-[60vh] mt-4 pr-4">
          <div className="text-sm space-y-4">
            <section className="space-y-2">
              <h3 className="text-lg font-semibold">Membership Terms</h3>
              <p>
                This agreement outlines the terms and conditions for your ConveLabs {planName} membership on a {billingText} billing plan.
                {isSupernovaMember && ' As a Supernova member, you will receive additional benefits as detailed below.'}
              </p>
            </section>
            
            {isSupernovaMember && (
              <section className="space-y-2 bg-gradient-to-r from-purple-50 to-blue-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-conve-red">Supernova Member Benefits</h3>
                <p>
                  As part of our limited-time Supernova offer, you will receive:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>10% discount on your annual membership fee</li>
                  <li>Locked-in Founders Pricing for the lifetime of your membership</li>
                  <li>1 bonus lab credit per billing cycle</li>
                  <li>1 premium add-on of your choice at no additional charge</li>
                  <li>Priority scheduling for appointments</li>
                  <li>Exclusive access to members-only services</li>
                </ul>
              </section>
            )}
            
            <section className="space-y-2">
              <h3 className="text-lg font-semibold">Billing</h3>
              <p>
                Your membership will be billed on a {billingText} basis according to the pricing plan you selected.
                {billingFrequency === 'annual' && ' Annual payments will be processed once per year on your renewal date.'}
                {billingFrequency === 'quarterly' && ' Quarterly payments will be processed every three months on your renewal date.'}
                {billingFrequency === 'monthly' && ' Monthly payments will be processed each month on your renewal date.'}
              </p>
              <p>
                You may cancel your membership at any time. Refunds are subject to our refund policy outlined in our Terms of Service.
              </p>
            </section>
            
            <section className="space-y-2">
              <h3 className="text-lg font-semibold">Credit Usage</h3>
              <p>
                Your membership includes a specific number of credits that can be redeemed for services. Credits are added to your account at the beginning of each billing cycle.
              </p>
              {billingFrequency !== 'monthly' && (
                <p>
                  Unused credits roll over for up to 3 months from the date they were issued.
                </p>
              )}
              {isSupernovaMember && (
                <p className="font-medium">
                  As a Supernova member, you will receive 1 additional credit per billing cycle.
                </p>
              )}
            </section>
            
            <section className="space-y-2">
              <h3 className="text-lg font-semibold">Privacy Policy</h3>
              <p>
                ConveLabs is committed to protecting your privacy. All personal and health information will be handled in accordance with our Privacy Policy and applicable healthcare privacy laws.
              </p>
            </section>
            
            <section className="space-y-2">
              <h3 className="text-lg font-semibold">Terms of Service</h3>
              <p>
                By checking the box below, you acknowledge that you have read, understood, and agree to our full Terms of Service available on our website.
              </p>
              <p>
                You also confirm that you are at least 18 years of age and have the legal capacity to enter into this agreement.
              </p>
            </section>
          </div>
        </ScrollArea>
        
        <div className="flex items-start space-x-3 pt-4 border-t">
          <Checkbox 
            id="agreement" 
            checked={agreed} 
            onCheckedChange={(checked) => setAgreed(checked === true)}
          />
          <Label htmlFor="agreement" className="text-sm font-normal">
            I have read and agree to the ConveLabs Membership Agreement, Terms of Service, and Privacy Policy
          </Label>
        </div>
        
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleAccept} 
            disabled={!agreed || loading}
            className="bg-conve-red hover:bg-conve-red/90"
          >
            {loading ? 'Processing...' : 'Continue to Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MembershipAgreementModal;
