
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check if the template already exists
    const { data: existingTemplates, error: checkError } = await supabaseClient
      .from('email_templates')
      .select('id')
      .eq('name', 'marketing-campaign')
      .limit(1)
    
    if (checkError) {
      throw checkError
    }

    // If template already exists, return it
    if (existingTemplates && existingTemplates.length > 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Template already exists',
          template: existingTemplates[0]
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // Create default marketing template
    const defaultTemplate = {
      name: 'marketing-campaign',
      subject_template: 'Special Offer from ConveLabs',
      description: 'Default marketing campaign template',
      body_template: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{{subject}}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
          }
          .header {
            background-color: #dc2626;
            color: white;
            padding: 20px;
            text-align: center;
          }
          .content {
            padding: 20px;
          }
          .footer {
            background-color: #f3f4f6;
            padding: 15px;
            text-align: center;
            font-size: 12px;
            color: #666;
          }
          .button {
            display: inline-block;
            background-color: #dc2626;
            color: white;
            padding: 10px 20px;
            text-decoration: none;
            border-radius: 4px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>ConveLabs</h1>
        </div>
        <div class="content">
          <p>Hello {{firstName}},</p>
          
          <p>{{customMessage}}</p>
          
          <p>We're excited to offer you our premium blood draw and laboratory services, bringing healthcare convenience directly to your home or office.</p>
          
          <center><a href="https://convelabs.com" class="button">Learn More</a></center>
          
          <p>For more information about our services, please visit our website or contact our customer service team.</p>
          
          <p>Thank you for choosing ConveLabs for your healthcare needs.</p>
          
          <p>Best regards,<br>
          The ConveLabs Team</p>
        </div>
        <div class="footer">
          <p>© 2025 ConveLabs. All rights reserved.</p>
          <p>123 Healthcare Avenue, Orlando, FL 12345</p>
          <p><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>
        </div>
      </body>
      </html>
      `
    }

    const { data, error } = await supabaseClient
      .from('email_templates')
      .insert(defaultTemplate)
      .select('id, name, subject_template, description')
      .single()
    
    if (error) {
      throw error
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Marketing template created successfully',
        template: data 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})
