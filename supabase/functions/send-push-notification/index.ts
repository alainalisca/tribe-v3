import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as webpush from 'https://esm.sh/web-push@3.6.6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestPayload {
  notificationId: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload: RequestPayload = await req.json()
    console.log('Request payload:', payload)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get notification details
    const { data: notification, error: notifError } = await supabase
      .from('push_notifications')
      .select('*')
      .eq('id', payload.notificationId)
      .single()

    if (notifError || !notification) {
      return new Response(
        JSON.stringify({ error: 'Notification not found' }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // Get user's push subscription
    const { data: subscription, error: subError } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', notification.user_id)
      .single()

    if (subError || !subscription) {
      console.log('No subscription for user:', notification.user_id)
      await supabase
        .from('push_notifications')
        .update({ sent: true, sent_at: new Date().toISOString() })
        .eq('id', payload.notificationId)
      
      return new Response(
        JSON.stringify({ error: 'No subscription found' }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Configure VAPID
    const vapidPublicKey = Deno.env.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY') ?? ''
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
    const vapidEmail = Deno.env.get('VAPID_EMAIL') ?? ''

    if (!vapidPublicKey || !vapidPrivateKey || !vapidEmail) {
      throw new Error('VAPID keys not configured')
    }

    webpush.setVapidDetails(
      `mailto:${vapidEmail}`,
      vapidPublicKey,
      vapidPrivateKey
    )

    // Prepare notification payload
    const pushPayload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      data: notification.data,
      tag: `tribe-${notification.data.type || 'general'}`,
      requireInteraction: false,
      actions: [
        { action: 'open', title: 'Open' },
        { action: 'close', title: 'Close' }
      ]
    })

    // Send the push notification
    console.log('Sending push to:', subscription.subscription.endpoint)
    const result = await webpush.sendNotification(
      subscription.subscription,
      pushPayload
    )

    console.log('Push sent successfully:', result.statusCode)

    // Mark as sent
    await supabase
      .from('push_notifications')
      .update({ sent: true, sent_at: new Date().toISOString() })
      .eq('id', payload.notificationId)

    return new Response(
      JSON.stringify({ success: true, message: 'Push notification sent' }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Error sending push:', error)
    return new Response(
      JSON.stringify({ error: error.message }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
