import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getDistanceInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export async function POST(request: Request) {
  try {
    const { sessionId, sport, location, latitude, longitude, startIn, creatorId } = await request.json();

    if (!latitude || !longitude) {
      return NextResponse.json({ error: 'Location required' }, { status: 400 });
    }

    const { data: creator } = await supabase
      .from('users')
      .select('name')
      .eq('id', creatorId)
      .single();

    const creatorName = creator?.name || 'Someone';

    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, push_token, sports, latitude, longitude, language')
      .not('push_token', 'is', null)
      .neq('id', creatorId);

    if (error) {
      console.error('Error fetching users:', error);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    if (!users || users.length === 0) {
      return NextResponse.json({ notified: 0 });
    }

    const nearbyUsers = users.filter(user => {
      const userSports = user.sports || [];
      const hasSport = userSports.includes(sport);
      if (!hasSport) return false;

      if (user.latitude && user.longitude) {
        const distance = getDistanceInKm(latitude, longitude, user.latitude, user.longitude);
        return distance <= 5;
      }
      return true;
    });

    if (nearbyUsers.length === 0) {
      return NextResponse.json({ notified: 0 });
    }

    const notifications = nearbyUsers.map(user => {
      const isSpanish = user.language === 'es';
      const startText = startIn === 0 
        ? (isSpanish ? 'ahora' : 'now')
        : (isSpanish ? `en ${startIn} minutos` : `in ${startIn} minutes`);

      return {
        to: user.push_token,
        sound: 'default',
        title: isSpanish 
          ? `${creatorName} quiere entrenar ${sport}!`
          : `${creatorName} wants to train ${sport}!`,
        body: isSpanish
          ? `Empieza ${startText} en ${location}. Toca para unirte.`
          : `Starting ${startText} at ${location}. Tap to join.`,
        data: { sessionId, type: 'immediate_session', url: `/session/${sessionId}` },
      };
    });

    const pushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notifications),
    });

    if (!pushResponse.ok) {
      console.error('Push notification failed:', await pushResponse.text());
    }

    return NextResponse.json({ notified: nearbyUsers.length, users: nearbyUsers.map(u => u.name) });

  } catch (error: any) {
    console.error('Notify nearby error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
