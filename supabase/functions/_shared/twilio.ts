
import { Twilio } from "https://esm.sh/twilio@4.18.1";

// Get Twilio credentials from environment variables
const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
const messagingServiceSid = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");

// Initialize Twilio client if credentials are available
export const twilio = accountSid && authToken 
  ? new Twilio(accountSid, authToken) 
  : null;

// Function to send SMS via Twilio
export async function sendSMS(to: string, body: string): Promise<any> {
  if (!twilio) {
    throw new Error("Twilio is not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.");
  }
  
  if (!messagingServiceSid) {
    throw new Error("Twilio Messaging Service SID is not configured. Please set TWILIO_MESSAGING_SERVICE_SID environment variable.");
  }
  
  try {
    const message = await twilio.messages.create({
      to,
      body,
      messagingServiceSid
    });
    
    return message;
  } catch (error) {
    console.error("Error sending SMS:", error);
    throw error;
  }
}

// Function to validate webhook requests from Twilio
export function validateTwilioRequest(request: Request): boolean {
  // In a production environment, implement proper validation
  // using the X-Twilio-Signature header and the Twilio SDK
  return true;
}
