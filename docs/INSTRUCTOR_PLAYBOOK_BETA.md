# Tribe.OS — Beta instructor playbook

A short read for the first instructors trying Tribe.OS. Five minutes.

**English first; Spanish below.** Either is fine — pick whichever
reads faster for you.

---

## What is Tribe.OS

Tribe.OS is the part of the Tribe app built for instructors who
charge money for their sessions. The free side of Tribe — finding
training partners, joining sessions, the community feed — works the
same as always. Tribe.OS is the layer on top that handles the
business side: who your clients are, who showed up, who paid, and
how much you made.

The free side will always be free. Tribe.OS premium is what funds
the platform so you don't pay a cut on every transaction.

## What you can do today

Three things, in this order:

### 1. Manage your client roster

Add the people you already train — the ones currently in your
WhatsApp, your spreadsheet, your notebook. For each person you can
record:

- Their name, email, phone (optional)
- Tags you choose ("vip", "lead", "yoga", whatever)
- Status: active, inactive, lead, or lapsed
- Private notes — anything you want to remember about them
- Health notes — injuries, conditions, restrictions, goals

Only you can see this. Other instructors using Tribe.OS can't see
your clients. Your clients (if they have a Tribe account) can't see
that you added them to your private list.

### 2. Take payments through Stripe

Create a session and mark it paid. Tribe.OS uses Stripe Connect to
route the money to your account. You get the platform fee waived as
long as your premium is active (that's the trade — thirty dollars a
month replaces the per-session cut).

The first time you take a payment, you'll go through a one-time
Stripe setup. After that it's just a checkbox on the session form.

### 3. See your revenue

`/os/revenue` shows the money side: gross, fees, refunds, and net,
broken down by week or month. Both USD and Colombian pesos if you're
taking both. There's a CSV export for tax season.

A widget on `/os/dashboard` surfaces clients who haven't shown up
lately — your "should I check in with them" list.

## What's coming, but not here yet

You'll see hints of these in the UI; ignore them for now.

- **Coach invites** — adding additional coaches to your gym. The
  page exists (`/os/coaches`) and shows you as owner; the invite
  flow is the next thing being built.
- **Member status automations** — programs, recurring sessions,
  attendance-based pricing rules. We want to see how you use the
  basics first before building automation.
- **AI features** — drafting messages, summarizing client histories,
  flagging engagement risks. Deferred until there are real users
  using the basics.

## What we're asking from you

The beta is 90 days of free Tribe.OS premium. In exchange:

1. **Use it weekly.** At least one real paid session through Tribe.OS
   per week. If you don't actually use it, we can't learn from your
   experience.

2. **Tell us fast when something breaks.** WhatsApp or email works.
   The faster we hear about a bug, the faster we fix it. Don't be
   polite — a bug list is the most valuable thing you can give us.

3. **Sit for a 30-minute call at the end of the month.** Tell us
   what worked, what didn't, what's missing. We'll record it (with
   your permission) and use it directly to plan the next month.

That's the whole ask. No long forms, no surveys.

## After the beta

After 90 days you choose:

- **Thirty dollars per month**, cancel anytime. No per-session cut.
- **Fifteen percent revenue share.** No monthly fee; we take a
  percentage of what flows through Stripe Connect.

Pick whichever fits your business. We'll check in two weeks before
that decision so it isn't a surprise.

## How to reach us

- **WhatsApp:** Alain at the number you already have
- **Email:** alainalisca@aplusfitnessllc.com
- **App store reviews:** please don't — talk to us first if something
  is wrong

---

## Tribe.OS — Manual del instructor beta (Español)

# ES PENDING VERONICA REVIEW

Una lectura corta para los primeros instructores que prueban
Tribe.OS. Cinco minutos.

## Qué es Tribe.OS

Tribe.OS es la parte de la app de Tribe construida para
instructores que cobran por sus sesiones. La parte gratuita de
Tribe — encontrar compañeros, unirte a sesiones, el feed de
comunidad — funciona como siempre. Tribe.OS es la capa encima que
maneja el lado del negocio: quiénes son tus clientes, quién asistió,
quién pagó, y cuánto ganaste.

La parte gratuita siempre será gratis. Tribe.OS premium es lo que
financia la plataforma para que no pagues una comisión en cada
transacción.

## Lo que puedes hacer hoy

Tres cosas, en este orden:

### 1. Gestiona tu lista de clientes

Agrega a las personas que ya entrenas — las que están en tu
WhatsApp, tu hoja de cálculo, tu libreta. Por cada persona puedes
registrar:

- Nombre, correo, teléfono (opcional)
- Etiquetas que tú elijas ("vip", "prospecto", "yoga", lo que sea)
- Estado: activo, inactivo, prospecto o suspendido
- Notas privadas — cualquier cosa que quieras recordar sobre ellos
- Notas de salud — lesiones, condiciones, restricciones, objetivos

Solo tú puedes ver esto. Otros instructores que usan Tribe.OS no
ven tus clientes. Tus clientes (si tienen cuenta de Tribe) no ven
que los agregaste a tu lista privada.

### 2. Recibe pagos a través de Stripe

Crea una sesión y márcala como pagada. Tribe.OS usa Stripe Connect
para enviar el dinero a tu cuenta. Mientras tu premium esté activo
no pagas la comisión por sesión (ese es el intercambio — treinta
dólares al mes reemplazan ese corte).

La primera vez que cobres pasarás una vez por la configuración de
Stripe. Después es solo una casilla en el formulario de la sesión.

### 3. Mira tus ingresos

`/os/revenue` muestra el lado del dinero: bruto, comisiones,
reembolsos y neto, desglosado por semana o mes. Tanto USD como
pesos colombianos si manejas ambos. Hay una exportación CSV para
la temporada de impuestos.

Un widget en `/os/dashboard` resalta clientes que no se han
aparecido últimamente — tu lista de "debería contactarlos".

## Lo que viene, pero aún no está aquí

Verás indicios de esto en la interfaz; ignóralos por ahora.

- **Invitaciones de entrenadores** — agregar entrenadores
  adicionales a tu gym. La página existe (`/os/coaches`) y te
  muestra como propietario; el flujo de invitación es lo siguiente
  que se está construyendo.
- **Automatizaciones de estado de miembros** — programas, sesiones
  recurrentes, reglas de precios basadas en asistencia. Queremos
  ver cómo usas lo básico antes de construir automatización.
- **Funciones con IA** — redactar mensajes, resumir historiales de
  clientes, señalar riesgos de compromiso. Diferido hasta que haya
  usuarios reales usando lo básico.

## Lo que te pedimos a cambio

La beta son 90 días de Tribe.OS premium gratis. A cambio:

1. **Úsalo semanalmente.** Al menos una sesión pagada real a
   través de Tribe.OS por semana. Si no lo usas, no podemos
   aprender de tu experiencia.

2. **Avísanos rápido cuando algo falle.** WhatsApp o correo
   funciona. Cuanto más rápido sepamos de un error, más rápido lo
   arreglamos. No seas amable — una lista de bugs es lo más valioso
   que nos puedes dar.

3. **Una llamada de 30 minutos al final del mes.** Cuéntanos qué
   funcionó, qué no, qué falta. La grabamos (con tu permiso) y la
   usamos directamente para planificar el mes siguiente.

Esa es toda la solicitud. Sin formularios largos, sin encuestas.

## Después de la beta

Después de 90 días eliges:

- **Treinta dólares al mes**, cancela cuando quieras. Sin
  comisión por sesión.
- **Quince por ciento de participación en ingresos.** Sin cuota
  mensual; tomamos un porcentaje de lo que pasa por Stripe Connect.

Elige lo que se ajuste a tu negocio. Te contactaremos dos semanas
antes de esa decisión para que no sea una sorpresa.

## Cómo contactarnos

- **WhatsApp:** Alain al número que ya tienes
- **Correo:** alainalisca@aplusfitnessllc.com
- **Reseñas en tiendas de apps:** por favor no — habla con nosotros
  primero si algo está mal
