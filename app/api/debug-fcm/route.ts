import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) return NextResponse.json({ error: 'FIREBASE_SERVICE_ACCOUNT_KEY not set' });

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Failed to parse JSON', rawLength: raw.length, first50: raw.substring(0, 50) });
    }

    return NextResponse.json({
      project_id: parsed.project_id,
      client_email: parsed.client_email,
      private_key_exists: !!parsed.private_key,
      private_key_starts: parsed.private_key?.substring(0, 30),
      private_key_length: parsed.private_key?.length,
      type: parsed.type,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) });
  }
}
