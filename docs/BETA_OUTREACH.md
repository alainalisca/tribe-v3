# Beta outreach tracking

Used to pick high-signal beta candidates from the `tribe_os_waitlist`
table and track outreach + response. Refreshed each round.

## Candidate selection heuristic

From `tribe_os_waitlist`, prefer rows where:

- Real-looking name and email (not test entries, not catchphrases)
- `teaches` is specific (e.g. "barre + reformer pilates", not "fitness")
- `sessions_per_week >= 3`
- `comments` is non-empty and shows the candidate took the time to write
- `pricing_preference` mix: aim for at least one of each preference if
  both have signal, so the post-beta pricing conversation hears both
  sides

Run this query in the Supabase SQL Editor to surface candidates:

```sql
SELECT
  id, name, email, language, teaches, sessions_per_week,
  pricing_preference, comments, created_at
FROM public.tribe_os_waitlist
WHERE name IS NOT NULL
  AND teaches IS NOT NULL AND length(trim(teaches)) > 8
  AND sessions_per_week >= 3
  AND comments IS NOT NULL AND length(trim(comments)) > 20
ORDER BY created_at DESC
LIMIT 30;
```

Hand-pick the 5 with the strongest signal. Drop them into the tracking
table below.

## Outreach tracking

| #   | Name | Email | Locale | Pricing pref | Sent | Channel | Response | Status |
| --- | ---- | ----- | ------ | ------------ | ---- | ------- | -------- | ------ |
| 1   |      |       |        |              |      |         |          |        |
| 2   |      |       |        |              |      |         |          |        |
| 3   |      |       |        |              |      |         |          |        |
| 4   |      |       |        |              |      |         |          |        |
| 5   |      |       |        |              |      |         |          |        |

Statuses: `sent`, `acked`, `scheduled`, `onboarded`, `declined`,
`silent`. After 3 days of no response, mark `silent` and move on
(do not re-spam).

## Outreach message templates

### English

> Hi {name}, thanks for joining the Tribe.OS waitlist. We are starting
> a small beta this week with a few instructors who teach {teaches}.
> You would get full premium access free for 90 days — client
> management, attendance tracking, payment processing through Stripe,
> and a revenue dashboard. In exchange we ask for weekly usage, fast
> bug reports, and one 30-minute feedback call at the end of the month.
>
> Want to jump in? If yes, I can onboard you in about 20 minutes on a
> quick screen share.
>
> — Alain

### Español

> Hola {name}, gracias por unirte a la lista de espera de Tribe.OS.
> Estamos comenzando una beta pequeña esta semana con algunos
> instructores que enseñan {teaches}. Tendrías acceso completo premium
> gratis durante 90 días — gestión de clientes, registro de asistencia,
> procesamiento de pagos con Stripe, y un panel de ingresos. A cambio
> te pedimos uso semanal, reportes rápidos de errores, y una llamada de
> 30 minutos al final del mes para feedback.
>
> ¿Quieres entrar? Si sí, te puedo dar de alta en unos 20 minutos en
> una llamada rápida con pantalla compartida.
>
> — Alain

(ES strings are Al's own translation for personal outreach; Verónica's
review is for production-facing copy. Personal messages do not need to
wait on her return.)

## Onboarding checklist (per accepted candidate)

20-minute screen-share, in this order:

1. Confirm the candidate has a Tribe account. If not, walk them
   through signup at `/auth`.
2. From your terminal, run:
   ```
   node scripts/grant-tribe-os-premium.js --email=<their_email> --tier=solo --welcome --lang=<en|es>
   ```
   This grants premium AND sends the bilingual welcome email.
3. Walk them through Stripe Connect onboarding at the in-app
   "Payments" entry point. Watch them complete it on their end. Verify
   `charges_enabled = true` and `payouts_enabled = true` on their
   connected account (visible in Stripe Dashboard or via the
   `account.updated` webhook).
4. Walk through `/os/clients` and have them add their first real
   client — someone they already train. Real data only; no
   placeholders.
5. Walk through `/create` and create one paid session for their next
   real class. Real price they actually charge.
6. Show `/os/revenue` and explain what it will display after the first
   real payment lands.
7. Confirm WhatsApp (or email, if they prefer) for the daily check-in
   cadence. Get explicit consent for the daily check-ins for the first
   three days.
8. Hand off the beta-instructor expectations summary verbally, or send
   the welcome email as the written record.

After onboarding, log the session in `docs/BETA_LOG.md` with a
timestamp, what they did during the call, and any concerns they raised
on the spot.
