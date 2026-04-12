
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function notifyUser(userId: string, type: string, data: any) {
  try {
    // Call the send-credit-notification function
    const response = await fetch(
      `${supabaseUrl}/functions/v1/send-credit-notification`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({
          userId: userId,
          notificationType: type,
          ...data
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`Error calling notification function: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error sending notification:', error);
    throw error;
  }
}

Deno.serve(async (req) => {
  try {
    console.log('Starting credit check and notification process');
    
    // Check usage threshold notifications
    const { data: memberships, error: membershipError } = await supabase
      .from('user_memberships')
      .select('*, plan:plan_id(*)')
      .eq('status', 'active');
    
    if (membershipError) {
      throw new Error(`Error fetching memberships: ${membershipError.message}`);
    }
    
    console.log(`Processing ${memberships?.length || 0} active memberships`);
    
    // Process each membership for threshold notifications
    for (const membership of memberships || []) {
      // Skip if no allocation or user is in a pool
      if (!membership.credits_allocated_annual || membership.shared_pool_id) continue;
      
      const totalAllocated = membership.credits_allocated_annual;
      const remaining = membership.credits_remaining;
      const percentUsed = ((totalAllocated - remaining) / totalAllocated) * 100;
      
      // Send notifications at 75%, 90%, and 100% usage
      if (percentUsed >= 75 && percentUsed < 90) {
        await notifyUser(membership.user_id, 'usage_threshold', { threshold: 75 });
      } else if (percentUsed >= 90 && percentUsed < 100) {
        await notifyUser(membership.user_id, 'usage_threshold', { threshold: 90 });
      } else if (percentUsed >= 100) {
        await notifyUser(membership.user_id, 'usage_threshold', { threshold: 100 });
      }
    }
    
    // Process rollover expiration notifications
    const { data: rollovers, error: rolloverError } = await supabase
      .from('user_memberships')
      .select('*')
      .gt('rollover_credits', 0)
      .not('rollover_expiration_date', 'is', null);
    
    if (rolloverError) {
      throw new Error(`Error fetching rollover data: ${rolloverError.message}`);
    }
    
    console.log(`Processing ${rollovers?.length || 0} memberships with rollover credits`);
    
    // Calculate days to expiry and send notifications at 30, 15, and 5 days
    for (const rollover of rollovers || []) {
      const expiryDate = new Date(rollover.rollover_expiration_date);
      const today = new Date();
      const diffTime = expiryDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 30) {
        await notifyUser(rollover.user_id, 'rollover_expiration', { daysToExpiry: 30 });
      } else if (diffDays === 15) {
        await notifyUser(rollover.user_id, 'rollover_expiration', { daysToExpiry: 15 });
      } else if (diffDays === 5) {
        await notifyUser(rollover.user_id, 'rollover_expiration', { daysToExpiry: 5 });
      }
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Credit check and notifications processed successfully',
      processed_memberships: memberships?.length || 0,
      processed_rollovers: rollovers?.length || 0
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in check-credits-and-notify:', error);
    
    return new Response(JSON.stringify({
      error: error.message || 'An unknown error occurred',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
