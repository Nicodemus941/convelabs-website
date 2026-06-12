
import { Twilio } from "https://esm.sh/twilio@4.18.1";

// Get Twilio credentials from environment variables
const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
// ConveLabs sends ONLY from its own number (407). The shared messaging service
// (TWILIO_MESSAGING_SERVICE_SID) was pooling both the ConveLabs and E-Labus
// numbers, so ConveLabs texts were leaving on the E-Labus 717 number. Pin to From.
const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

// Initialize Twilio client if credentials are available
export const twilio = accountSid && authToken
  ? new Twilio(accountSid, authToken)
  : null;

// Function to send SMS via Twilio
export async function sendSMS(to: string, body: string): Promise<any> {
  if (!twilio) {
    throw new Error("Twilio is not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.");
  }

  if (!fromNumber) {
    throw new Error("ConveLabs sending number is not configured. Please set TWILIO_PHONE_NUMBER (the 407 ConveLabs number).");
  }

  try {
    const message = await twilio.messages.create({
      to,
      body,
      from: fromNumber
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
