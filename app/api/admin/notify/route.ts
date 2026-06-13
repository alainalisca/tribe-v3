import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';

/**
 * Fan-out helper: insert a notification row for every admin user.
 *
 * Used to surface admin-relevant events (new signups, bug reports, etc.)
 * in the existing in-app NotificationBell for users with is_admin=true.
 * Service-role only — callers are server endpoints, not clients.
 */
export async function POST(request: NextRequest) {
  try {
    // T1-2: fail CLOSED. The previous `if (internalSecret && ...)` skipped the
    // check entirely when ADMIN_NOTIFY_SECRET was unset, leaving this admin
    // fan-out endpoint fully open — anyone could inject a notification into
    // every admin's bell (a phishing primitive). Now a missing secret denies.
    const internalSecret = process.env.ADMIN_NOTIFY_SECRET;
    const provided = request.headers.get('x-admin-notify-secret');
    if (!internalSecret || provided !== internalSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as {
      type: string;
      message: string;
      entity_type?: string | null;
      entity_id?: string | null;
      actor_id?: string | null;
    };

    if (!body.type || !body.message) {
      return NextResponse.json({ error: 'type and message are required' }, { status: 400 });
    }

    const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const { data: admins, error: adminsError } = await supabase
      .from('users')
      .select('id')
      .eq('is_admin', true)
      .neq('banned', true);

    if (adminsError) {
      logError(adminsError, { action: 'admin.notify.fetchAdmins' });
      return NextResponse.json({ error: 'Failed to fetch admins' }, { status: 500 });
    }

    if (!admins || admins.length === 0) {
      return NextResponse.json({ success: true, fanout: 0 });
    }

    const rows = admins
      .filter((a) => a.id !== body.actor_id)
      .map((a) => ({
        recipient_id: a.id,
        actor_id: body.actor_id ?? null,
        type: body.type,
        entity_type: body.entity_type ?? null,
        entity_id: body.entity_id ?? null,
        message: body.message,
      }));

    if (rows.length === 0) {
      return NextResponse.json({ success: true, fanout: 0 });
    }

    const { error: insertError } = await supabase.from('notifications').insert(rows);
    if (insertError) {
      logError(insertError, { action: 'admin.notify.insertNotifications' });
      return NextResponse.json({ error: 'Failed to insert notifications' }, { status: 500 });
    }

    return NextResponse.json({ success: true, fanout: rows.length });
  } catch (error: unknown) {
    logError(error, { route: '/api/admin/notify', action: 'fanout' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
