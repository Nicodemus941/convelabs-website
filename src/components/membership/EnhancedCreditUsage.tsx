
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState } from "react";
import CreditPackPurchase from "./CreditPackPurchase";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

interface EnhancedCreditUsageProps {
  membership: {
    credits_remaining: number;
    credits_allocated_annual: number | null;
    rollover_credits: number | null;
    rollover_expiration_date: string | null;
    plan?: {
      name: string;
      credits_per_year: number;
    };
  } | null;
  totalAvailableCredits: number;
  daysToRolloverExpiry: number | null;
  onRefetch: () => void;
}

export default function EnhancedCreditUsage({ 
  membership, 
  totalAvailableCredits, 
  daysToRolloverExpiry, 
  onRefetch 
}: EnhancedCreditUsageProps) {
  const { user } = useAuth();
  const [showPurchase, setShowPurchase] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const allocatedCredits = membership?.credits_allocated_annual || 
                          membership?.plan?.credits_per_year || 0;
  const regularCredits = membership?.credits_remaining || 0;
  const rolloverCredits = membership?.rollover_credits || 0;
  
  const percentUsed = allocatedCredits > 0 
    ? ((allocatedCredits - regularCredits) / allocatedCredits) * 100 
    : 0;

  const handleCreditPurchase = async (packOption: { credits: number, price: number }) => {
    if (!user) {
      toast.error("You must be logged in to purchase credits");
      return;
    }

    setIsProcessing(true);
    try {
      // Get or create Stripe customer
      const { data: { url }, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          priceId: 'credit-pack',
          customAmount: packOption.price,
          metadata: {
            credits_amount: packOption.credits,
            type: 'credit_pack'
          }
        }
      });

      if (error) throw error;
      
      // Redirect to checkout
      if (url) {
        window.location.href = url;
      } else {
        throw new Error("No checkout URL returned");
      }
      
    } catch (error) {
      console.error("Credit purchase error:", error);
      toast.error("Failed to initiate credit purchase");
      setIsProcessing(false);
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Lab Service Credits</CardTitle>
            <CardDescription>
              Track your available lab service credits
            </CardDescription>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Info className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="w-80 p-4">
                <p className="font-medium">About Your Credits</p>
                <p className="mt-2 text-sm">Each lab service uses one credit. Regular credits are used first, followed by rollover credits, then any credits from purchased packs.</p>
                <p className="mt-2 text-sm">Rollover credits expire one year after they roll over.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!showPurchase ? (
          <>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Current Usage</span>
                <span className="font-medium">{regularCredits} of {allocatedCredits} regular credits</span>
              </div>
              <Progress 
                value={percentUsed} 
                className="h-2" 
                indicatorClassName={percentUsed > 75 ? "bg-amber-500" : undefined}
              />
            </div>
            
            <div className="rounded-lg bg-muted/50 p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium">Total Available Credits</p>
                  <p className="text-3xl font-bold mt-1">{totalAvailableCredits}</p>
                </div>
                
                <div className="text-right">
                  {rolloverCredits > 0 && daysToRolloverExpiry !== null && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Clock className="h-4 w-4 mr-1" />
                      <span>
                        {rolloverCredits} rollover {rolloverCredits === 1 ? 'credit' : 'credits'} expires in {daysToRolloverExpiry} days
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <CreditPackPurchase 
            onPurchase={handleCreditPurchase} 
            isProcessing={isProcessing}
          />
        )}
      </CardContent>
      <CardFooter>
        <Button 
          variant={showPurchase ? "outline" : "default"}
          onClick={() => setShowPurchase(!showPurchase)} 
          className="w-full"
          disabled={isProcessing}
        >
          {showPurchase ? "Cancel" : "Purchase Additional Credits"}
          {!showPurchase && <ArrowRight className="ml-2 h-4 w-4" />}
        </Button>
      </CardFooter>
    </Card>
  );
}
