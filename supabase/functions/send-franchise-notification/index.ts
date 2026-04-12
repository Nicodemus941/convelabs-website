
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { sendEmail } from "../_shared/email/providers.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FranchiseNotificationRequest {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  hasExperience: string;
  estimatedBudget: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fullName, email, phone, location, hasExperience, estimatedBudget } = 
      await req.json() as FranchiseNotificationRequest;
    
    const emailData = {
      to: "admin@convelabs.com",
      subject: "New Franchise Application Received",
      html: `
        <h1>New Franchise Application</h1>
        <p>A new franchise application has been submitted with the following details:</p>
        <ul>
          <li><strong>Name:</strong> ${fullName}</li>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Phone:</strong> ${phone}</li>
          <li><strong>Location:</strong> ${location}</li>
          <li><strong>Has Healthcare Experience:</strong> ${hasExperience}</li>
          <li><strong>Estimated Budget:</strong> ${estimatedBudget}</li>
        </ul>
        <p>Please review this application in the admin dashboard.</p>
      `,
      text: `
        New Franchise Application
        
        A new franchise application has been submitted with the following details:
        
        Name: ${fullName}
        Email: ${email}
        Phone: ${phone}
        Location: ${location}
        Has Healthcare Experience: ${hasExperience}
        Estimated Budget: ${estimatedBudget}
        
        Please review this application in the admin dashboard.
      `
    };
    
    const result = await sendEmail(emailData);
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    return new Response(
      JSON.stringify({ success: true }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error) {
    console.error('Error in send-franchise-notification function:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'An unexpected error occurred'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
