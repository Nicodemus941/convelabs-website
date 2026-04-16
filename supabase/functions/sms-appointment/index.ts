
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { twilio } from "../_shared/twilio.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Define conversation states
type ConversationState = 'INIT' | 'DATE' | 'TIME' | 'SERVICE' | 'LOCATION' | 'CONFIRM';

// User session to track conversation state
interface UserSession {
  userId?: string;
  phone: string;
  state: ConversationState;
  date?: string;
  time?: string;
  service?: string;
  address?: string;
  zipCode?: string;
  lastInteraction: Date;
}

// In-memory session store (in production, use a more persistent solution)
const sessions: Record<string, UserSession> = {};

// Available time slots
const timeSlots = [
  "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", 
  "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", 
  "4:00 PM", "5:00 PM"
];

// Available services
const services = [
  { id: "basic", name: "Basic Blood Panel" },
  { id: "comprehensive", name: "Comprehensive Panel" },
  { id: "hormone", name: "Hormone Panel" },
  { id: "vitamin", name: "Vitamin Panel" },
];

// Helper function to format dates for display
function formatDate(date: Date): string {
  const options: Intl.DateTimeFormatOptions = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  };
  return date.toLocaleDateString('en-US', options);
}

// Get or create session for a phone number
function getSession(phone: string): UserSession {
  if (!sessions[phone]) {
    sessions[phone] = {
      phone,
      state: 'INIT',
      lastInteraction: new Date()
    };
  }
  sessions[phone].lastInteraction = new Date();
  return sessions[phone];
}

// Handle the conversation flow based on current state
async function handleConversation(session: UserSession, message: string, supabaseAdmin: any): Promise<string> {
  message = message.trim().toLowerCase();
  
  // Special commands that work at any state
  if (message === 'restart' || message === 'cancel') {
    session.state = 'INIT';
    return "Welcome to ConveLabs appointment scheduling! Reply with 'book' to schedule a lab test appointment.";
  }
  
  // Handle conversation based on current state
  switch (session.state) {
    case 'INIT':
      if (message === 'book') {
        session.state = 'DATE';
        
        // Calculate available dates (next 30 days)
        const availableDates = [];
        const today = new Date();
        
        for (let i = 1; i <= 30; i++) {
          const date = new Date();
          date.setDate(today.getDate() + i);
          // Skip weekends for simplicity
          if (date.getDay() !== 0 && date.getDay() !== 6) {
            availableDates.push(date);
          }
        }
        
        // Show first 5 available dates
        let response = "Please select an appointment date by replying with the number:\n";
        for (let i = 0; i < 5; i++) {
          response += `${i + 1}. ${formatDate(availableDates[i])}\n`;
        }
        response += "Or reply with a date in MM/DD/YYYY format.";
        return response;
      }
      return "Welcome to ConveLabs appointment scheduling! Reply with 'book' to schedule a lab test appointment.";
      
    case 'DATE':
      try {
        let selectedDate;
        
        // Check if user entered a number to select from options
        if (/^[1-5]$/.test(message)) {
          const index = parseInt(message) - 1;
          const today = new Date();
          selectedDate = new Date();
          selectedDate.setDate(today.getDate() + index + 1);
          // Adjust if weekend
          if (selectedDate.getDay() === 0) selectedDate.setDate(selectedDate.getDate() + 1);
          if (selectedDate.getDay() === 6) selectedDate.setDate(selectedDate.getDate() + 2);
        } 
        // Or if they entered a date in MM/DD/YYYY format
        else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(message)) {
          selectedDate = new Date(message);
          if (isNaN(selectedDate.getTime())) {
            return "Invalid date format. Please use MM/DD/YYYY format or select a number from the list.";
          }
        } else {
          return "Please select a valid date option (1-5) or enter a date in MM/DD/YYYY format.";
        }
        
        // Save the date and move to time selection
        session.date = selectedDate.toISOString().split('T')[0];
        session.state = 'TIME';
        
        // Show available time slots
        let response = "Please select an appointment time by replying with the number:\n";
        timeSlots.forEach((time, index) => {
          response += `${index + 1}. ${time}\n`;
        });
        return response;
      } catch (error) {
        return "Invalid date format. Please use MM/DD/YYYY format or select a number from the list.";
      }
      
    case 'TIME':
      if (/^([1-9]|10)$/.test(message)) {
        const index = parseInt(message) - 1;
        if (index >= 0 && index < timeSlots.length) {
          session.time = timeSlots[index];
          session.state = 'SERVICE';
          
          // Show available services
          let response = "Please select a service by replying with the number:\n";
          services.forEach((service, index) => {
            response += `${index + 1}. ${service.name}\n`;
          });
          return response;
        }
      }
      return "Please select a valid time option (1-10).";
      
    case 'SERVICE':
      if (/^[1-4]$/.test(message)) {
        const index = parseInt(message) - 1;
        if (index >= 0 && index < services.length) {
          session.service = services[index].id;
          session.state = 'LOCATION';
          
          return "Please enter your address for the home visit (street, city, state, zip):";
        }
      }
      return "Please select a valid service option (1-4).";
      
    case 'LOCATION':
      // Basic address validation - check for zip code
      const zipCodeMatch = message.match(/\b\d{5}\b/);
      if (zipCodeMatch) {
        const addressParts = message.split(',').map(part => part.trim());
        
        if (addressParts.length >= 2) {
          // Extract zip code
          session.zipCode = zipCodeMatch[0];
          
          // Save full address
          session.address = message;
          session.state = 'CONFIRM';
          
          // Show confirmation summary
          const selectedService = services.find(s => s.id === session.service)?.name || session.service;
          
          return `Please confirm your appointment:\n` +
                 `Date: ${session.date}\n` +
                 `Time: ${session.time}\n` +
                 `Service: ${selectedService}\n` +
                 `Address: ${session.address}\n\n` +
                 `Reply 'confirm' to book this appointment or 'restart' to start over.`;
        }
      }
      return "Please enter a valid address including street, city, state, and zip code.";
      
    case 'CONFIRM':
      if (message === 'confirm') {
        try {
          // Try to find user by phone
          const { data: userData, error: userError } = await supabaseAdmin
            .from('user_profiles')
            .select('id')
            .eq('phone', session.phone)
            .single();
            
          let userId;
          
          if (userError || !userData) {
            // Create a light user account
            // This would be better with a proper auth flow, but for SMS demo this works
            const { data: newUser, error: createError } = await supabaseAdmin
              .from('user_profiles')
              .insert({
                full_name: 'SMS User',
                phone: session.phone,
              })
              .select();
              
            if (createError) throw createError;
            userId = newUser[0].id;
          } else {
            userId = userData.id;
          }
          
          // Create appointment date from date and time strings
          const dateStr = session.date!;
          const timeStr = session.time!;
          
          const [hours, minutes, period] = timeStr.match(/(\d+):(\d+) ([AP]M)/)?.slice(1) || [];
          let hour = parseInt(hours);
          if (period === 'PM' && hour < 12) hour += 12;
          if (period === 'AM' && hour === 12) hour = 0;
          
          const appointmentDate = new Date(dateStr);
          appointmentDate.setHours(hour, parseInt(minutes), 0, 0);
          
          // Save appointment to database
          const appointmentData = {
            patient_id: userId,
            appointment_date: appointmentDate.toISOString(),
            address: session.address,
            zipcode: session.zipCode,
            notes: `Service: ${session.service}\nBooked via SMS`,
            status: 'scheduled'
          };
          
          const { error: appointmentError } = await supabaseAdmin
            .from('appointments')
            .insert(appointmentData);
            
          if (appointmentError) throw appointmentError;
          
          // Reset the session
          session.state = 'INIT';
          
          return "Your appointment has been scheduled successfully! You'll receive a confirmation message with details. Reply with 'book' anytime to schedule another appointment.";
        } catch (error) {
          console.error('Error creating appointment:', error);
          return "We encountered an error while booking your appointment. Please try again or contact our support team for assistance.";
        }
      } else {
        return "Please reply with 'confirm' to book the appointment or 'restart' to start over.";
      }
  }
}

// Clean up old sessions (run periodically)
function cleanupSessions() {
  const now = new Date();
  for (const phone in sessions) {
    const session = sessions[phone];
    // Remove sessions older than 30 minutes
    const timeDiff = now.getTime() - session.lastInteraction.getTime();
    if (timeDiff > 30 * 60 * 1000) {
      delete sessions[phone];
    }
  }
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Global notification kill switch
  if (Deno.env.get('NOTIFICATIONS_SUSPENDED')) {
    return new Response(JSON.stringify({ success: true, suspended: true, message: 'Notifications suspended' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    // Initialize Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );
    
    // Cleanup old sessions
    cleanupSessions();
    
    if (req.method === 'POST') {
      const body = await req.json();
      
      // Handle Twilio webhook data
      const { From, Body } = body;
      
      if (!From || !Body) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
      
      // Get or create session for this phone number
      const phone = From.replace('+', '');
      const session = getSession(phone);
      
      // Process the message based on conversation state
      const responseMessage = await handleConversation(session, Body, supabaseAdmin);
      
      // Create TwiML response
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Message>${responseMessage}</Message>
        </Response>`;
      
      return new Response(twiml, { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'text/xml'
        } 
      });
    }
    
    // For non-POST requests (like testing the endpoint)
    return new Response(
      JSON.stringify({ status: 'SMS appointment scheduling service running' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('SMS appointment error:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
