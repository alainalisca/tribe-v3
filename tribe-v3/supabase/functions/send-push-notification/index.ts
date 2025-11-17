import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NotificationPayload {
  recipientUserId: string
  title: string
  body: string
  url?: string
  sessionId?: string
  type?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload: NotificationPayload = await req.json()
    console.log('Notification payload:', payload)

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get recipient's push subscription
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('push_subscription')
      .eq('id', payload.recipientUserId)
      .single()

    if (userError || !user?.push_subscription) {
      console.log('No push subscription found for user:', payload.recipientUserId)
      return new Response(
        JSON.stringify({ error: 'No subscription found' }), 
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 // Return 200 so trigger doesn't fail
        }
      )
    }

    // Get VAPID keys from environment
    const vapidPublicKey = Deno.env.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY') ?? ''
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? ''

    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error('VAPID keys not configured')
    }

    // Prepare web push payload
    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/',
      sessionId: payload.sessionId,
      type: payload.type || 'general',
      tag: `tribe-${payload.type || 'general'}`
    })

    // Send push notification using web-push protocol
    const subscription = user.push_subscription
    const endpoint = subscription.endpoint
    
    // For now, log the notification (we'll implement actual sending next)
    console.log('Would send push to:', endpoint)
    console.log('Payload:', pushPayload)

    return new Response(
      JSON.stringify({ success: true, message: 'Notification logged' }), 
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Error sending push notification:', error)
    return new Response(
      JSON.stringify({ error: error.message }), 
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
