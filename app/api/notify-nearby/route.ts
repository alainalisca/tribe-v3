import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

function getDistanceInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export async function POST(request: Request) {
  try {
    const { sessionId, sport, location, latitude, longitude, startIn, creatorId } = await request.json();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get creator name
    const { data: creator } = await supabase
      .from('users')
      .select('name')
      .eq('id', creatorId)
      .single();

    const creatorName = creator?.name || 'Someone';

    // Get users with push subscriptions
    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, push_subscription, sports, latitude, longitude, preferred_language')
      .not('push_subscription', 'is', null)
      .neq('id', creatorId);

    if (error) {
      console.error('Error fetching users:', error);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    if (!users || users.length === 0) {
      return NextResponse.json({ notified: 0 });
    }

    // Filter nearby users who have matching sports
    const nearbyUsers = users.filter(user => {
      const userSports = user.sports || [];
      const hasSport = userSports.length === 0 || userSports.includes(sport);
      
      if (user.latitude && user.longitude && latitude && longitude) {
        const distance = getDistanceInKm(latitude, longitude, user.latitude, user.longitude);
        return hasSport && distance <= 10; // 10km radius
      }
      return hasSport;
    });

    if (nearbyUsers.length === 0) {
      return NextResponse.json({ notified: 0 });
    }

    // Send notifications
    let notifiedCount = 0;
    
    for (const user of nearbyUsers) {
      try {
        const isSpanish = user.preferred_language === 'es';
        const startText = startIn === 0 
          ? (isSpanish ? 'ahora' : 'now')
          : (isSpanish ? `en ${startIn} min` : `in ${startIn} min`);

        const title = isSpanish 
          ? `🏋️ ${creatorName} quiere entrenar ${sport}!`
          : `🏋️ ${creatorName} wants to train ${sport}!`;
        
        const body = isSpanish
          ? `Empieza ${startText} en ${location}. ¡Únete ahora!`
          : `Starting ${startText} at ${location}. Join now!`;

        const subscription = typeof user.push_subscription === 'string' 
          ? JSON.parse(user.push_subscription) 
          : user.push_subscription;

        const payload = JSON.stringify({
          title,
          body,
          url: `/session/${sessionId}`
        });

        await webpush.sendNotification(subscription, payload);
        notifiedCount++;
      } catch (err) {
        console.error(`Failed to notify user ${user.id}:`, err);
      }
    }

    return NextResponse.json({ 
      notified: notifiedCount,
      total: nearbyUsers.length 
    });

  } catch (error: any) {
    console.error('Error in notify-nearby:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
