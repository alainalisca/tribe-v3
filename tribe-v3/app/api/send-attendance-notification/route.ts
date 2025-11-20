import { createClient } from '@/lib/supabase/server';
import { Resend } from 'resend';
import { NextResponse } from 'next/server';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { sessionId, userId } = await request.json();
    
    const supabase = await createClient();
    
    // Get session details
    const { data: session } = await supabase
      .from('sessions')
      .select('*, creator:users!creator_id(name)')
      .eq('id', sessionId)
      .single();
    
    // Get user details
    const { data: user } = await supabase
      .from('users')
      .select('name, email')
      .eq('id', userId)
      .single();
    
    if (!session || !user?.email) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }
    
    // Send email
    await resend.emails.send({
      from: 'Tribe <notifications@resend.dev>',
      to: user.email,
      subject: `🎉 Share your ${session.sport} session photos!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Great session, ${user.name}! 🎉</h2>
          
          <p>Thanks for joining <strong>${session.sport}</strong> at ${session.location}!</p>
          
          <p>Share your photos from today's session to help build our community.</p>
          
          <a href="https://tribe-v3.vercel.app/session/${sessionId}" 
             style="display: inline-block; background: #B9E678; color: #1e293b; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0;">
            Upload Photos
          </a>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            You can upload up to 3 photos from this session.
          </p>
          
          <p style="color: #666; font-size: 12px; margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px;">
            Hosted by ${session.creator?.name || 'Tribe Community'}
          </p>
        </div>
      `
    });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Email send error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
