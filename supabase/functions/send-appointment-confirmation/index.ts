import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { appointmentId, patientEmail, patientName, appointmentDate, appointmentTime } = await req.json()

    console.log('Email confirmation request:', { appointmentId, patientEmail, patientName })

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Appointment Confirmation - ConveLabs</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #0066cc; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .appointment-details { background: white; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .btn { background: #0066cc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🩺 ConveLabs Appointment Confirmed</h1>
            </div>
            <div class="content">
              <h2>Hello ${patientName},</h2>
              <p>Your appointment has been confirmed! We're looking forward to providing you with excellent mobile healthcare services.</p>
              
              <div class="appointment-details">
                <h3>📅 Appointment Details</h3>
                <p><strong>Date:</strong> ${new Date(appointmentDate).toLocaleDateString()}</p>
                <p><strong>Time:</strong> ${appointmentTime}</p>
                <p><strong>Service:</strong> Mobile Lab Draw</p>
                <p><strong>Appointment ID:</strong> ${appointmentId}</p>
              </div>

              <h3>📋 What to Prepare:</h3>
              <ul>
                <li>Valid photo ID</li>
                <li>Lab order or requisition (if applicable)</li>
                <li>Insurance card (if using insurance)</li>
                <li>Drink plenty of water before your appointment</li>
              </ul>

              <p>If you need to reschedule or have any questions, please contact us as soon as possible.</p>
              
              <p>Thank you for choosing ConveLabs!</p>
              <p>Best regards,<br>The ConveLabs Team</p>
            </div>
            <div class="footer">
              <p>ConveLabs - Professional Mobile Healthcare Services</p>
              <p>This is an automated message. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `

    // For now, just log the email content since we need Resend API key
    console.log('Email content generated:', emailHtml)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email confirmation prepared (requires Resend API key to send)' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Email confirmation error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})