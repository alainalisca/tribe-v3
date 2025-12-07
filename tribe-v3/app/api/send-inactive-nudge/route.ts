import { createClient } from '@/lib/supabase/server';
import { Resend } from 'resend';
import { NextResponse } from 'next/server';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email, preferred_language, created_at')
      .not('email', 'is', null);
    
    if (!users) {
      return NextResponse.json({ error: 'No users found' }, { status: 400 });
    }

    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoStr = twoWeeksAgo.toISOString().split('T')[0];

    let emailsSent = 0;
    let errors = 0;

    for (const user of users) {
      try {
        // Skip users created less than 2 weeks ago
        const userCreatedAt = new Date(user.created_at);
        if (userCreatedAt > twoWeeksAgo) continue;

        // Check if user has any recent activity
        const { data: recentParticipation } = await supabase
          .from('session_participants')
          .select('id')
          .eq('user_id', user.id)
          .gte('created_at', twoWeeksAgoStr)
          .limit(1);

        const { data: recentHosted } = await supabase
          .from('sessions')
          .select('id')
          .eq('creator_id', user.id)
          .gte('created_at', twoWeeksAgoStr)
          .limit(1);

        // Skip users with recent activity
        if (recentParticipation?.length || recentHosted?.length) continue;

        const lang = user.preferred_language || 'en';
        const isSpanish = lang === 'es';

        const subject = isSpanish
          ? `👋 Te extrañamos en Tribe`
          : `👋 We miss you on Tribe`;

        const greeting = isSpanish
          ? `Hola ${user.name},`
          : `Hi ${user.name},`;

        const message = isSpanish
          ? `Notamos que no has entrenado con nosotros últimamente. Tu comunidad de entrenamiento te está esperando.`
          : `We noticed you haven't trained with us lately. Your training community is waiting for you.`;

        const stats = isSpanish
          ? `Hay sesiones nuevas todos los días en tu área.`
          : `There are new sessions happening every day in your area.`;

        const cta = isSpanish
          ? `¡Vuelve y nunca entrenes solo!`
          : `Come back and never train alone!`;

        const buttonText = isSpanish ? 'Ver Sesiones' : 'Browse Sessions';
        const tagline = isSpanish ? 'Nunca Entrenes Solo' : 'Never Train Alone';

        await resend.emails.send({
          from: 'Tribe <notifications@resend.dev>',
          to: user.email,
          subject: subject,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px;">
              <div style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="text-align: center; margin-bottom: 20px;">
                  <h1 style="font-size: 28px; margin: 0;">Tribe<span style="color: #9EE551;">.</span></h1>
                  <p style="color: #9EE551; font-weight: 600; margin: 5px 0;">${tagline}</p>
                </div>
                
                <h2 style="color: #1e293b; margin-bottom: 15px;">${greeting}</h2>
                
                <p style="color: #374151; line-height: 1.6; font-size: 16px;">${message}</p>
                
                <p style="color: #374151; line-height: 1.6;">${stats}</p>
                
                <p style="color: #374151; line-height: 1.6; font-weight: 600;">${cta}</p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="https://tribe-v3.vercel.app/sessions" 
                     style="display: inline-block; background: #9EE551; color: #1e293b; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                    ${buttonText}
                  </a>
                </div>
                
                <div style="border-top: 1px solid #e5e7eb; margin-top: 30px; padding-top: 20px;">
                  <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                    ${isSpanish ? 'Tu comunidad de entrenamiento te extraña.' : 'Your training community misses you.'}
                  </p>
                </div>
              </div>
              
              <p style="text-align: center; color: #9ca3af; font-size: 11px; margin-top: 20px;">
                © ${new Date().getFullYear()} Tribe · ${tagline}
              </p>
            </div>
          `
        });

        emailsSent++;
      } catch (error: any) {
        console.error(`Error sending nudge to ${user.email}:`, error);
        errors++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      emailsSent,
      errors,
      totalUsers: users.length 
    });
  } catch (error: any) {
    console.error('Inactive nudge error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
