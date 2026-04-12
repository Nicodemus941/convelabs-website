
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { formatPrice } from '@/services/stripe';

interface CreditPackOption {
  id: string;
  credits: number;
  price: number;
  label: string;
}

interface CreditPackPurchaseProps {
  onPurchase: (packOption: CreditPackOption) => Promise<void>;
  isProcessing?: boolean;
}

export default function CreditPackPurchase({ onPurchase, isProcessing = false }: CreditPackPurchaseProps) {
  const [selectedPack, setSelectedPack] = useState<string>('standard');

  const creditPackOptions: CreditPackOption[] = [
    {
      id: 'single',
      credits: 1,
      price: 15000, // $150.00 — non-member rate
      label: 'Single Visit'
    },
    {
      id: 'standard',
      credits: 4,
      price: 54000, // $540.00 ($135/visit — 10% savings)
      label: 'Standard Pack'
    },
    {
      id: 'premium',
      credits: 8,
      price: 96000, // $960.00 ($120/visit — 20% savings)
      label: 'Premium Pack'
    }
  ];

  const selectedPackOption = creditPackOptions.find(option => option.id === selectedPack);

  const handlePurchase = async () => {
    if (!selectedPackOption) {
      toast.error('Please select a credit pack option');
      return;
    }

    try {
      await onPurchase(selectedPackOption);
    } catch (error) {
      console.error('Purchase error:', error);
      toast.error('Failed to process purchase');
    }
  };

  return (
    <Card className="w-full shadow">
      <CardHeader>
        <CardTitle>Purchase Additional Credits</CardTitle>
        <CardDescription>
          Need more lab services? Purchase additional credit packs to continue booking.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup 
          value={selectedPack} 
          onValueChange={setSelectedPack} 
          className="space-y-4"
        >
          {creditPackOptions.map((option) => (
            <div
              key={option.id}
              className={`flex items-center space-x-4 rounded-md border p-4 ${
                selectedPack === option.id ? 'border-primary bg-primary/5' : ''
              }`}
            >
              <RadioGroupItem value={option.id} id={option.id} />
              <Label 
                htmlFor={option.id} 
                className="flex flex-1 cursor-pointer justify-between"
              >
                <div>
                  <p className="font-medium">{option.label}</p>
                  <p className="text-sm text-muted-foreground">{option.credits} credits</p>
                </div>
                <div className="text-right font-medium">
                  {formatPrice(option.price)}
                </div>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
      <CardFooter>
        <Button 
          onClick={handlePurchase} 
          className="w-full"
          disabled={isProcessing}
        >
          {isProcessing ? 'Processing...' : `Purchase ${selectedPackOption?.credits} Credits`}
        </Button>
      </CardFooter>
    </Card>
  );
}
