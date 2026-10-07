import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireAthleteValuePage } from '@/lib/features/athleteValueServer';
import { fetchAdminPrograms, fetchIsAppAdmin, fetchPartnersWithoutProgram } from '@/lib/dal/athleteAdmin';
import { fetchPartnerSummary } from '@/lib/dal/athleteGym';
import { toGymView, type GymView } from '@/lib/atletas/gymView';
import AdminAthletes, { type AdminProgramView } from './AdminAthletes';

/**
 * /admin/atletas/ (T-AV27b): every Tribe Athletes program, its athletes,
 * levels and guests, for Tribe staff. Server component.
 *
 * WHO GETS HERE. middleware.ts answers a REAL 404 unless the athletes flag is
 * on and the caller is an app admin (isAdminAthletesPath). The check below is
 * the second layer.
 *
 * Each program's numbers come from av_athletes_partner_summary, read as an
 * admin (who gets the owner's full view), through the same toGymView
 * allowlist the gym dashboard uses. Nothing is counted here.
 */
export const metadata: Metadata = {
  title: 'Atletas Tribe | Admin | Tribe',
  robots: { index: false, follow: false },
};

export default async function AdminAthletesPage() {
  await requireAthleteValuePage('athletes');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth?returnTo=${encodeURIComponent('/admin/atletas/')}`);

  const admin = await fetchIsAppAdmin(supabase);
  if (!admin.success) throw new Error('admin check unavailable');
  if (admin.data !== true) notFound();

  const programs = await fetchAdminPrograms(supabase);
  if (!programs.success) throw new Error('programs unavailable');
  const list = programs.data ?? [];

  const [partners, summaries] = await Promise.all([
    fetchPartnersWithoutProgram(supabase, list),
    Promise.all(list.map((p) => fetchPartnerSummary(supabase, p.partnerId))),
  ]);
  if (!partners.success) throw new Error('partners unavailable');

  const views: AdminProgramView[] = list.map((p, i) => {
    const s = summaries[i];
    if (!s.success) throw new Error('program summary unavailable');
    const view: GymView | null = s.data ? toGymView(p.partnerId, s.data) : null;
    return { ...p, view };
  });

  return <AdminAthletes programs={views} partnersWithoutProgram={partners.data ?? []} />;
}
