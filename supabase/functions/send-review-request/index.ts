import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { patientEmail, patientName, reviewUrl, appointmentDate, serviceType } = await req.json()

    console.log('Review request email:', { patientEmail, patientName, reviewUrl })

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) {
      throw new Error('Missing Resend API key')
    }

    const resend = new Resend(RESEND_API_KEY)

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>How was your experience? - ConveLabs</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #0066cc; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .review-box { background: white; padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center; }
            .stars { font-size: 30px; margin: 15px 0; }
            .btn { background: #0066cc; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; margin: 10px 5px; }
            .btn:hover { background: #0052a3; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🌟 Thank you for choosing ConveLabs!</h1>
            </div>
            <div class="content">
              <h2>Hello ${patientName},</h2>
              <p>We hope your recent ${serviceType} appointment on ${new Date(appointmentDate).toLocaleDateString()} exceeded your expectations!</p>
              
              <div class="review-box">
                <h3>How was your experience?</h3>
                <div class="stars">⭐⭐⭐⭐⭐</div>
                <p>Your feedback helps us continue providing exceptional mobile healthcare services.</p>
                <a href="${reviewUrl}" class="btn">Leave a Review</a>
              </div>

              <h3>What made your experience great?</h3>
              <ul>
                <li>✅ Professional, certified phlebotomists</li>
                <li>✅ Convenient at-home service</li>
                <li>✅ Fast lab result delivery</li>
                <li>✅ Excellent customer care</li>
              </ul>

              <p>If you experienced any issues during your appointment, please don't hesitate to reach out to us directly. We're committed to making things right.</p>
              
              <p>Thank you for trusting ConveLabs with your healthcare needs. We look forward to serving you again!</p>
              
              <p>Best regards,<br>The ConveLabs Team</p>
            </div>
            <div class="footer">
              <p>ConveLabs - Professional Mobile Healthcare Services</p>
              <p>This email was sent because you recently had an appointment with us.</p>
            </div>
          </div>
        </body>
      </html>
    `

    const emailResponse = await resend.emails.send({
      from: 'ConveLabs <feedback@convelabs.com>',
      to: [patientEmail],
      subject: 'How was your ConveLabs experience? ⭐',
      html: emailHtml,
    })

    console.log('Review request email sent successfully:', emailResponse)

    return new Response(
      JSON.stringify({ 
        success: true, 
        emailId: emailResponse.data?.id,
        message: 'Review request email sent successfully' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Review request email error:', error)
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