/**
 * ARCHIVED — RETIRED EDGE FUNCTION. NOT LIVE CODE. DO NOT DEPLOY.
 *
 * This is the verbatim deployed source of `send-push-notification` v5
 * (deployed 2025-11-17), preserved for the record only. Nothing calls it and
 * nothing should. The function is deleted from Supabase once this file lands.
 *
 * Why it was retired
 * ------------------
 * Superseded by the app path: /api/notifications/send, which delivers via FCM
 * using users.fcm_token, with a web-push fallback on push_subscription. This
 * function predates that and used the older web-push + push_subscriptions
 * mechanism exclusively.
 *
 * By the end it was doubly dead. Migration 111 had three triggers
 * (notify_join_request, notify_join_accepted, notify_new_message) POSTing here
 * with:
 *   1. no Authorization header — an Edge Function rejects that outright, and
 *   2. a payload shape this function never accepted. They sent
 *      { recipientUserId, title, body, url, sessionId, type }; this function
 *      accepts only { notificationId } and reads the content from the
 *      push_notifications table.
 * So those three could never have delivered a push even with correct auth.
 *
 * A fourth trigger, send_push_notification_trigger on push_notifications, did
 * match this contract, but routed through https://tribe-v3.vercel.app/api/push/send
 * — a route that has never existed. Live it returns 308 -> 307 (middleware
 * redirect to /auth) -> 405.
 *
 * Migration 136 dropped all four triggers and their functions. The Edge
 * Function is then deleted from Supabase, and the push_send_bearer Vault secret
 * that authenticated the dead /api/push/send call is removed with it.
 * chat_webhook_secret and the VAPID secrets are deliberately left in place —
 * both are still live, for chat push and for the app path's web-push fallback.
 *
 * Provenance: this file also existed in git and was deleted in 1e2abe8
 * (2026-02-19). That copy and this deployed source are identical apart from
 * trailing whitespace on five lines, lost in transit through the dashboard.
 * Two independent retrievals agreeing is the confirmation that this is the
 * real v5.
 *
 * Everything below this comment is unmodified: no reformatting, no lint fixes,
 * no type corrections. It is what actually ran.
 */

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
