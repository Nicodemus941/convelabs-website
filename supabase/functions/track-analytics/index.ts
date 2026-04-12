import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { 
      sessionId, 
      visitorId, 
      userId, 
      eventType, 
      eventData, 
      ipAddress,
      userAgent,
      referrer 
    } = await req.json()

    console.log('Analytics event received:', { sessionId, eventType, visitorId })

    // Get or create visitor session
    let session = null
    const { data: existingSession } = await supabase
      .from('visitor_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single()

    if (existingSession) {
      // Update existing session
      const { data: updatedSession } = await supabase
        .from('visitor_sessions')
        .update({
          last_activity: new Date().toISOString(),
          user_id: userId || existingSession.user_id
        })
        .eq('session_id', sessionId)
        .select()
        .single()
      
      session = updatedSession
    } else {
      // Create new session with geolocation lookup
      let locationData = {}
      
      if (ipAddress) {
        try {
          // Simple IP geolocation (you can enhance this with a proper service)
          const geoResponse = await fetch(`http://ip-api.com/json/${ipAddress}`)
          const geoData = await geoResponse.json()
          
          if (geoData.status === 'success') {
            locationData = {
              city: geoData.city,
              state: geoData.regionName,
              zip_code: geoData.zip,
              coordinates: `(${geoData.lat},${geoData.lon})`
            }
          }
        } catch (error) {
          console.log('Geolocation failed:', error)
        }
      }

      // Parse user agent for device info
      const deviceInfo = parseUserAgent(userAgent || '')

      const { data: newSession } = await supabase
        .from('visitor_sessions')
        .insert({
          session_id: sessionId,
          visitor_id: visitorId,
          user_id: userId,
          ip_address: ipAddress,
          user_agent: userAgent,
          referrer: referrer,
          ...locationData,
          ...deviceInfo,
          started_at: new Date().toISOString(),
          last_activity: new Date().toISOString()
        })
        .select()
        .single()
      
      session = newSession
    }

    // Process different event types
    switch (eventType) {
      case 'page_view':
        await handlePageViewEvent(supabase, sessionId, eventData)
        break
      case 'funnel_stage':
        await handleFunnelEvent(supabase, sessionId, eventData)
        break
      case 'booking_intent':
        await handleBookingIntent(supabase, sessionId, eventData)
        break
      case 'booking_completed':
        await handleBookingCompleted(supabase, sessionId, eventData)
        break
      case 'ab_test_exposure':
        await handleABTestExposure(supabase, sessionId, eventData)
        break
      case 'ab_test_conversion':
        await handleABTestConversion(supabase, sessionId, eventData)
        break
    }

    // Update session duration
    if (session) {
      const sessionStart = new Date(session.started_at)
      const now = new Date()
      const durationSeconds = Math.floor((now.getTime() - sessionStart.getTime()) / 1000)
      
      await supabase
        .from('visitor_sessions')
        .update({ 
          total_duration_seconds: durationSeconds,
          last_activity: now.toISOString()
        })
        .eq('session_id', sessionId)
    }

    // Check for alerts
    await checkForAlerts(supabase, sessionId, eventType, eventData, session)

    return new Response(
      JSON.stringify({ success: true, session }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )

  } catch (error) {
    console.error('Analytics tracking error:', error)
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  }
})

async function handlePageViewEvent(supabase: any, sessionId: string, eventData: any) {
  const { page_path, page_title, time_on_page_seconds, scroll_depth } = eventData
  
  await supabase
    .from('page_view_events')
    .insert({
      session_id: sessionId,
      page_path,
      page_title,
      time_on_page_seconds: time_on_page_seconds || 0,
      scroll_depth_percentage: scroll_depth || 0,
      viewed_at: new Date().toISOString()
    })
}

async function handleFunnelEvent(supabase: any, sessionId: string, eventData: any) {
  const { stage, stage_order, event_data } = eventData
  
  await supabase
    .from('conversion_funnel_events')
    .insert({
      session_id: sessionId,
      stage,
      stage_order,
      event_data: event_data || {},
      occurred_at: new Date().toISOString()
    })
}

async function handleBookingIntent(supabase: any, sessionId: string, eventData: any) {
  // Mark high conversion intent
  await supabase
    .from('visitor_sessions')
    .update({ 
      visitor_score: 8,
      is_high_value: true
    })
    .eq('session_id', sessionId)
    
  await handleFunnelEvent(supabase, sessionId, {
    stage: 'booking_intent',
    stage_order: 4,
    event_data: eventData
  })
}

async function handleBookingCompleted(supabase: any, sessionId: string, eventData: any) {
  const { service_type, amount, booking_id } = eventData
  
  // Mark as converted
  await supabase
    .from('visitor_sessions')
    .update({ 
      converted: true,
      conversion_value: amount,
      visitor_score: 10
    })
    .eq('session_id', sessionId)
    
  // Track booking attribution
  await supabase
    .from('booking_attribution')
    .insert({
      session_id: sessionId,
      booking_id,
      service_type,
      service_amount: amount,
      booking_completed_at: new Date().toISOString()
    })
    
  await handleFunnelEvent(supabase, sessionId, {
    stage: 'booking_completed',
    stage_order: 5,
    event_data: eventData
  })
}

async function handleABTestExposure(supabase: any, sessionId: string, eventData: any) {
  const { experiment_id, variant } = eventData
  const now = new Date()
  const date = now.toISOString().split('T')[0]
  const hour = now.getHours()
  
  // Upsert AB test performance metrics
  await supabase
    .from('ab_test_performance')
    .upsert({
      experiment_id,
      variant,
      date,
      hour,
      impressions: 1
    }, {
      onConflict: 'experiment_id,variant,date,hour',
      ignoreDuplicates: false
    })
}

async function handleABTestConversion(supabase: any, sessionId: string, eventData: any) {
  const { experiment_id, variant, conversion_value } = eventData
  const now = new Date()
  const date = now.toISOString().split('T')[0]
  const hour = now.getHours()
  
  // Update AB test performance with conversion
  const { data: existing } = await supabase
    .from('ab_test_performance')
    .select('*')
    .eq('experiment_id', experiment_id)
    .eq('variant', variant)
    .eq('date', date)
    .eq('hour', hour)
    .single()
    
  if (existing) {
    await supabase
      .from('ab_test_performance')
      .update({
        conversions: existing.conversions + 1,
        revenue_cents: existing.revenue_cents + (conversion_value || 0)
      })
      .eq('id', existing.id)
  }
}

async function checkForAlerts(supabase: any, sessionId: string, eventType: string, eventData: any, session: any) {
  // High-value visitor alert
  if (session?.is_high_value && !session.converted) {
    const timeOnSite = session.total_duration_seconds || 0
    
    if (timeOnSite > 300) { // 5 minutes
      await supabase
        .from('conversion_alerts')
        .insert({
          alert_type: 'high_value_visitor',
          session_id: sessionId,
          title: 'High-Value Visitor Alert',
          message: `High-value visitor from ${session.city || 'Unknown'} has been on site for ${Math.floor(timeOnSite / 60)} minutes without booking`,
          severity: 'high',
          alert_data: {
            city: session.city,
            state: session.state,
            time_on_site: timeOnSite,
            visitor_score: session.visitor_score
          }
        })
    }
  }
  
  // Booking abandonment alert
  if (eventType === 'page_view' && eventData.page_path === '/' && session?.visitor_score >= 7) {
    await supabase
      .from('conversion_alerts')
      .insert({
        alert_type: 'abandoned_booking',
        session_id: sessionId,
        title: 'Booking Abandonment Alert',
        message: `Visitor returned to homepage after showing booking intent`,
        severity: 'medium',
        alert_data: {
          visitor_score: session.visitor_score,
          previous_intent: true
        }
      })
  }
}

function parseUserAgent(userAgent: string) {
  const isMobile = /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
  const isTablet = /iPad|Android(?!.*Mobile)/i.test(userAgent)
  
  let deviceType = 'desktop'
  if (isTablet) deviceType = 'tablet'
  else if (isMobile) deviceType = 'mobile'
  
  let browser = 'unknown'
  if (userAgent.includes('Chrome')) browser = 'chrome'
  else if (userAgent.includes('Firefox')) browser = 'firefox'
  else if (userAgent.includes('Safari')) browser = 'safari'
  else if (userAgent.includes('Edge')) browser = 'edge'
  
  let os = 'unknown'
  if (userAgent.includes('Windows')) os = 'windows'
  else if (userAgent.includes('Mac')) os = 'macos'
  else if (userAgent.includes('Linux')) os = 'linux'
  else if (userAgent.includes('Android')) os = 'android'
  else if (userAgent.includes('iOS')) os = 'ios'
  
  return {
    device_type: deviceType,
    browser,
    operating_system: os
  }
}