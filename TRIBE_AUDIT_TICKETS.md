# Tribe — Audit Tickets (2026-09-04)

Generated from a read-only audit of `tribe-v3` at `main` @ `613eddf` (migrations through 155) plus the live Supabase project `twyplulysepbeypqralz` (schema pulled 2026-09-04 via `supabase gen types --linked`, `supabase inspect db`, `supabase db lint --linked`). Companion files: `TRIBE_AUDIT_SUMMARY.md` (map, route table, top 10, themes) and `TRIBE_AUDIT_TICKETS.csv` (Notion import).

**95 tickets.** Grouped by Área, then Prioridad. Every ticket carries: Título, Área, Prioridad, Estado, Descripción (qué pasa, evidencia file:line, impacto, fix propuesto, criterios de aceptación), Esfuerzo, Deploy, Riesgo, Journey/lado, Ruta/Archivo. `Notion:` names the existing Build Backlog row this ticket updates (de-duplicated against the board on 2026-09-04; 46 tickets update existing rows, 50 Notion pages were created (49 new findings + PAY-01, which complements the existing DECISIÓN row)).

| Área             | Alta | Media | Baja | Total |
| ---------------- | ---- | ----- | ---- | ----- |
| Flujo/Navegación | 3    | 3     | 0    | 6     |
| Producto         | 10   | 15    | 4    | 29    |
| Seguridad        | 3    | 4     | 3    | 10    |
| Pagos            | 3    | 1     | 0    | 4     |
| Infra            | 6    | 11    | 4    | 21    |
| Fix rápido       | 3    | 7     | 9    | 19    |
| Negocio          | 1    | 5     | 0    | 6     |
| **Total**        | 29   | 46    | 20   | 95    |

---

## Área: Flujo/Navegación (6)

### [NAV-01] Unificar el botón de volver con goBack(fallback) en toda la app

- **Área:** Flujo/Navegación · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Todas las rutas / ambos lados
- **Ruta/Archivo:** `components/session/SessionHeader.tsx:29; lib/navigation.ts:10`

**Descripción**

QUÉ PASA: conviven tres comportamientos de "volver". (1) `goBack()` (con historial + fallback) se usa en UNA sola ruta: app/storefront/[id]/page.tsx:101,121,161. (2) `router.back()` crudo en ~20 sitios (app/profile/[userId]/ProfilePageClient.tsx:157,170,187; app/product/[id]/ProductDetailClient.tsx:138; app/session/[id]/edit/page.tsx:291; app/legal/\*), que en un deep link en frío no tiene historial y no hace nada (o cierra la PWA). (3) `Link href="/"` fijo en components/session/SessionHeader.tsx:29 (la flecha de /session/[id], la página con 35 enlaces entrantes), app/notifications/page.tsx:114, app/create/page.tsx:327,419, app/create-product/page.tsx:154, app/stories/page.tsx:48, app/my-coach/page.tsx:611,675.
IMPACTO: abrir una sesión desde un DM, /notifications o /sessions y tocar "volver" manda a Home. Esto reproduce literalmente la queja "las rutas no conectan".
FIX: un componente compartido <BackButton fallback> sobre lib/navigation.ts goBack(); reemplazar los 3 patrones; fallback /sessions para detalle de sesión, / para superficies raíz.
ACEPTACIÓN: desde /messages/[id] -> sesión -> volver regresa al hilo; deep link frío a /profile/[id] -> volver lleva a /; ningún `router.back()` ni `Link href="/"` como botón de volver en app/ o components/.

### [NAV-02] Suprimir AppStoreBanner en /s/_, /i/_ y /download (no solo /invite/)

- **Área:** Flujo/Navegación · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Funnel de Instagram/WhatsApp / invitado
- **Ruta/Archivo:** `components/IOSInstallPrompt.tsx:23`
- **Notion:** actualiza la fila existente «AppStoreBanner no está suprimido en /s/ ni /i/»

**Descripción**

QUÉ PASA: components/IOSInstallPrompt.tsx:23 solo suprime el modal en `/invite/`. Está montado global en app/layout.tsx:91. lib/share.ts:60,64 acuña `/s/[id]` y `/i/[id]` para cada share por WhatsApp/nativo, así que el visitante que llega de un link compartido recibe un Dialog de pantalla completa a los 3 segundos, antes de leer precio, hora y lugar.
EXTRA: :9 usa `apps.apple.com/us/` mientras public/download/index.html:132 usa `/co/`; :96 pinta `text-white` sobre `bg-tribe-green` (contraste ~1.9:1, falla AA).
FIX: `const onShareRoute = ['/invite/','/s/','/i/','/download'].some(p => pathname?.startsWith(p))`; unificar locale a /co/; texto oscuro sobre verde.
ACEPTACIÓN: abrir /s/<id> y /i/<id> en Safari iOS sin app no muestra el modal; /invite sigue igual; los tests de IOSInstallPrompt cubren las 4 rutas.

### [NAV-03] Dar a 'Mis Sesiones' (/sessions) una entrada en la navegación

- **Área:** Flujo/Navegación · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Atleta: mis sesiones
- **Ruta/Archivo:** `app/sessions/page.tsx:64; components/BottomNav.tsx:55-125; app/profile/page.tsx:230`
- **Notion:** actualiza la fila existente «"Mis Sesiones" no está en el nav; el corte upcoming/past usa today en vez de now»

**Descripción**

VERIFICADO: la página existe y se titula "Mis Sesiones" (app/sessions/page.tsx:64, app/sessions/translations.ts:4) pero su único enlace entrante está en /search, que a su vez es huérfana. Tres superficies de servidor SÍ empujan al usuario hacia /sessions: email de recap semanal (app/api/send-weekly-recap/route.ts:163), nudge de inactivo (app/api/send-inactive-nudge/route.ts:149) y push de engagement (app/api/cron/engagement/route.ts:158). Quien toca ese push aterriza en un lugar que no puede volver a encontrar.
La segunda mitad del ticket original (corte upcoming/past usa `today`) YA ESTÁ ARREGLADA: app/sessions/useSessionsData.ts:27-37 compara start_time+duration contra `new Date()` (ahora). Queda un bug menor: :139-144 hace slice(0,20) ANTES de filtrar pasadas (ver NAV-09).
FIX mínimo: tile "Mis Sesiones" en app/profile/page.tsx junto a /my-training (:230). Fix mejor: decidir el 5º slot del BottomNav (ver NAV-08).
ACEPTACIÓN: /sessions alcanzable en ≤2 toques desde el BottomNav; el push de engagement aterriza en una ruta con camino de regreso.

### [NAV-05] Configurar deep links (AASA + associated-domains + intent-filter) o dejar de publicar assetlinks.json

- **Área:** Flujo/Navegación · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Nativo (cap sync + reenvío) · **Riesgo:** Revisión de tienda; firma
- **Journey / lado:** Funnel compartido -> app instalada
- **Ruta/Archivo:** `android/app/src/main/AndroidManifest.xml:20-23; ios/App/App/App.entitlements; ios/App/App/Info.plist; public/.well-known/`

**Descripción**

VERIFICADO: no hay `apple-app-site-association` en public/; ios/App/App/App.entitlements solo tiene `aps-environment` (sin associated-domains); Info.plist no tiene CFBundleURLTypes; AndroidManifest.xml:20-23 solo tiene MAIN/LAUNCHER (sin VIEW/BROWSABLE). public/.well-known/assetlinks.json existe y se sirve (middleware.ts:165 lo deja pasar por la extensión .json) pero verifica un paquete que no declara intent filter.
IMPACTO: cada link /s/[id], /i/[id] o /invite/[token] abre el navegador aunque el usuario tenga la app instalada. El mecanismo de crecimiento nunca re-entra a la app.
NOTA middleware: una ruta sin extensión como /.well-known/apple-app-site-association NO pasa el short-circuit de middleware.ts:165 y caería en el auth gate; necesita entrada en publicPaths.
FIX: intent-filter para el host; AASA servido como application/json + entitlement; CFBundleURLTypes opcional; entrada `/.well-known` en publicPaths.
ACEPTACIÓN: abrir un link /s/<id> desde WhatsApp en un teléfono con la app instalada abre la app en esa sesión (iOS y Android).

### [NAV-06] Decidir dónde vive Comunidades: 1 de 5 slots del BottomNav y cero presencia en Home

- **Área:** Flujo/Navegación · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Descubrimiento / comunidad
- **Ruta/Archivo:** `components/BottomNav.tsx:93; app/page.tsx:264-270,315-358`
- **Notion:** actualiza la fila existente «Reestructurar nav: Communities al top de Home, Sessions al bottom nav»

**Descripción**

VERIFICADO: `grep -n communit app/page.tsx` devuelve cero. El rail de descubrimiento de Home (app/page.tsx:264-270 y slots :315-358) tiene Instructores, Partner, TrainingPartners, Eventos, Stories, Venues, Rutas, pero no Comunidades. Comunidades ocupa el slot 4 del BottomNav (components/BottomNav.tsx:93) y es la inversa exacta de todas las demás superficies de descubrimiento (que están en Home y no en el nav). El BottomNav no tiene rol: los 5 ítems son idénticos para atleta, instructor y gym.
FIX (aprobado en el board): rail de Comunidades en Home; liberar el slot del nav para Sesiones (ver NAV-03).
ACEPTACIÓN: Home muestra un rail de Comunidades (self-hiding si no hay datos); BottomNav tiene Sesiones; ningún ítem del nav se queda sin camino de regreso.

### [NAV-10] Resolver las 14 rutas huérfanas (sin ningún enlace entrante en la app)

- **Área:** Flujo/Navegación · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Todas
- **Notion:** actualiza la fila existente «Audit athlete-side discovery: what already exists and is dark»
- **Ruta/Archivo:** `docs/ROUTE_INVENTORY_2026-08-16.md; app/connections; app/requests; app/search; app/feed/v2; app/stories; app/training-now; app/settings/notifications; app/settings/training-preferences; app/tribe-plus; app/subscriptions; app/legal/delete-account; app/os/messages; app/os/programs; app/matches`

**Descripción**

RE-VERIFICADO en main@613eddf: el inventario de rutas (95 páginas, 109 API) no cambió desde 2026-08-25 y las 14 huérfanas siguen huérfanas: /connections (inbox del funnel de co-asistencia, 439 líneas, terminada), /requests (inbox de solicitudes del host, 307 líneas, terminada), /search (búsqueda global 4 tabs, 498 líneas, ÚNICO enlace a /challenges y /sessions), /feed/v2 (duplicado más limpio de /feed), /stories, /training-now, /settings/notifications (preferencias finas de notificación), /settings/training-preferences (ÚNICO escritor de users.seeking*trainer*_, el inventario de /dashboard/instructor/discover), /tribe-plus (admin-only a propósito), /subscriptions, /legal/delete-account (compliance, por diseño), /os/messages y /os/programs (ComingSoon por diseño), /matches (su único enlace es SmartMatchBanner, que nadie monta).
FIX: decidir ruta por ruta: enlazar (search, connections, requests, settings/_), fusionar (feed/v2->feed) o borrar (stories, training-now, matches).
ACEPTACIÓN: cada page.tsx tiene ≥1 enlace entrante o un comentario `// intentionally unlinked: <razón>`.

---

## Área: Producto (29)

### [ATL-01] Mover cancelSession a una ruta de servidor: hoy no notifica a NADIE y marca refund_failed

- **Área:** Producto · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Destructivo (cancelación); toca fondos (reembolsos); auth (nueva ruta privilegiada)
- **Journey / lado:** Atleta e instructor: cancelación de sesión
- **Ruta/Archivo:** `lib/dal/sessions.ts:436-552; hooks/useSessionActions.ts:246-254; app/api/notifications/send/route.ts:57`
- **Notion:** actualiza la fila existente «cancelSession no notifica a participantes pendientes»

**Descripción**

PEOR DE LO REPORTADO. cancelSession (lib/dal/sessions.ts:436-552) se llama SOLO desde el navegador (hooks/useSessionActions.ts:254). Tres fallas encadenadas: (1) :462-466 lee session*participants con status='confirmed' desde el cliente; la RLS de 129 (sp_select_own) devuelve solo filas del propio usuario, y el host no es participante, así que la lista de destinatarios está VACÍA (y aun si no lo estuviera, excluye pendientes y waitlist, que :456 sí cancela). (2) :534 manda `Authorization: Bearer ${process.env.CRON_SECRET}` desde código de navegador; una env sin NEXT_PUBLIC* es undefined en el bundle -> 401 en app/api/notifications/send/route.ts:57, tragado por el catch de :545. (3) :483-486 importa @/lib/payments/stripe en el navegador, donde STRIPE_SECRET_KEY no existe (lib/payments/stripe.ts:21-23 lanza) -> cada pago queda `refund_failed`. No se escribe ninguna campana (createNotification). El diálogo promete "All athletes will be notified" (useSessionActions.ts:246). El test lib/dal/sessions.cancel.test.ts:116 fija NEXT_PUBLIC_SITE_URL en Node y enmascara el bug.
IMPACTO: atletas llegan a sesiones canceladas; pagos nunca reembolsados.
FIX: `POST /api/sessions/[id]/cancel` con service-role: autoriza creador, cancela, fan-out de campana+push a confirmed+pending+waitlisted, email a guests con guest_email, reembolsos en servidor.
ACEPTACIÓN: test de integración: cancelar una sesión con 1 confirmado, 1 pendiente, 1 guest genera 3 notificaciones; ninguna referencia a CRON_SECRET en código 'use client'.

### [ATL-02] Arrancar la cadena de ofertas del waitlist cuando se libera un cupo (hoy nunca se crea la primera oferta)

- **Área:** Producto · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Migración si se hace por trigger
- **Journey / lado:** Atleta: lista de espera
- **Ruta/Archivo:** `lib/dal/waitlist.ts:177; app/api/cron/waitlist-expiry/route.ts:62; components/session/WaitlistPanel.tsx:129`

**Descripción**

QUÉ PASA: `offerSpotToNextInLine` (lib/dal/waitlist.ts:177) tiene un solo llamador: el cron waitlist-expiry (:62), que corre cuando una oferta EXISTENTE expira. Nada crea la PRIMERA oferta: ni leave (hooks/sessionActionHelpers.ts:170), ni kick, ni decline (PendingRequestsPanel), ni trigger en session_participants (033_waitlist.sql:69 solo mantiene el contador).
IMPACTO: el atleta se une al waitlist, lee "We'll notify you if a spot opens up" (WaitlistPanel.tsx:129) y jamás es contactado aunque alguien se salga. La función completa está inerte.
FIX: llamar offerSpotToNextInLine + notificar desde los caminos leave/kick/decline, o un trigger AFTER DELETE/UPDATE en session_participants cuando confirmed < max_participants.
ACEPTACIÓN: test: sesión llena + 1 en waitlist; un confirmado se sale -> el de waitlist recibe oferta y notificación en <1 min.

### [ATL-06] Modelo de asistencia real: estado (unmarked/attended/no_show) y clave que admita guests

- **Área:** Producto · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Migración
- **Journey / lado:** Atleta/instructor: asistencia post-sesión
- **Ruta/Archivo:** `lib/database.types.ts:857-887; components/AttendanceTracker.tsx:64,124; supabase/migrations/153_host_door_checkin.sql:28`
- **Notion:** actualiza la fila existente «Estado de asistencia — no existe attended/no_show/checked_in»

**Descripción**

VERIFICADO EN VIVO (gen types 2026-09-04): session_participants NO tiene attended/checked_in/attendance_status; la asistencia vive en la tabla session_attendance (attended boolean + marked_by/marked_at), keyed por user_id, que NO tiene migración en supabase/migrations (existe solo en types + verifier). "Sin marcar" y "no vino" son indistinguibles; los guests (incluido cada check-in de puerta, 153:28) nunca pueden tener asistencia. Streaks y badges (StreakBanner.tsx:39, AchievementBadges.tsx:110) subcuentan en silencio. El índice session_attendance_pkey tiene 0 scans en vivo.
FIX: migración que captura la tabla viva, agrega `state text CHECK (state IN ('unmarked','attended','no_show'))` y `participant_id` nullable para guests; backfill desde attended.
ACEPTACIÓN: el host puede marcar no_show; un guest de puerta aparece marcable; streak cuenta guests convertidos.

### [ATL-13] Mensajes directos: el push NUNCA llega (el webhook resuelve destinatarios por session_id, que es NULL en DMs)

- **Área:** Producto · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Mensajería / ambos lados
- **Ruta/Archivo:** `lib/dal/conversations.ts:232-240; app/api/webhook/chat-message/route.ts:115-137; lib/dal/notificationPreferences.ts:90; app/notifications/page.tsx:33,66`

**Descripción**

QUÉ PASA: los DMs se insertan en chat_messages con session_id NULL a propósito (lib/dal/conversations.ts:232-240). El trigger chat_message_webhook dispara, pero app/api/webhook/chat-message/route.ts:115-121 resuelve la sesión por session_id y los destinatarios con `.eq('session_id', session_id)`; con NULL ambos devuelven vacío, userIds.length === 0 y la ruta responde `notified: 0` (:137). Cada DM queda sin notificar. Corrobora: el tipo `dm` tiene TYPE_META (notificationPreferences.ts:90), ícono (page.tsx:33) y deep link (page.tsx:66) pero NINGÚN código lo escribe.
IMPACTO: el canal de conversación 1:1 (el que usan atleta->instructor) es silencioso; los testers reportan "chat no funciona".
FIX: en el webhook, branch por conversation_id: buscar los otros participantes vía conversations/conversation_participants, gatear con filterPushRecipients(...,'dm') y escribir campana tipo dm.
ACEPTACIÓN: enviar un DM genera push + campana al receptor; test de integración del webhook con session_id NULL.

### [BIZ-06] Marcar sesiones dirigidas por instructor en las tarjetas (la vista sessions_public y el embed del DAL no proyectan is_instructor)

- **Área:** Producto · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Migración (ampliar la vista anon con dos flags ya públicos en otros lados)
- **Journey / lado:** Atleta: feed / descubrimiento
- **Ruta/Archivo:** `components/SessionCard.tsx:85-88,249-278; app/sessions/SessionCard.tsx:14-31,64-68; components/SessionCardHero.tsx:65-72; lib/dal/sessions.ts:193,268,395; supabase/migrations/138_rls_h4_gate1_sessions_public_view.sql:59-62; components/FeaturedInstructors.tsx:94`
- **Notion:** actualiza la fila existente «Distinción visual entre sesiones de atletas y de instructores»

**Descripción**

VERIFICADO Missing: SessionCard.tsx:249-278 muestra avatar+nombre+rating; is_instructor no aparece en el archivo; app/sessions/SessionCard.tsx:14-31 ni siquiera tiene creator en sus props (:64-68 es un badge "isHost" = tú eres el host, no instructor); SessionCardHero badges = sport + urgencia. El DAL no lo trae (:268 vista anon; :395 embed creator con id,name,avatar_url,average_rating,total_reviews); sessions_public proyecta solo creator_name/avatar/rating (138:59-62). El único diferenciador hoy es el borde verde de featured partners (:85-88). El badge BadgeCheck ya existe en FeaturedInstructors.tsx:94, InstructorPostCard:173, feed:512, ProfilePageClient:375.
FIX: agregar u.is_instructor/u.is_verified_instructor a sessions_public y al embed :395; badge junto al nombre en las 3 tarjetas.
ACEPTACIÓN: en el feed, una sesión de instructor y una de par se distinguen sin abrirlas; snapshot test.

### [BIZ-09] Sesiones creadas por atletas: verificado, YA funciona (cualquier autenticado crea; la restricción es de política, no de código)

- **Área:** Producto · **Prioridad:** Alta · **Estado:** Por verificar
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Atleta crea sesión
- **Ruta/Archivo:** `app/create/page.tsx:102-112,624; middleware.ts (auth only); supabase/schema.sql:85; components/BottomNav.tsx:86`
- **Notion:** actualiza la fila existente «Sesiones creadas por atletas — verificar qué ya funciona hoy»

**Descripción**

VERIFICADO: /create está gateado solo por cookie (middleware) y es el botón central del BottomNav (:86) para TODOS los roles; app/create/page.tsx:102-112 consulta is_instructor solo para mostrar un bloque extra en :624 (opciones de instructor). La RLS de sessions ("Users can update own sessions", schema.sql:85) es por creator_id, sin distinción de rol. Es decir, hoy un atleta ya crea, edita y cancela sesiones exactamente igual que un instructor; lo que falta es (a) la distinción visual (BIZ-06) y (b) las restricciones de seguridad aprobadas en el board ("solo lugares públicos + participación previa"), que hoy NO existen en código (grep de public_place|prior_participation = 0).
ACEPTACIÓN: cerrar este ticket como verificado y dejar vivos BIZ-06 y el ticket de restricciones.

### [INS-01] Pedir `location` en el wizard de onboarding de instructor (o quitarlo del gate de completitud)

- **Área:** Producto · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Instructor: onboarding self-serve
- **Notion:** actualiza la fila existente «Descripciones / perfiles de instructores»
- **Ruta/Archivo:** `lib/instructorProfile.ts:52-54,66; app/onboarding/instructor/page.tsx:345-405; lib/dal/instructors.ts:94`

**Descripción**

QUÉ PASA: lib/instructorProfile.ts:52-54,66 exige `location` no vacío para considerar el perfil completo. app/onboarding/instructor/page.tsx nunca renderiza ni escribe un campo de ubicación. Resultado: un instructor que termina TODO el wizard sigue "incompleto", es filtrado de Browse Instructors (lib/dal/instructors.ts:94) y aterriza en un banner (InstructorProfileIncompleteBanner) que le pide arreglar un campo que el wizard nunca pidió. Es el mayor callejón sin salida del instructor nuevo (coincide con T-AUD5 "Location not specified" del board). Además el gate NO se aplica a fetchFeaturedInstructors (:145-165) ni a FeaturedInstructorCarousel.tsx:46, así que perfiles incompletos sí aparecen en el carrusel de Home.
FIX: input de ubicación en el paso 1 del wizard y en el payload de handleFinish; aplicar el mismo gate al carrusel.
ACEPTACIÓN: completar el wizard deja isComplete=true; el instructor aparece en /instructors sin pasos extra.

### [INS-03] Nada puede crear un gym sin Stripe: el journey multi-coach es inalcanzable para todos los instructores

- **Área:** Producto · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Auth
- **Journey / lado:** Instructor / gym-tenant / Tribe.OS
- **Notion:** actualiza la fila existente «Tribe.OS (plataforma de instructores: CRM + herramientas, IA, gym-tenant)»
- **Ruta/Archivo:** `app/api/tribe-os/subscription/checkout/route.ts:56-69,160; lib/dal/tribeOSSubscription.ts:278; lib/dal/tribeOSPremium.ts:85-95; app/os/dashboard/page.tsx:304-309; app/os/gym/page.tsx:198-202`

**Descripción**

QUÉ PASA: createGym tiene exactamente dos llamadores: el checkout de suscripción (503 por TRIBE*OS_BILLING_ENABLED, :56-69) y el webhook de Stripe. El grant admin (grant-premium -> grantTribeOSPremium, lib/dal/tribeOSPremium.ts:85-95) escribe solo users.tribe_os*\* sin gym. Así, cada instructor design-partner resuelve premium con gymId=null -> /os/dashboard renderiza premium_no_gym con CTA "Set up your gym" a /os/gym (:304-309) -> /os/gym renderiza `no_gym` SIN formulario de creación (:198-202). Loop muerto. /api/tribe-os/coaches/invite devuelve no_gym 404 (:76-78) y /os/coaches no está en el nav (OSShell.tsx:107-122).
IMPACTO: la historia gym-tenant / segundo coach está cerrada para el 100% de los instructores mientras la facturación esté apagada. Conflicto directo con la regla self-serve.
FIX: `POST /api/tribe-os/gym` (owner = caller, tier desde el premium resuelto) + formulario en el branch no_gym; llamarlo también desde grantTribeOSPremium.
ACEPTACIÓN: un instructor con premium otorgado por admin crea su gym desde /os/gym y puede invitar un coach.

### [INS-10] Aceptar .mov/QuickTime en el video de presentación o explicar el formato (bloquea a iPhone)

- **Área:** Producto · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Migración (allowlist del bucket); compatibilidad de reproducción
- **Journey / lado:** Instructor: storefront
- **Ruta/Archivo:** `lib/videoValidation.ts:12,22; components/dashboard/VideoUploadSection.tsx:140,175,67; supabase/migrations/145_sec4_media_bucket_lockdown.sql:39; components/StoryUpload.tsx:260`
- **Notion:** actualiza la fila existente «Video de presentación — solo acepta MP4, bloquea a todos los usuarios de iPhone»

**Descripción**

CONFIRMADO en 3 capas: lib/videoValidation.ts:12 ACCEPTED_VIDEO_TYPE='video/mp4' y :22 rechaza otro MIME; inputs accept="video/mp4" (VideoUploadSection.tsx:140,175); allowlist del bucket media = jpeg/png/webp/mp4 (145:39). La cámara del iPhone graba HEVC en .mov (video/quicktime) -> rechazado cliente y servidor con "wrong type" sin guía. Contraste: StoryUpload.tsx:260 sí acepta quicktime/webm. La ruta está fija como intro.mp4 (:67). Cuidado: aceptar quicktime sin transcodificar cambia "rechazo" por "player negro en Android Chrome" (HEVC).
FIX escalonado: (a) copy bilingüe "graba en Más compatible / exporta MP4" en el hint; (b) wiring de Cloudflare Stream (aprobado, ver INS-11) con direct creator upload -> HLS.
ACEPTACIÓN: un .mov de iPhone se sube y reproduce en iOS + Android, o el usuario recibe instrucciones claras.

### [INS-11] Cloudflare Stream: aprobado, nunca cableado (cero referencias en el código)

- **Área:** Producto · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** L · **Deploy:** Web (Vercel) · **Riesgo:** Costo (sin preload/autoplay)
- **Journey / lado:** Instructor: storefront / video
- **Ruta/Archivo:** `components/instructor/VideoIntro.tsx:74; components/dashboard/VideoUploadSection.tsx`
- **Notion:** actualiza la fila existente «Cloudflare Stream para videos de instructores — aprobado»

**Descripción**

VERIFICADO: grep de cloudflare|videodelivery|cloudflarestream|mux en app/, components/, lib/, scripts/, .env.local.example devuelve cero (el único hit es el CDN del QR en public/download/index.html:127). Sin pipeline de transcodificación: raw -> Supabase Storage (bucket público media) -> <video src>. Los topes 50MB/60s (lib/videoValidation.ts:10-11) son el sustituto.
FIX: direct creator upload a Stream, guardar el uid en storefront_video_url, player HLS sin preload ni autoplay (regla de costo del board), migrar los videos existentes.
ACEPTACIÓN: subir .mov desde iPhone reproduce en todos los dispositivos; el 50MB deja de ser tope.

### [ATL-03] Mostrar al atleta su propia solicitud pendiente en la página de sesión (hoy vuelve a ver 'Solicitar')

- **Área:** Producto · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Atleta: solicitar cupo (curada/paga)
- **Ruta/Archivo:** `app/session/[id]/useSessionDetail.ts:186-206; app/session/[id]/ActionButtons.tsx:154-171; lib/dal/participants.ts:270`

**Descripción**

QUÉ PASA: useSessionDetail.ts:205-206 filtra el roster a status='confirmed', así que `isPending` nunca es true. Tras solicitar cupo en una sesión curada o paga y recargar, el atleta ve de nuevo el botón "Solicitar" (ActionButtons.tsx:154-171 no renderiza), lo toca y recibe `already_joined` (lib/sessions.ts:62-65). No hay estado pendiente visible ni forma de retirar la solicitud. En pagas es justo el momento en que decide si pagar.
FIX: en loadSession usar checkExistingParticipation (lib/dal/participants.ts:270, RLS-safe) para derivar hasJoined/isPending.
ACEPTACIÓN: tras solicitar y recargar se ve "Solicitud pendiente" + botón "Cancelar solicitud".

### [ATL-04] Notificar al host y confirmar al invitado cuando acepta por link /invite como guest (Gate 3)

- **Área:** Producto · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Invitado: aceptar invitación
- **Ruta/Archivo:** `app/invite/[token]/InviteClient.tsx:173-225; hooks/sessionActionHelpers.ts:47-104`
- **Notion:** actualiza la fila existente «Gate 3 — la aceptación de invitado no notifica a nadie»

**Descripción**

VERIFICADO: el modal de guest DENTRO de la app sí notifica (hooks/sessionActionHelpers.ts:47-60 + :79-104). El camino /invite/[token] (InviteClient.tsx:173-225) llama join_session_as_guest y luego NADA: sin notifyHostOfGuestJoin, sin sendGuestConfirmationEmail. Además :216-218 manda al guest a `/` (landing de marketing para un logueado-out) y pierde la sesión que acaba de aceptar. Nota: los helpers ya existen y están exportados; el branch del servidor existe; ningún cliente lo llama (coincide con la nota del board).
FIX: tras RPC exitoso llamar ambos helpers y redirigir a `/s/${session.id}`.
ACEPTACIÓN: aceptar como guest desde /invite genera campana al host y email al guest; el guest termina en la tarjeta pública de la sesión.

### [ATL-07] Mostrar 'quién va' (nombres + avatares, sin ids) a usuarios logueados que aún no se unieron

- **Área:** Producto · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Migración (vista); auth (ampliar lectura)
- **Journey / lado:** Atleta: decidir unirse
- **Notion:** actualiza la fila existente «Roster de asistentes expone nombre completo a cualquier usuario autenticado»
- **Ruta/Archivo:** `supabase/migrations/152_scope_participant_roster.sql:70-85; lib/dal/sessions.ts:202-206; components/session/ParticipantList.tsx:79`

**Descripción**

VERIFICADO: la migración 152 cerró correctamente la enumeración del roster (T-H "roster expone nombre completo" está RESUELTO). Pero la regla de reemplazo (creator / confirmado / admin) también esconde el roster al que está decidiendo: la página que uno lee antes de comprometerse muestra la lista de participantes vacía (ParticipantList.tsx:79 y SessionCard AvatarStack :285-295 renderizan nada). "Never train alone" no se puede verificar hasta después de unirse.
FIX: proyección estrecha (first name + avatar de confirmados, con tope, sin user_id) legible por authenticated para sesiones no invite_only; renderizar como AvatarStack. Mantener el roster completo como está.
ACEPTACIÓN: un usuario logueado no participante ve hasta 5 avatares + "y 3 más"; no puede resolver user_id desde esa vista.

### [ATL-11] Decidir y aplicar la asimetría de mensajes (atleta->instructor sí; instructor->atleta no) en el RPC de DM

- **Área:** Producto · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Auth; migración (RPC)
- **Journey / lado:** Mensajería / ambos lados
- **Ruta/Archivo:** `supabase/migrations/124_get_or_create_direct_conversation_rpc.sql:14; components/profile/InstructorProfileActions.tsx:93; components/storefront/StorefrontProfileColumn.tsx:82; app/messages/useMessages.ts:97`
- **Notion:** actualiza la fila existente «Product principle: asymmetric messaging (athletes initiate, instructors cannot)»

**Descripción**

VERIFICADO: el principio NO está implementado en ninguna capa. 124:14 dice textualmente "NO connection gate (product decision): any authenticated user may start a DM". Cualquier usuario autenticado abre un hilo con cualquier id visitando /messages?user=<uuid>. ConnectionButton.tsx:304 gatea su propio botón por sesión compartida, pero InstructorProfileActions.tsx:93 y StorefrontProfileColumn.tsx:82 enlazan directo. Un instructor que obtenga el id de un atleta (roster, seguidor, share) puede escribirle sin solicitud, justo lo que lead discovery fue diseñado para NO permitir.
FIX: predicado en get_or_create_direct_conversation: permitir si el destino es instructor, o si comparten sesión/conexión/follow, o si existe una solicitud aceptada; en otro caso raise. Mantener lectura/respuesta de hilos existentes.
ACEPTACIÓN: instructor -> atleta sin relación devuelve error; atleta -> instructor funciona; tests del RPC.

### [ATL-12] Abrir una superficie pública de navegación para visitantes sin cuenta (hoy solo /s, /i, /session son públicas)

- **Área:** Producto · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Auth (ampliar superficie anon; validar contra revokes 137/140)
- **Journey / lado:** Guest / funnel / SEO
- **Ruta/Archivo:** `middleware.ts:50-64; supabase/migrations/138_rls_h4_gate1_sessions_public_view.sql:40`
- **Notion:** actualiza la fila existente «T-GUEST1: Auditar qué ve realmente un usuario sin cuenta (web vs app nativa)»

**Descripción**

VERIFICADO (T-GUEST1, web): un visitante sin cuenta en `/` ve LandingPage (app/page.tsx:85), solo marketing. /instructors, /communities, /training-partners, /search y /feed NO están en publicPaths (middleware.ts:50-64): todo el catálogo está detrás del login. Solo puede ver UNA sesión compartida (/session/[id] o /s/[id]) o un instructor (/i/[id]) y nada más. Además sessions_public EXCLUYE invite_only (138:78), así que un link /s/ de una sesión invite-only muestra "Session not found" al anónimo sin explicación (esto explica el ticket "/s/ vs /invite/").
FIX: exponer /instructors y una lista de sesiones por ciudad en modo lectura a anon, respaldadas por sessions_public y users_discoverable (ya redondean coordenadas y excluyen invite_only). Ver también SEO.
ACEPTACIÓN: sin cookie, GET /instructors renderiza la lista; ninguna columna sensible (email, coords precisas) en la respuesta anon.

### [BRAND-01] Cinco verdes en producción (#A8DA36 token, #C0E863, #84cc16, #A3E635 en las OG cards, #9EE551 en emails, hsl(84 68% 65%) en focus rings): decidir el canónico y unificar

- **Área:** Producto · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** L · **Deploy:** Web (Vercel) · **Riesgo:** Regresión visual
- **Journey / lado:** Marca / todas
- **Ruta/Archivo:** `tailwind.config.ts:17-21,32,34,36; app/api/og/route.tsx:7; lib/email/*.ts; app/globals.css:50,61,85,96; components/feed/InstructorPostCard.tsx:170`
- **Notion:** actualiza la fila existente «Discrepancia de marca: tres verdes y dos sistemas tipográficos»

**Descripción**

VERIFICADO (son 5 verdes y 4 sistemas tipográficos, no 3 y 2): el token tribe-green que usan cientos de call sites es #A8DA36 (tailwind.config.ts:32) y el comentario :17-21 afirma que ES el canónico "del PDF de Design Guidelines" y que #84cc16 fue retirado a propósito; esto CONTRADICE la premisa de que la marca es #C0E863, que aparece en solo 10 archivos (demotado a tribe-green-100/-light :34,36; manifest theme_color; download; offline; Android notification color; confetti; toast). #84cc16 (lime-500): 40 usos (InstructorPostCard 5, SpotlightBanner 4, WaitlistPanel 3, RebookingStep 3, tribe-plus 3, VideoIntro:28). #A3E635 (lime-400): 34 usos incl. app/api/og/route.tsx:7 `GREEN = '#A3E635'`: el PRIMER verde que ve cualquiera en WhatsApp/Instagram. #9EE551 en los 7 templates de email. hsl(84 68% 65%) ≈ #B3E369 en --primary/--ring de shadcn (globals.css:50,61,85,96): cada focus ring. Más 302 utilidades Tailwind de la familia green/lime/emerald.
FIX: PRIMERO resolver #A8DA36 vs #C0E863 con el PDF de guidelines (decisión de Al); luego codemod hex -> token, --primary/--ring desde el token, parametrizar OG y emails.
ACEPTACIÓN: un solo hex en tailwind.config, OG, emails y globals; lint que prohíba hex verdes crudos.

### [INS-04] Invitación de coach: pedir consentimiento y notificar (hoy agrega en silencio y otorga premium + PII de miembros)

- **Área:** Producto · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Auth; migración
- **Journey / lado:** Gym owner / coach
- **Ruta/Archivo:** `app/api/tribe-os/coaches/invite/route.ts:132-134; lib/dal/tribeOSPremium.ts:246-258; app/api/tribe-os/clients/[id]/purge/route.ts:49`

**Descripción**

QUÉ PASA: el invite hace upsert en gym_coaches y retorna (:132-134); sin notificación, email ni paso de aceptación. La membresía otorga premium heredado (lib/dal/tribeOSPremium.ts:246-258) y lectura de la lista completa de miembros, revenue y audit log (todas las rutas /api/tribe-os/\* gatean solo por requireTribeOSPremium + gymId; solo purge re-chequea ownership :49). Un owner puede adjuntar a cualquier usuario de Tribe por email; ni el agregado ni el removido se enteran.
FIX: fila gym_coaches en estado pending + campana que el invitado debe aceptar antes de activarse; notificar al remover.
ACEPTACIÓN: invitar crea pending; el invitado ve y acepta; hasta entonces requireTribeOSPremium no lo considera miembro.

### [INS-05] Retirar o terminar Lead Discovery: 'Reach Out' falla siempre (nadie setea is_verified_instructor) y no hace nada

- **Área:** Producto · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Instructor: descubrir atletas
- **Ruta/Archivo:** `lib/dal/leadDiscovery.ts:116-124; app/dashboard/instructor/discover/page.tsx:62-68; app/dashboard/instructor/page.tsx:309; app/settings/training-preferences (huérfana)`

**Descripción**

QUÉ PASA: reachOutToAthlete rechaza salvo is*verified_instructor (lib/dal/leadDiscovery.ts:116-118); NADA en el repo setea ese flag (app/admin/useAdminActions.ts solo ban/unban y verificación de foto; no existe el trigger protect_verified_instructor que se creía). Aun pasando, solo inserta en lead_reaches (:122-124): sin mensaje ni notificación al atleta. La página gatea solo por is_instructor (:62-68) y lista nombres, presupuesto y horario de atletas reales. Y el inventario de atletas depende de users.seeking_trainer*\*, cuyo ÚNICO escritor es /settings/training-preferences, ruta huérfana: ningún atleta puede optar por entrar.
IMPACTO: un tile enlazado del dashboard (:309) lleva a una superficie que muestra datos de atletas y no puede hacer nada.
FIX: esconder la ruta hasta tener verificación + outreach con consentimiento, o reemplazar "Reach Out" por una solicitud de conexión que el atleta acepte (respeta la regla de no cold-message). Enlazar /settings/training-preferences desde /settings si se mantiene.
ACEPTACIÓN: ningún CTA visible que falle el 100% de las veces.

### [INS-06] Guests de puerta rompen AttendanceTracker (fila sin nombre, key null, markAttendance(null))

- **Área:** Producto · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Host: asistencia post-sesión
- **Ruta/Archivo:** `components/AttendanceTracker.tsx:77-115,184,190,207; lib/dal/participants.ts:113; supabase/migrations/153_host_door_checkin.sql`
- **Notion:** actualiza la fila existente «La seccion de asistencia de Tribe.OS no ve a los invitados, muestra filas sin nombre»

**Descripción**

QUÉ PASA: DoorCheckInCard crea filas con user_id NULL (153). Tras terminar la sesión, AttendanceTracker.loadParticipants (:77-115) mapea a {user_id, user} y nunca cae a guest_name aunque fetchConfirmedParticipantsWithUsers lo selecciona (participants.ts:113). Cada walk-in renderiza como fila sin nombre (:184) con key={null} (warning de duplicate key con 2+) y ambos botones llaman markAttendance(null, …) (:190,207) que upserta user_id null.
FIX: `participant.user?.name ?? participant.guest_name`, key por participant.id, ocultar botones para guests (su `confirmed` ya es la señal de asistencia según la nota de 153).
ACEPTACIÓN: sesión con 2 guests de puerta muestra 2 filas con nombre y sin warnings.

### [INS-08] Notificar a los confirmados cuando el host cambia fecha, hora o lugar de la sesión

- **Área:** Producto · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Host edita sesión / atleta confirmado
- **Ruta/Archivo:** `app/session/[id]/edit/useEditSession.ts; components/session/PendingRequestsPanel.tsx:106-128`

**Descripción**

QUÉ PASA: useEditSession.ts no contiene ninguna llamada a createNotification ni push (grep 'notif' solo encuentra el cancelLabel del diálogo de precio en :262). Un host mueve el sábado 7am a 8am en otro parque y los confirmados se enteran solo si reabren la página.
FIX: al cambiar date/start_time/location, notificar confirmados por el mismo camino campana+push de PendingRequestsPanel.tsx:106-128 (con type='session_update' para respetar preferencias).
ACEPTACIÓN: editar la hora genera campana + push a cada confirmado.

### [INS-12] Reseñas: limpiar UI duplicada, borrar PostSessionPrompt, unificar el promedio, permitir reseñar el mismo día

- **Área:** Producto · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Atleta reseña / instructor reputación
- **Ruta/Archivo:** `components/PostSessionFlow.tsx:136-146; components/session/ReviewSection.tsx:42-68; components/PostSessionPrompt.tsx; supabase/migrations/add_reviews.sql:38,75-101; lib/dal/reviews.ts:126; lib/dal/instructors.ts:218; lib/dal/instructorDashboard.ts:149`
- **Notion:** actualiza la fila existente «Calificaciones y reseñas de instructores en la app»

**Descripción**

VERIFICADO: tabla+RLS+trigger+display existen. Gaps reales: (1) PostSessionFlow (:136) inserta crudo saltando insertReview y se apila como modal sobre el banner de ReviewSection en la misma página (app/session/[id]/page.tsx:411,520); (2) PostSessionPrompt.tsx es código muerto; (3) el promedio se calcula en 3 lugares (trigger 2dp vs medias app-side 1dp) y pueden diferir (StorefrontTrustBar.tsx:34 vs ReviewsList header); (4) la RLS exige s.date < CURRENT_DATE (add_reviews.sql:38): una sesión que terminó esta mañana no se puede reseñar hasta mañana; (5) no hay moderación/report/reply de reseñas; (6) el tab de reseñas del storefront se esconde con total_reviews desnormalizado en 0 (app/storefront/[id]/page.tsx:56); (7) add_reviews.sql no está numerado ni cubierto por el verifier y el drift audit registró que en vivo el trigger se llama update_host_rating (repo: update_host_average_rating).
ACEPTACIÓN: un solo camino de envío vía DAL; una sola fuente del promedio; reseñable desde end_time; ruta de reporte de reseña.

### [INS-13] Verificación de instructor: no existe UI admin ni trigger; is_verified_instructor nunca se setea

- **Área:** Producto · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Auth
- **Journey / lado:** Instructor / admin
- **Ruta/Archivo:** `app/admin/useAdminActions.ts; supabase/migrations/114_users_discoverable_and_self_location.sql:52; lib/dal/instructors.ts:162`

**Descripción**

VERIFICADO: grep de protect_verified|verified_instructor en supabase/ solo devuelve 114:52 (una lectura). No existe el trigger protect_verified_instructor que docs/DRIFT_AUDIT mencionaba como live-only guard, y app/admin no tiene acción de verificar instructor (solo ban/unban y verificación de foto). El flag alimenta el badge, el ranking (lib/dal/instructors.ts:162) y el gate de lead discovery (INS-05).
FIX: acción admin "verificar instructor" (con audit) + guard de escritura (INS-02).
ACEPTACIÓN: el admin puede verificar; el badge aparece; ningún usuario puede auto-verificarse.

### [MED-01] Cerrar el hueco HEIC: 5 inputs accept='image/\*' suben el HEIC crudo de iPhone que no renderiza en Android/desktop

- **Área:** Producto · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Uploads de fotos (productos, posts, bulletin, comunidades)
- **Ruta/Archivo:** `components/products/ProductImageUpload.tsx:34-35,83; components/dashboard/PostComposer.tsx:162-165,318; components/CommunityBulletinTab.tsx:175-178,343; app/communities/[id]/page.tsx:358; app/communities/[id]/post/page.tsx:225; components/stories/storyUploadHelpers.ts:96`

**Descripción**

VERIFICADO: cinco inputs usan accept="image/\*" (justo el caso en que iOS entrega .HEIC); tres suben los bytes originales con extensión y content-type originales (ProductImageUpload:34-35 sin compresión ni límite; PostComposer:162-165; CommunityBulletinTab:175-178). Los buckets no tienen allowlist MIME, el HEIC aterriza y falla para todo Android/desktop. Los dos paths de comunidad pasan por compressImage pero storyUploadHelpers.ts:96 cae al archivo original si el decode falla. No hay 'heic'/'heif' en el código.
FIX: accept="image/jpeg,image/png,image/webp" (como los otros 17 inputs) y hacer que el fallo de compressImage sea rechazo con mensaje bilingüe.
ACEPTACIÓN: subir un HEIC desde iPhone produce un JPEG o un error claro, nunca un archivo roto.

### [NAT-02] Shell nativo: tema Android stock (índigo/rosa), splash iOS blanco, webDir 'out' de enero y sin StatusBar; agrupar con el reenvío

- **Área:** Producto · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Nativo (cap sync + reenvío) · **Riesgo:** Revisión de tienda (server.url remoto sin fallback offline)
- **Journey / lado:** Nativo: arranque en frío
- **Ruta/Archivo:** `android/app/src/main/res/values/styles.xml:7-9; android/app/src/main/res/values/colors.xml; ios/App/App/Base.lproj/LaunchScreen.storyboard:25; capacitor.config.ts:8,11-14; next.config.ts; contexts/ThemeContext.tsx:68-73; app/layout.tsx:73`

**Descripción**

VERIFICADO: styles.xml:7-9 referencia @color/colorPrimary|colorPrimaryDark|colorAccent que NO existen en colors.xml (solo notification_color) y resuelven a los defaults de Capacitor: índigo #3F51B5 / #303F9F / rosa #FF4081 en ripples, handles y status bar. LaunchScreen.storyboard:25 fondo blanco puro vs superficie de marca #272D34: flash blanco -> charcoal en el arranque. capacitor.config.ts:8 webDir 'out' pero next.config.ts no tiene output:'export' y out/index.html es del 25-ene-2026 (las copias en ios/App/App/public y android/.../assets/public son del 7-may): un cap sync hoy embebe un bundle de 8 meses; server.url remoto (capacitor.config.ts:11-14) sin fallback offline es riesgo 4.2/2.5.2 de App Store. @capacitor/status-bar no está instalado: el tema (ThemeContext.tsx:68-73) nunca llega al chrome nativo; app/layout.tsx:73 fija black-translucent. Node: package.json sin engines, sin .nvmrc; solo ci.yml:22 pin Node 20.
FIX: colors.xml de marca, splash charcoal, @capacitor/status-bar sincronizado con ThemeContext, decidir export estático vs remoto, engines + .nvmrc + runbook de release.
ACEPTACIÓN: arranque en frío sin flash blanco; status bar sigue el tema; `npm run release:native` documentado.

### [NOT-05] Deep links para los tipos de notificación que hoy no hacen nada al tocarlos (waitlist_offered, smart_match, like, training_interest, nudges...)

- **Área:** Producto · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Campana / re-engagement
- **Ruta/Archivo:** `app/notifications/page.tsx:37,46-74; app/api/cron/waitlist-expiry/route.ts:80,95; app/api/cron/spotlight-rotation/route.ts:106; app/api/cron/smart-match/route.ts:277; components/instructor/InterestButton.tsx:115; app/partners/apply/page.tsx:110; lib/dal/communityBulletin.ts:134; lib/dal/promote.ts:576; app/api/cron/behavioral-nudges/route.ts:122,133`

**Descripción**

QUÉ PASA: getNotificationLink devuelve null (tap inerte) para waitlist_offered y waitlist_expired (escritos en waitlist-expiry:80,95: el usuario recibe una oferta reclamable y el tap no hace nada), spotlight_selected, smart_match, training_interest, partner_application, bulletin_pending, like, weekly_recap/comeback y todos los tipos de behavioral-nudges (:133) aunque :122 ya calcula actionUrl. `type: 'review'` tiene link en :56 pero el ícono está en review_received (:37). Ningún destino es una ruta muerta.
FIX: extender la lista de sesión :52-58 con los tipos de waitlist; like/training_interest -> perfil del actor; persistir actionUrl en la fila para nudges.
ACEPTACIÓN: cada type escrito por algún sender tiene un link o un comentario explícito de por qué no.

### [BIZ-08] Traducir los strings en inglés fuera del diccionario (paridad de claves es limpia; el gap son literales en errores, placeholders y aria-labels)

- **Área:** Producto · **Prioridad:** Baja · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Usuarios en español
- **Ruta/Archivo:** `app/global-error.tsx:48; app/profile/[userId]/error.tsx:37; app/profile/edit/page.tsx:373,395; components/dashboard/PostComposer.tsx:288; app/communities/[id]/page.tsx:342,556; app/profile/[userId]/ProfilePageClient.tsx:243,251; app/promote/boosts/page.tsx:519; app/earnings/payout-settings/page.tsx:296`
- **Notion:** actualiza la fila existente «T-AUD8: La app arranca en inglés por defecto»

**Descripción**

VERIFICADO: messages/en.json y es.json tienen 193 claves cada uno, diff 0; translationBase (126) y translationExtras (207) también. El gap son literales que nunca entraron al diccionario: "Something went wrong" (global-error:48, profile error:37), placeholders (profile/edit:373,395; PostComposer:288), aria-label/alt (communities:342,556; ProfilePageClient:243,251), showError en inglés (boosts:519; payout-settings:296). Complementa T-AUD8 (idioma por defecto).
FIX: mover a messages/\*.json; regla ESLint para aria-label/placeholder/alt literales en app/\*\*.
ACEPTACIÓN: script que falle si un literal ASCII >3 palabras aparece en JSX de app/ fuera de t().

### [BRAND-02] Tipografía: Plus Jakarta Sans solo en el árbol React; OG cards en system-ui, emails en Arial, /download y offline en -apple-system

- **Área:** Producto · **Prioridad:** Baja · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Layout shift en clientes de email
- **Journey / lado:** Marca: share cards y emails
- **Ruta/Archivo:** `app/layout.tsx:17-22,58; tailwind.config.ts:112-115; app/api/og/route.tsx:206,296,362,432,484; lib/email/weeklySummary.ts:136; lib/email/signUpInvite.ts:153; lib/email/intelligenceDigest.ts:199; lib/email/coachAddedYouWelcome.ts:120; lib/email/tribeOsBetaWelcome.ts:172; lib/email/tribeOsWaitlist.ts:112; lib/email/auditAlertEmail.ts:168; public/download/index.html:25; public/offline.html:11`
- **Notion:** actualiza la fila existente «Discrepancia de marca: tres verdes y dos sistemas tipográficos»

**Descripción**

VERIFICADO: Jakarta se carga una vez vía next/font (layout.tsx:17-22) y está bien cableada (tailwind:112-115). Fuera del árbol React diverge: OG (Satori sin buffer de fuente registrado -> system-ui en 5 sitios), los 7 emails en Arial, download/offline en la pila Apple. No hay Inter ni @font-face.
FIX: registrar el .ttf de Jakarta en el `fonts` de ImageResponse (mayor palanca: son las share cards públicas); @import + fallback en emails y en las dos páginas estáticas.
ACEPTACIÓN: una OG card renderiza en Jakarta; los emails declaran Jakarta con fallback.

### [BRAND-03] Agregar color-scheme y meta theme-color dinámico; el tema nunca llega a los controles nativos ni a la status bar

- **Área:** Producto · **Prioridad:** Baja · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Tema claro/oscuro
- **Ruta/Archivo:** `contexts/ThemeContext.tsx:45-49,68-73; app/layout.tsx:63-67,73; app/globals.css; public/manifest.json:11`

**Descripción**

VERIFICADO: ThemeContext solo togglea la clase light/dark en <html>; no hay `color-scheme` en globals.css ni <meta name="theme-color"> en layout.tsx (solo manifest.json:11, que el navegador ignora fuera de PWA instalada). Consecuencia: controles nativos, scrollbars y autofill quedan claros en dark mode; la status bar iOS está fija en black-translucent (:73). La migración a tokens _-theme-_ va al ~31% de archivos (127/407); 188 líneas con bg-white sin dark: en la misma línea; 78 clases hex arbitrarias; T0-4 (feed invisible en claro) YA está arreglado (InstructorPostCard usa text-theme-\*), resta hover:text-[#A3E635] en :170.
FIX: `color-scheme: light dark` en :root y por clase; meta theme-color desde resolvedTheme; (nativo, con NAT-02) @capacitor/status-bar.
ACEPTACIÓN: un <input type=date> en dark mode renderiza oscuro; script check-theme-contrast pasa.

### [PAY-07] Moneda: USD por defecto en una plataforma de Medellín, FX 4000 hardcodeado y convención COP x100 sin tipar

- **Área:** Producto · **Prioridad:** Baja · **Estado:** Por verificar
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Instructor: precios / earnings
- **Ruta/Archivo:** `lib/userCurrency.ts:33-39; lib/payments/stripe.ts:36-45; app/api/payment/create/route.ts:199,344,661-662; lib/payments/config.ts:34-36; app/onboarding/instructor (moneda de earnings)`
- **Notion:** actualiza la fila existente «Monedas mezcladas: sesiones en USD y COP sin lógica aparente»

**Descripción**

VERIFICADO: COP se almacena como valor x100 y cada llamada a Stripe divide por 100 porque Stripe trata COP como zero-decimal (stripe.ts:36-45; create:199,344,661-662): correcto en cada sitio leído pero la convención no está tipada. La tasa de display es 4000 COP/USD hardcodeada (userCurrency.ts:33-39). El onboarding de instructor y el dashboard de earnings usan USD por defecto (coincide con T-AUD17 del board). Wompi (COP) es el gateway por defecto pero falla cerrado sin credenciales; PAYMENT_GATEWAY_OVERRIDE puede rutear COP a Stripe (config.ts:19-32).
FIX: default COP para cuentas en Colombia; tipo nominal CopCents; FX desde config o API; test que cubra el x100.
ACEPTACIÓN: un instructor nuevo en Medellín ve COP por defecto; test de redondeo COP->Stripe.

---

## Área: Seguridad (10)

### [INS-02] Bloquear la auto-escalada de columnas de users: tribe*os_tier, is_verified_instructor, subscription_tier, lead*\*

- **Área:** Seguridad · **Prioridad:** Alta · **Estado:** Por verificar
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Auth; fondos; migración
- **Journey / lado:** Instructor / Tribe.OS premium / Tribe+
- **Ruta/Archivo:** `supabase/migrations/060_tribe_os_premium.sql:21-30; 066_users_column_level_grants.sql:45-50; 098_rls_self_escalation_guards.sql:40-44; lib/auth/premium.ts:49`

**Descripción**

QUÉ PASA (repo): 060 agrega las columnas de tier; 066 restringe SOLO SELECT; `grep -riE "(grant|revoke) update" supabase/migrations` no devuelve nada para users; 098 guarda solo `banned` (y 043 solo `is_admin`). Con la policy de UPDATE `auth.uid() = id` y grant de UPDATE a nivel tabla por defecto, cualquier usuario logueado puede `PATCH /rest/v1/users?id=eq.<self>` con {"tribe_os_tier":"team_studio"} y TODOS los gates pasan (servidor lib/auth/premium.ts:49; cliente hooks/useTribeOSPremiumGate.ts:68). Igual para is_verified_instructor (badge + ranking lib/dal/instructors.ts:162), subscription_tier (Tribe+ gratis; el waiver de fee lo lee app/api/payment/create/route.ts:543-553) y lead_credits_remaining/lead_tier.
POR VERIFICAR EN VIVO: `select grantee, privilege_type from information_schema.role_table_grants where table_name='users' and grantee='authenticated'` y `select * from information_schema.column_privileges where table_name='users' and privilege_type='UPDATE'`. El script scripts/rls-leak-test.js (crea usuarios efímeros) puede extenderse con un caso de PATCH.
FIX: trigger BEFORE UPDATE estilo 098 que rechace cambios a esas columnas cuando auth.uid() IS NOT NULL AND NOT is_app_admin_uid(auth.uid()); alternativamente REVOKE UPDATE a nivel tabla + GRANT UPDATE (cols seguras) con el patrón dinámico de 066.
ACEPTACIÓN: PATCH propio de tribe_os_tier devuelve 42501; el service role y el admin siguen pudiendo; verifier con probe.

### [SEC-01] Re-revocar a nivel de TABLA el SELECT de users para authenticated: la 093 anuló las revocaciones por columna 113/115/118

- **Área:** Seguridad · **Prioridad:** Alta · **Estado:** Por verificar
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Auth; migración (rehearsal obligatorio: la 065 rompió perfiles)
- **Journey / lado:** Todos / privacidad de usuarios
- **Ruta/Archivo:** `supabase/migrations/093_restore_users_select_grant.sql:20; 113_revoke_users_sensitive_columns.sql:29; 115_revoke_users_coords.sql:27; 118_revoke_users_email.sql:26; 066_users_column_level_grants.sql:2-7; 130_rls_h3_gate3_column_level_grants.sql:2-9`

**Descripción**

QUÉ PASA (regla Postgres ya confirmada empíricamente por este repo en 066:2-7 y 130:2-9): un REVOKE por columna es NO-OP mientras el rol tenga GRANT SELECT a nivel tabla. 093:20 emite exactamente eso: `GRANT SELECT ON public.users TO authenticated`. Todas las revocaciones posteriores sobre users son por columna contra authenticated: 113:29 (is_admin, payout_method, stripe_account_id, wompi_merchant_id, total_earnings_cents), 115:27 (location_lat/lng), 118:26 (email). El header de 113:8-9 afirma "no table-level SELECT grant exists since 067", pero 093 es posterior a 067 y lo restauró; `grep -niE "(grant|revoke) select ... on users"` en migraciones solo encuentra el GRANT de 093 (067 revoca con SQL dinámico). anon no está afectado.
IMPACTO si se confirma: cualquier usuario logueado lee email, coords precisas, is_admin, stripe_account_id, wompi_merchant_id, payout_method y total_earnings_cents de TODOS los usuarios en una llamada PostgREST, anulando T-SEC3/T-SEC4/T-SEC5 y dejando decorativas users_discoverable y get_my_private_profile.
VERIFICAR PRIMERO (solo lectura): `select grantee, column_name from information_schema.column_privileges where table_schema='public' and table_name='users' and privilege_type='SELECT' and grantee in ('anon','authenticated') and column_name in ('email','location_lat','location_lng','is_admin','stripe_account_id','wompi_merchant_id','payout_method','total_earnings_cents');` y `select * from information_schema.role_table_grants where table_name='users'`.
FIX: migración con el patrón dinámico 066/067: REVOKE SELECT ON users FROM authenticated + GRANT SELECT(<cols seguras>) reconstruido desde information_schema.columns. NO otra revocación por columna. Ensayar la lista de grant-back.
ACEPTACIÓN: como authenticated, `select email from users limit 1` devuelve 42501; /profile y /storefront siguen cargando.

### [SEC-02] notify-join: exigir participación en los kinds 'leave' y 'guest' y derivar joiner_name en servidor (primitiva de phishing)

- **Área:** Seguridad · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Auth
- **Journey / lado:** Host: notificaciones de sesión
- **Ruta/Archivo:** `app/api/sessions/notify-join/route.ts:38,47-57,84,104-108,132,145-152,168-177`

**Descripción**

QUÉ PASA: :108 salta el check de participante para kind 'guest' y 'leave'. joiner_name lo manda el caller (:38, max 80) y sanitizeName (:47-57) solo quita C0/DEL; se interpola en el cuerpo (:132), se escribe en la campana del host con service-role (:145-152) y se pushea a su dispositivo (:168-177). Cualquier usuario logueado puede POST {session_id:<cualquiera>, kind:'leave', joiner_name:'Tribe Soporte: verifica tu cuenta en …'} y colocar ~80 caracteres atribuidos a Tribe en la campana y el push de cualquier host, 20 veces/60s por atacante (:84), sin tope entre sesiones.
FIX: exigir fila de participante también en 'leave' (llamar notify ANTES del delete); para 'guest' atar al guest_token que devuelve join_session_as_guest (120:100-104); derivar joiner_name de users.name en servidor (como ya hace notify-interest :72,81).
ACEPTACIÓN: POST con kind 'leave' sin fila de participante -> 403; joiner_name del body ignorado para usuarios autenticados.

### [SEC-03] Unificar los dos gates de admin (is_app_admin() vs ADMIN_EMAILS hardcodeado) en las rutas destructivas

- **Área:** Seguridad · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Auth
- **Journey / lado:** Admin
- **Ruta/Archivo:** `lib/admin.ts:10-16; lib/admin-config.ts:12; lib/auth/adminApi.ts:47-48; app/api/admin/users/[id]/delete/route.ts:36; app/api/admin/tribe-os/grant-premium/route.ts:33`

**Descripción**

QUÉ PASA: dos definiciones de "admin" conviven: flag de DB vía RPC is_app_admin() (lib/auth/adminApi.ts:47-48, gatea /api/admin/data y páginas /admin/\*) y allowlist de emails literal (lib/admin.ts:10-16 + lib/admin-config.ts:12) que gatea las DOS rutas más destructivas: borrar usuario (:36) y otorgar premium (:33). Consecuencias: un admin legítimo (is_admin=true) ve el control de borrar y recibe 403; quien controle una de las dos direcciones literales borra usuarios y otorga premium SIN fila is_admin y sin pasar por admin_role_audit (043:66-85); la comparación es case-sensitive.
FIX: isAdmin() sobre is_app_admin(); retirar ADMIN_EMAILS; un solo helper requireApiAdmin.
ACEPTACIÓN: las dos rutas responden 403 a un email de la lista sin is_admin y 200 a un is_admin real.

### [SEC-04] T-SEC4-B: mover la escritura del bucket media a una ruta service-role con path derivado del uid (INSERT sigue siendo bucket-only)

- **Área:** Seguridad · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Migración (policies)
- **Journey / lado:** Instructor: banner / video
- **Ruta/Archivo:** `supabase/migrations/146_sec4_capture_production_media_policies.sql:58-63; components/dashboard/VideoUploadSection.tsx:67-68; components/dashboard/StorefrontEditor.tsx:78-86; supabase/migrations/091_media_bucket.sql:13-15`
- **Notion:** actualiza la fila existente «T-SEC4-B — escrituras en storage sin restricción de propietario»

**Descripción**

RE-VERIFICADO vigente: la policy de INSERT más reciente sobre media (146:58-63) es WITH CHECK (bucket_id='media'), bucket público (091:13-15). Con keys estables + upsert:true (storefront-videos/<uid>/intro.mp4, storefront-banners/<uid>/banner) cualquier usuario autenticado reemplaza el video o banner de un instructor competidor con cualquier jpeg/png/webp/mp4 y se sirve públicamente al instante. NOTA: el fix de "fuga de storage" (paths estables) AMPLIÓ esta ventana al hacer las keys predecibles.
FIX (evita el misterio del WITH CHECK documentado en docs/T-SEC4-B): POST /api/storefront/{video,banner} que autentica, deriva el path del user.id en servidor, valida tipo/tamaño y escribe con service-role; luego restringir INSERT/UPDATE de media a service_role.
ACEPTACIÓN: upload directo desde el cliente al path de otro uid -> 42501; el flujo del editor sigue funcionando.

### [SEC-05] Aplicar `banned` y `blocked_users` en join_session y join_session_as_guest

- **Área:** Seguridad · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Migración (RPC)
- **Journey / lado:** Atleta/host: unirse
- **Ruta/Archivo:** `supabase/migrations/119_join_session_enforce_policy_and_owner.sql:50-149; 120:36-107; 061_blocked_users.sql:35-45; 098:20-44`

**Descripción**

QUÉ PASA: join_session valida identidad, sesión, cancelled, token, policy y capacidad, pero NO chequea users.banned (el ban solo impide auto-desbanearse, 098:20-44) ni blocked_users en ninguna dirección (061:35-45). join_session_as_guest no tiene concepto de ban/bloqueo. No hay redefinición posterior de join_session en el árbol (grep en 119/120/153/155).
IMPACTO: bloquear a alguien no impide que se presente físicamente a tu sesión; las cuentas baneadas participan igual.
FIX: tras el lock de sesión, rechazar si banned o si existe blocked_users entre p_user_id y sessions.creator_id; códigos de error distintos.
ACEPTACIÓN: usuario bloqueado por el host recibe 'blocked' al unirse; guest de un teléfono baneado idem si aplica.

### [SEC-12] Confirmar en vivo que la migración 140 (revocar SELECT de sessions a anon) fue aplicada; es un draft auto-abortante

- **Área:** Seguridad · **Prioridad:** Media · **Estado:** Por verificar
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Auth
- **Journey / lado:** Anon / privacidad
- **Ruta/Archivo:** `supabase/migrations/140_rls_h4_gate3_revoke_sessions_from_anon.sql:4-8,49,52-60; supabase/verify-migration-state.sql:649`

**Descripción**

QUÉ PASA: 140:4-8 y el preflight :52-60 hacen que NO pueda aplicarse pegando y corriendo; la atestación :49 está comentada. Si nunca se aplicó, anon aún tiene SELECT sobre la tabla base sessions (coords a precisión completa) y sessions_public (138:72, redondeada a 3dp) es un camino paralelo, no el único. 137:90-96 sí quitó payment_instructions de anon. La memoria del proyecto dice "RLS-H4 COMPLETE (137/138/139/140 aplicadas)" pero el repo no lo puede probar.
VERIFICAR: correr verify-migration-state.sql:649 en el SQL editor, o `select privilege_type from information_schema.role_table_grants where table_name='sessions' and grantee='anon'`.
ACEPTACIÓN: anon no tiene SELECT en public.sessions; /s/[id] sigue funcionando vía sessions_public.

### [SEC-08] Validar la extensión antes de meter el nombre del archivo en la key de storage (traversal latente)

- **Área:** Seguridad · **Prioridad:** Baja · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Uploads
- **Ruta/Archivo:** `app/profile/useProfile.ts:120-131; components/PostSessionFlow.tsx:263-264; components/CommunityBulletinTab.tsx:174-175`

**Descripción**

QUÉ PASA: varios helpers empalman `file.name.split('.').pop()` como último segmento de la key sin allowlist (useProfile.ts:129-131, PostSessionFlow.tsx:263-264, CommunityBulletinTab.tsx:174-175). Un name manipulado inyecta `/` y `..` después del prefijo uid, justo el segmento del que dependerá cualquier policy owner-scoped futura. No hay traversal HOY (policies bucket-only/dashboard) pero anulará SEC-04/SEC-07 el día que aterricen. El allowlist MIME de useProfile.ts:120-125 valida file.type, no el nombre.
FIX: derivar la extensión del MIME validado o allowlist ['jpg','jpeg','png','webp','mp4'].
ACEPTACIÓN: un File con name "../../x.jpg" produce una key sin segmentos extra.

### [SEC-09] Exigir is_instructor para crear productos (hoy cualquier cuenta puede)

- **Área:** Seguridad · **Prioridad:** Baja · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Migración (policy)
- **Journey / lado:** Marketplace
- **Ruta/Archivo:** `app/create-product/page.tsx:20; supabase/migrations/013_product_storefront.sql:102-108`

**Descripción**

QUÉ PASA: /create-product solo resuelve el usuario (:20); la policy products_insert_own (013:107-108) es solo identidad (instructor_id = auth.uid()). Cualquier cuenta crea productos visibles donde status='active' se lista (013:102-105). /promote (:119) y /earnings (:162) sí gatean por is_instructor. NOTA: en la DB viva las tablas products/product_orders NO EXISTEN (ver DB-01), así que hoy esto falla por otra razón; aplicar al reactivar.
FIX: check de is_instructor en la página y EXISTS(select 1 from users where id=auth.uid() and is_instructor) en el WITH CHECK.
ACEPTACIÓN: un atleta recibe 42501 al insertar en products.

### [SEC-11] Restringir /api/tribe-os/audit/export (CSV con emails de actores) a owners del gym, no a cualquier coach

- **Área:** Seguridad · **Prioridad:** Baja · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Tribe.OS: audit
- **Ruta/Archivo:** `app/api/tribe-os/audit/export/route.ts:51-65`

**Descripción**

QUÉ PASA: gatea solo por requireTribeOSPremium (:51-52), es decir cualquier coach del gym; luego usa service-role específicamente para leer emails de actores que T-SEC5 hizo ilegibles en sesión (:63-65) y los exporta hasta 5000 filas en CSV. El aislamiento por gym se mantiene; el problema es que cada coach recibe el PII que la revocación quiso esconder.
FIX: check gyms.owner_id = userId en la ruta de export; el visor paginado puede seguir para coaches.
ACEPTACIÓN: un coach no-owner recibe 403 en export.

---

## Área: Pagos (4)

### [PAY-01] Implementar el kill switch INSTRUCTOR_PAYMENTS_ENABLED en /api/payment/create (boost y pro_storefront cobran 100% a Tribe hoy vía API)

- **Área:** Pagos · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Toca fondos
- **Journey / lado:** Instructor: promote / pagos
- **Ruta/Archivo:** `app/api/payment/create/route.ts:233-373,274-281,285-297,290; app/promote/boosts/page.tsx:393-405; app/api/tribe-os/subscription/checkout/route.ts:57; lib/payments/config.ts; docs/tribe_payments_kill_switch_spec.md:9,108-125`
- **Notion:** actualiza la fila existente «DECISIÓN: Tribe ya procesa y RETIENE fondos — resolver conflicto con el principio de 'no manejar fondos'»

**Descripción**

VERIFICADO: INSTRUCTOR_PAYMENTS_ENABLED aparece SOLO en docs/tribe_payments_kill_switch_spec.md; ninguna ocurrencia en .ts/.tsx. Solo existe TRIBE_OS_BILLING_ENABLED (checkout/route.ts:57). El branch boost/pro de app/api/payment/create/route.ts:233-373 crea un Stripe Checkout real SIN transfer_data (= la plataforma retiene el 100%, lib/payments/stripe.ts:56-62,131-141), escribe platform_fee_cents = amount_cents e instructor_payout_cents = 0 (:290) y la campaña nunca se activa. pro_storefront: reference_id sin check de ownership y precio hardcodeado $29.99 / 9.900.000 COP (:274-281). El único gate es de cliente (boosts/page.tsx:393-405): cualquier instructor autenticado que POSTee {payment_type:'boost_campaign', reference_id:<propia>, currency} paga a Tribe sin recibir nada y sin camino de reembolso. No existe código de payout en el repo (payout_status solo se lee en earnings/page.tsx:254 y se pone 'cancelled' en sessions.ts:508).
FIX (aprobado en el spec): helper isInstructorPaymentsEnabled() en lib/payments/config.ts, default off, 503 al inicio de POST /api/payment/create para TODOS los branches (mismo patrón que isBillingEnabled). fee_cents=0 mientras esté off.
ACEPTACIÓN: POST /api/payment/create con la flag off devuelve 503 en session, tip, boost y pro; test de ruta.

### [PAY-02] DECISIÓN PARA AL: qué hacer con los branches Stripe/Wompi de sesión y tip (armados, sin caller de UI, Tribe merchant of record; Wompi retiene 100%)

- **Área:** Pagos · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Toca fondos; posible dinero ya retenido en Stripe/Wompi
- **Journey / lado:** Atleta paga sesión / instructor cobra
- **Ruta/Archivo:** `app/api/payment/create/route.ts:76-230,375-701,597-631,637-654,662-677; lib/payments/stripe.ts:131-141; lib/payments/wompi.ts:56-66; lib/payments/config.ts:19-36; app/earnings/page.tsx:254,578-582`
- **Notion:** actualiza la fila existente «DECISIÓN: Tribe ya procesa y RETIENE fondos — resolver conflicto con el principio de 'no manejar fondos'»

**Descripción**

MAPA DE DINERO VERIFICADO (no es scaffolding): (1) Sesión paga, camino VIVO = off-platform (ActionButtons.tsx:205-215 -> PaidSessionRequest; el atleta paga por Nequi/transferencia/efectivo; el host confirma con confirmParticipantPayment): Tribe no toca dinero. OK. (2) Checkout de participación Stripe (route.ts:375-701): destination charge con transfer*data + on_behalf_of (stripe.ts:131-141): Tribe es merchant of record, los fondos aterrizan en la cuenta plataforma antes del transfer y la application fee del 15% (:662-674) se queda. Sin caller de UI. (3) Sesión en COP por Wompi (:597-631): 100% a la cuenta Wompi de Tribe, sin transfer, sin código de payout; hoy falla cerrado porque getCredentials lanza sin WOMPI*\* (wompi.ts:56-66) pero Wompi sigue siendo el gateway por defecto para COP (config.ts:34-36). (4) Tips: destination con fee 0 (:76-230); entradas de UI removidas (commit 69a0215), TipButton sin render site. (5) Boost/pro: ver PAY-01. (6) Pedidos de producto: ningún gateway se llama (ver PAY-03). (7) Tribe.OS premium: Stripe subscription $30/mes, 503 por TRIBE_OS_BILLING_ENABLED. (8) Tribe+: nada cableado. Webhooks: firma + dedupe por event id correctos (stripe:24-46, wompi:46-49,78-110); el catch-all de Stripe devuelve 200 en excepciones (:346), así que un crash tras el insert de dedupe pierde el evento sin retry.
DECISIÓN (no fix de código): (a) borrar los branches de sesión/tip, (b) dejarlos dormidos detrás del kill switch, o (c) aceptar destination charges como pass-through. Además: comprobar en los dashboards de Stripe y Wompi si hay saldo retenido hoy; el repo no puede responderlo. Las filas de payments con payout_status pendiente están varadas: nada las avanza.
ACEPTACIÓN: decisión escrita en docs/tribe_payments_kill_switch_spec.md; si (a) o (b), PAY-01 cubre el bloqueo.

### [PAY-03] 'Compra exitosa' en pedidos de producto que nunca se pagan (y contra una tabla que no existe en vivo)

- **Área:** Pagos · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Toca fondos; confianza
- **Journey / lado:** Atleta compra producto
- **Ruta/Archivo:** `app/product/[id]/ProductDetailClient.tsx:105-125; app/api/products/order/route.ts:1-10; supabase/migrations/013_product_storefront.sql:73; lib/dal/products-storefront.ts:175-196; app/api/products/download/[orderId]/route.ts:49`

**Descripción**

QUÉ PASA: handleBuy POSTea a /api/products/order y muestra "Purchase successful" incondicionalmente + navega a /my-orders (:105-125). La ruta crea product_orders con payment_status='pending' (013:73) y NUNCA llama un gateway (su propio header :9 dice "frontend handles payment separately", y ningún frontend lo hace). Se decrementa inventario (:175-196) y la descarga digital queda bloqueada (:49). ADEMÁS: en la DB viva products/product_orders no existen (DB-01), así que hoy el insert falla y el usuario igual ve "compra exitosa".
FIX: esconder Comprar tras el kill switch (PAY-01) o reemplazar el toast por un flujo off-platform espejo de PaidSessionRequest (instrucciones de pago del instructor, pedido pending, confirmación de recibo por el instructor). No agregar gateway.
ACEPTACIÓN: ningún mensaje de éxito sin pago confirmado; inventario solo baja al confirmar.

### [PAY-06] Tribe+ (atletas): subscription_tier se lee en 2 paths de fee y un badge pero NINGÚN camino vivo lo escribe (código muerto + cron contra columna que nadie setea)

- **Área:** Pagos · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Migración si se borran funciones
- **Journey / lado:** Atleta: Tribe+
- **Ruta/Archivo:** `lib/dal/subscriptions.ts:22-26,68-104,141-144; app/api/payment/create/route.ts:543-553; lib/dal/products-storefront.ts:120-130; lib/subscription/config.ts:86; components/TribePlusBadge.tsx:16; app/api/cron/subscription-expiry/route.ts; app/tribe-plus/page.tsx:29-57`
- **Notion:** actualiza la fila existente «Suscripciones: Tribe+ (atletas) y Tribe.OS premium (instructores)»

**Descripción**

VERIFICADO: el único escritor de subscription_tier es markSubscriptionApproved (lib/dal/subscriptions.ts:88) con CERO llamadores; createSubscription/cancelSubscription/renewSubscription/fetchSubscriptionPayments también sin llamadores. Lectores: waiver de fee en payment/create:543-553 y products-storefront:120-130, y el badge. El cron subscription-expiry solo degrada a 'free' (:141-144) una columna que nada sube. /tribe-plus es preview admin-only. Tribe.OS premium en cambio está coherente: lo escribe el webhook de Stripe (syncFromStripeSubscription, stripe/route.ts:211-243) y el grant admin; lo lee requireTribeOSPremium en ~25 rutas; columnas tribe_os_tier/status/stripe_customer_id/stripe_subscription_id/granted_at/granted_by (NO existe tribe_os_premium_until, ni en código ni en vivo). Tres significados de "suscripción" conviven: Tribe+ (atleta), Tribe.OS premium (instructor SaaS) y session_subscriptions (inscripción a series, sin dinero, /subscriptions).
FIX: borrar las funciones inalcanzables y el cron, o anotarlas como grant-manual (patrón Tribe.OS); mantener isPlus/badge si Tribe+ sigue como perk manual. Proteger la escritura (INS-02).
ACEPTACIÓN: ningún DAL sin llamador en lib/dal/subscriptions.ts; una edición manual de subscription_tier está guardada por trigger.

---

## Área: Infra (21)

### [DB-01] Las tablas products y product_orders NO EXISTEN en la DB viva: todo el marketplace de productos falla y el tab Productos aparece en cada storefront

- **Área:** Infra · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Migración (aplicar 013 o retirar la feature); toca fondos (pedidos)
- **Journey / lado:** Atleta compra / instructor vende / storefront
- **Ruta/Archivo:** `supabase/migrations/013_product_storefront.sql; app/storefront/[id]/useStorefrontData.ts:274-277,351; app/storefront/[id]/page.tsx:41-45; app/api/products/*; app/product/[id]; app/create-product; app/my-orders; app/orders`

**Descripción**

VERIFICADO EN VIVO (2026-09-04, `supabase gen types --linked` + `supabase db lint --linked`): el esquema public tiene 88 tablas y NINGUNA se llama products ni product_orders. El lint en vivo reporta: `public.finalize_payment -> ERROR: relation "product_orders" does not exist (42P01)`. La migración 013_product_storefront.sql existe en el repo pero nunca se aplicó (o se revirtió). La app tiene 27 sitios `.from('products'|'product_orders')`.
EFECTO VISIBLE HOY: app/storefront/[id]/useStorefrontData.ts:274-277 hace el count de products "fail-open" (error -> productCount=null) y page.tsx:41-45 muestra el tab cuando productCount === null: el tab "Productos" aparece en TODOS los storefronts y su panel (StorefrontProductsSection) falla. /create-product, /product/[id], /my-orders, /orders y /api/products/\* fallan con "relation does not exist". El botón Comprar (ver PAY-03) crea pedidos contra una tabla inexistente.
DECISIÓN + FIX: o se aplica 013 (y se agrega probe al verifier) o se esconde toda la superficie de productos detrás del kill switch de pagos (PAY-01). Mientras tanto, cambiar el fail-open a fail-closed en useStorefrontData (error -> ocultar tab).
ACEPTACIÓN: ningún storefront muestra un tab que no puede renderizar; `select to_regclass('public.products')` documentado en el verifier.

### [DB-02] 19 tablas vivas sin CREATE TABLE en el repo (payments, messages, chat*messages, push*\*, instructor_posts, post_likes, service_packages, storefront_media, session_attendance, ...)

- **Área:** Infra · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** L · **Deploy:** Web (Vercel) · **Riesgo:** Migración (captura idempotente)
- **Journey / lado:** Infra / rebuild / DR
- **Ruta/Archivo:** `supabase/migrations/; supabase/schema.sql; docs/DRIFT_AUDIT_2026-07-08.md`
- **Notion:** actualiza la fila existente «user_follows y payment_confirmed_by existen solo en la DB viva, sin migración rastreada»

**Descripción**

ACTUALIZACIÓN del ticket (user*follows y payment_confirmed_by): esos dos YA fueron capturados por la migración 147 (147:33-38 tabla + :73-74 columna) y verificados en vivo (user_follows existe; session_participants.payment_confirmed_by existe; payment_confirmed_at NO existe en vivo ni en el repo). El problema es mucho más amplio.
VERIFICADO EN VIVO vs repo: estas 19 tablas existen en producción y NINGÚN archivo bajo supabase/ las crea: payments, messages, chat_messages, push_subscriptions, push_notifications, instructor_posts, post_likes, boost_campaigns, promo_codes, promo_redemptions, service_packages, storefront_media, session_attendance, reported_users, reported_messages, user_feedback, bug_reports, clipper_videos, clipper_clips. Migraciones posteriores las ALTERan o les ponen triggers (031, 063, 068, 100, 110) y 011 tiene FK a instructor_posts, así que un rebuild desde cero falla. Además ~60 columnas usadas por la app no tienen ADD COLUMN (lista completa en el reporte F §4B: users.instructor_bio, storefront*_, certifications, years*experience, photos, sports, banned, username...; sessions.latitude/longitude, is_paid, price_cents, join_policy, visibility, payment_instructions...; session_participants.guest*_, payment\_\*). Y la tabla remota supabase_migrations.schema_migrations está VACÍA (`supabase migration list --linked`): todo se aplicó a mano por el SQL editor y la CLI no puede saber qué está aplicado.
FIX: seguir el patrón de captura 143-147: por grupo de tablas, dump de information_schema.columns + pg_constraint + pg_policies y emitir CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS + probes en el verifier. Registrar las migraciones aplicadas en schema_migrations para que `supabase migration list` refleje la realidad.
ACEPTACIÓN: `supabase db reset` local desde migraciones produce un esquema donde todos los `.from('...')` de la app resuelven; `supabase migration list --linked` muestra Local=Remote.

### [NAT-01] Enviar a las tiendas el cambio nativo de geolocalización pendiente desde julio (la app instalada no puede pedir ubicación)

- **Área:** Infra · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Nativo (cap sync + reenvío) · **Riesgo:** Revisión de tienda
- **Journey / lado:** Atleta nativo: descubrimiento por cercanía
- **Ruta/Archivo:** `android/app/src/main/AndroidManifest.xml; android/app/capacitor.build.gradle; android/capacitor.settings.gradle; android/app/build.gradle:17-18; ios/App/App.xcodeproj/project.pbxproj:306,314; lib/location.ts:25`

**Descripción**

VERIFICADO: `git log -- ios android capacitor.config.ts`: el último cambio nativo es fc7cd53 (2026-07-08): agrega ACCESS_COARSE/FINE_LOCATION y registra @capacitor/geolocation; su propio mensaje dice "Native rebuild + iOS pod install + App Store resubmission are DEFERRED (batch with T-NOTIF1)". Los binarios publicados siguen en versionCode 27 / 2.6.2 (build.gradle:17-18) y MARKETING_VERSION 2.6.2 / build 21 (pbxproj:306,314), del 2026-05-22. lib/location.ts:25 importa @capacitor/geolocation dinámicamente; en el binario Android publicado el plugin no está registrado: no-op o throw y fallback a Medellín por defecto. El fix T-DISC1 ("los atletas en la app nativa no podían dar permiso de ubicación y no veían sesiones cercanas") no está en manos de ningún usuario y docs/HUMAN_TODOS.md no tiene entrada de resubmit. docs/MOBILE_VERIFICATION.md es una plantilla vacía (fecha YYYY-MM-DD, matriz en blanco).
FIX: bump de versiones, cap sync (Node 22), pod install, rebuild, enviar a ambas tiendas; agrupar con NAT-02/NAT-03/BRAND-03.
ACEPTACIÓN: la app instalada muestra el prompt de ubicación y sesiones cercanas; MOBILE_VERIFICATION.md con fecha y matriz llena.

### [NOT-01] Programar (o borrar) los 5 crons huérfanos: session-reminders, reminders, post-session-followups, daily-motivation, weekly

- **Área:** Infra · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Envío de email a escala en la primera corrida; límite de crons del plan Vercel
- **Journey / lado:** Retención: recordatorios y recap
- **Ruta/Archivo:** `vercel.json; app/api/cron/session-reminders/route.ts; app/api/cron/reminders/route.ts; app/api/cron/post-session-followups/route.ts; app/api/cron/daily-motivation/route.ts:30; app/api/cron/weekly/route.ts:26-32; lib/reminders.ts:52`
- **Notion:** actualiza la fila existente «Crons de retención apagados: session-reminders, welcome email, weekly orchestrator»

**Descripción**

CONFIRMADO: vercel.json programa 12; app/api/cron tiene 17. Sin programar: session-reminders (1h/15min), reminders (2h + motivación 8am), post-session-followups (email de fotos 2h después), daily-motivation (su propio comentario :30 admite que no está en vercel.json), weekly (ÚNICO llamador de /api/send-weekly-recap y /api/send-inactive-nudge: esos emails nunca salen). No hay pg_cron (grep cron.schedule vacío) ni GitHub Actions scheduler; el único recordatorio vivo es un setTimeout de navegador de hasta 24h (lib/reminders.ts:52) que muere con la pestaña. behavioral-nudges NO reemplaza a session-reminders: solo escribe campanas in-app (:131), sin push ni timing de sesión. Welcome email: /api/send-welcome-email es un sweep con CRON_SECRET (:17) y CERO llamadores; el signup no lo envía. EVIDENCIA EN VIVO: los índices idx_sessions_reminder_1hr, idx_sessions_reminder_15min e idx_sessions_followup_sent tienen 0 scans.
PRERREQUISITOS antes de encender: NOT-02 (parse Bogotá) y NOT-03 (type en senders), si no los recordatorios llegan 5 horas tarde e ignoran preferencias. La nota del board dice que van a cron-job.org: en ese caso registrar la URL/secreto en docs y agregar un probe.
ACEPTACIÓN: un confirmado recibe push 1h antes; el recap semanal sale el lunes; welcome email llega <10 min tras verificar.

### [NOT-03] Pasar `type` desde los 8 senders de push que hoy saltan las preferencias del usuario (incluido push_enabled)

- **Área:** Infra · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Notificaciones / consentimiento
- **Ruta/Archivo:** `app/api/notifications/send/route.ts:80,203,212; app/api/sessions/notify-join/route.ts:176; app/api/sessions/notify-approval/route.ts:160; app/api/cron/daily-motivation/route.ts:69; app/api/cron/reminders/route.ts:134,159,232; app/api/cron/recurring-sessions/route.ts:218; lib/payments/notifyAfterFinalize.ts:55,80,94,142; lib/dal/sessions.ts:538; app/api/send-weekly-recap/route.ts`
- **Notion:** actualiza la fila existente «Preferencias de notificación no se respetan (3 de ~15 senders)»

**Descripción**

ACTUALIZACIÓN: son 8 senders, no 3. El gate W2 en notifications/send/route.ts:80 solo corre `if (type)`. Omiten type (y por tanto saltan TODOS los toggles incluido push_enabled): notify-join:176 y notify-approval:160 (pasan data.type ANIDADO, campo que el schema :203 nunca lee: intención perdida), daily-motivation:69, reminders:134/159/232, recurring-sessions:218 (push; la campana :211 sí gatea), notifyAfterFinalize:55/80/94/142 (booking, purchase, sale, tip), cancelSession sessions.ts:538, y send-weekly-recap (email) no importa shouldSendNotification. Migraciones 149-151 (proximity_alerts, trigger de signup, backfill) existen con probes en verifier :736/:744/:751; aplicado no comprobable desde el repo.
FIX: type top-level en cada sender (session_join, session_update, session_reminder, series_occurrences_generated, booking_confirmed/purchase_confirmed/new_sale/tip_received ya están en TYPE_META :77-124); hacer `type` REQUERIDO en sendNotificationSchema.
ACEPTACIÓN: usuario con push_enabled=false no recibe ningún push de ningún sender; test del schema rechaza payload sin type.

### [PERF-03] BottomNav: N+1 (una query count por conversación cada 30s en TODAS las rutas); reemplazar por un agregado

- **Área:** Infra · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Migración si se hace por RPC (debe ser caller-scoped)
- **Journey / lado:** Todas
- **Ruta/Archivo:** `components/BottomNav.tsx:35-51; app/messages/useMessages.ts:195-215`

**Descripción**

VERIFICADO: BottomNav.tsx:35-43 hace `for (const p of participants)` con una query count exact/head por conversación, al montar y cada 30s (:48), en un componente global. 30 conversaciones = 30 queries/30s/usuario en cada ruta; degrada el TTI de toda página, no solo /messages. Es el cluster Tier-3 de docs/FULL_APP_ASSESSMENT:200, aún abierto. useMessages.ts:195 ya muestra el patrón batched correcto.
FIX: RPC o vista `count(*) filter(...)` agrupada por conversation_id para el caller; subir a 60s o usar el canal realtime existente.
ACEPTACIÓN: 1 query por tick independientemente del número de conversaciones.

### [ATL-05] Aplicar capacidad cuando el host aprueba una solicitud pendiente (hoy es un UPDATE sin check)

- **Área:** Infra · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Migración (nuevo RPC)
- **Journey / lado:** Instructor/host: aprobar solicitudes
- **Ruta/Archivo:** `lib/dal/participants.ts:41-66; components/session/PendingRequestsPanel.tsx:87; app/requests/page.tsx:131; supabase/migrations/119_join_session_enforce_policy_and_owner.sql:113-121`
- **Notion:** actualiza la fila existente «La capacidad de sesión se puede exceder»

**Descripción**

VERIFICADO: los joins self-serve SÍ están protegidos bajo row lock (119:64-68,113-121; guest 120:84-87). El hueco real es la APROBACIÓN: aprobar un pendiente hace `UPDATE session_participants SET status='confirmed'` (lib/dal/participants.ts:41-66) sin contar cupos; ningún trigger lo respalda (087/109 solo recomputan current_participants). accept_waitlist_offer (120:168) y host_add_session_guest (153:93) también saltan capacidad, pero documentado a propósito.
IMPACTO: una sesión curada o paga se llena por encima de max_participants aprobando; luego la página muestra isFull con más gente que cupos.
FIX: RPC `approve_session_request(p_participant_id)` SECURITY DEFINER que bloquea la sesión, verifica caller=creator, recuenta confirmados y confirma o devuelve 'Session is full'.
ACEPTACIÓN: con 5/5 confirmados, aprobar un 6º devuelve error visible al host.

### [BIZ-07] Unificar NEXT_PUBLIC_SITE_URL vs NEXT_PUBLIC_APP_URL antes del dominio custom (robots/sitemap default a tribe.fitness, share a vercel.app, Capacitor fija vercel.app)

- **Área:** Infra · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) + Nativo al cambiar dominio · **Riesgo:** El contrato de trailing slash de lib/share.ts:55-57 debe sobrevivir (WhatsApp no sigue el 308)
- **Journey / lado:** Dominio custom / OG / nativo
- **Ruta/Archivo:** `app/robots.ts:5; app/sitemap.ts:4; lib/share.ts:53-57; app/s/[id]/page.tsx:6; app/i/[id]/page.tsx:5; app/invite/[token]/page.tsx:16; .env.local.example:12; capacitor.config.ts:12`

**Descripción**

VERIFICADO: robots.ts:5 y sitemap.ts:4 defaultean a https://tribe.fitness; share.ts:53, s/[id]:6, i/[id]:5, invite:16 defaultean a https://tribe-v3.vercel.app; .env.local.example define NEXT_PUBLIC_SITE_URL y NO NEXT_PUBLIC_APP_URL; capacitor.config.ts:12 hardcodea el origen vercel.app (cambiar dominio = reenvío a tiendas). Señal canónica partida; scrapers OG pueden ir al host equivocado. Relacionado: la memoria del proyecto registra el dominio custom como pendiente.
FIX: una sola NEXT_PUBLIC_SITE_URL vía lib/urls.ts sin fallback en prod (throw); documentar el cambio de server.url como paso de release.
ACEPTACIÓN: grep de 'tribe-v3.vercel.app' y 'tribe.fitness' en app/ lib/ = 0 (salvo capacitor.config y docs).

### [DB-03] Regenerar lib/database.types.ts: conoce 41 de 88 tablas, 0 de 4 vistas y 1 de 42 funciones

- **Área:** Infra · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Infra / DX
- **Ruta/Archivo:** `lib/database.types.ts:11-13,2402-2414; lib/dal/notificationPreferences.ts:139; lib/dal/sessions.ts:266`

**Descripción**

VERIFICADO EN VIVO: la DB tiene 88 tablas, 4 vistas (sessions*public, users_discoverable, session_participants_public, session_participants_roster) y 42 funciones; lib/database.types.ts (último commit e6ac712, 2026-08-04, era migración 141) tiene 41 tablas, `Views: {}` vacío y 1 función. notification_preferences ni siquiera figura en Tables pese a 037/149/150/151. 36 columnas de users presentes en vivo faltan en el archivo (is_test_account, is_trailblazer, deleted_at, timezone, tribe_os*_, subscription\__, lead\_\*...). El path anon principal (.from('sessions_public')) es untyped. 137:92-94 ya registró un near-miss por confiar en este archivo.
FIX: `supabase gen types typescript --linked --schema public > lib/database.types.ts` (funciona sin Docker, verificado hoy) + header con fecha + check de CI que compare con un regen.
ACEPTACIÓN: tsc verde tras regenerar; CI falla si el archivo tiene >30 días o difiere del regen.

### [DB-05] Migración 148 asume la columna total_sessions_hosted (sin ADD COLUMN) y el cron diario de recompute nunca se creó

- **Área:** Infra · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Migración (aditiva)
- **Journey / lado:** Storefront: 'Sesiones dirigidas'
- **Ruta/Archivo:** `supabase/migrations/148_total_sessions_hosted_counter.sql:4-6,98-106,140-151; vercel.json`

**Descripción**

VERIFICADO: 148:4-6 declara que la columna "existe en producción (untracked)" y no contiene ningún ALTER TABLE ADD COLUMN; 148:140-147 dice que el job diario recompute_all_total_sessions_hosted() "is NOT created" y vercel.json no lo tiene. En vivo la columna existe (gen types) y la función recompute_all_total_sessions_hosted también.
IMPACTO: un rebuild desde cero falla en 148; en prod el contador subcuenta por cada sesión cuya fecha cruzó medianoche desde la última escritura del creador (alimenta el trust bar del storefront, el orden de destacados y el gate .gte(...,5) del spotlight).
FIX: migración 156 con ADD COLUMN IF NOT EXISTS antes de los objetos de 148 + ruta /api/cron/recompute-hosted-counts en vercel.json a las 02:00.
ACEPTACIÓN: rebuild local pasa 148; el contador de un instructor con una sesión de ayer sube sin que él edite nada.

### [DB-06] supabase/schema.sql está 9 meses desactualizado y reinstala el trigger que causó current_participants = -1

- **Área:** Infra · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Infra / onboarding de devs
- **Ruta/Archivo:** `supabase/schema.sql:14,115-135; supabase/migrations/109_fix_participant_count_drift.sql:19-21; CLAUDE.md:84`
- **Notion:** actualiza la fila existente «Disciplina de migraciones / drift de esquema»

**Descripción**

VERIFICADO: último commit d9e938c (2025-12-22). Declara users.rating (:14, reemplazado por average*rating y nunca dropeado), update_session_participant_count() (:115-129) y el trigger update_participant_count (:132-135) que 109:19-21 identifica como la causa exacta del -1 y dropea. Sin header de advertencia; CLAUDE.md:84 lo señala como "core tables". Predata gym tenancy (068+), el split de PII (096/097) y todo el hardening RLS.
Relacionado (mismo ticket del board "Disciplina de migraciones"): 23 archivos legacy sin numerar (add*_.sql, create\__.sql, fix*\*.sql) ordenan lexicalmente DESPUÉS de 155 y no tienen registro de aplicado; add_reviews.sql (que agrega users.average_rating) se aplicaría después de 114/138 que ya la leen; 141*\*.REHEARSAL.sql vive suelto en supabase/ (no en rehearsals/); VERIFIER_FLOOR=60 deja 009-059 sin probe (incluye 041, 042, 047, 054).
FIX: borrar schema.sql o header "SNAPSHOT 2025-12-22, NOT SOURCE OF TRUTH" y quitar el trigger/rating; manifest LEGACY_APPLIED.md para los 23 legacy; mover el REHEARSAL; probes selectivos sub-060.
ACEPTACIÓN: nadie puede aplicar schema.sql por accidente; cada legacy tiene estado documentado.

### [NOT-04] Tokens de push por dispositivo: hoy es una columna en users (segundo dispositivo sobrescribe, logout borra todos)

- **Área:** Infra · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Nativo (cap sync + reenvío) · **Riesgo:** Migración + backfill; dual-write una release
- **Journey / lado:** Push multi-dispositivo
- **Ruta/Archivo:** `supabase/migrations/add_fcm_token_columns.sql:2-4; add_push_subscription.sql:3; lib/firebase-messaging.ts:86-90,163-167; lib/database.types.ts:528`
- **Notion:** actualiza la fila existente «Un solo token FCM por usuario — el segundo dispositivo sobrescribe el primero»

**Descripción**

CONFIRMADO EN VIVO: users.fcm_token y users.push_subscription son columnas únicas por usuario; la tabla push_subscriptions tiene UNIQUE(user_id) (índice push_subscriptions_user_id_key) y solo la lee la Edge Function archivada. lib/firebase-messaging.ts:86-90 hace UPDATE users SET fcm_token keyed por id: el segundo dispositivo sobrescribe; removeFcmToken al logout (:163-167) anula el token para TODOS los dispositivos.
FIX: device_tokens(user_id, token, platform, updated_at) UNIQUE(token), upsert onConflict token, fan-out en notifications/send y en el webhook de chat; dual-write una release.
ACEPTACIÓN: teléfono + tablet reciben ambos; logout en uno no apaga el otro.

### [NOT-07] Idempotencia del push: sin dedupe key en notifications/send ni en el webhook de chat (retries duplican)

- **Área:** Infra · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Migración (tabla ledger)
- **Journey / lado:** Notificaciones
- **Ruta/Archivo:** `app/api/notifications/send/route.ts; app/api/webhook/chat-message/route.ts; app/api/cron/behavioral-nudges/route.ts:118-128; supabase/migrations/111:162`

**Descripción**

QUÉ PASA (T2-3 Missing): no hay clave de dedupe, hash ni ledger en el path de push. Un retry de Vercel, una re-entrega de net.http_post o dos corridas solapadas de cron producen notificaciones duplicadas. behavioral-nudges muestra el patrón correcto (insertar en nudge_log primero, skip on conflict :118-128).
FIX: dedupe_key opcional + tabla push_deliveries(dedupe_key UNIQUE, user_id, sent_at) con TTL corto; el webhook de chat keyea por record.id que el trigger ya envía (111:162).
ACEPTACIÓN: dos POST idénticos con la misma dedupe_key producen un solo push.

### [PERF-06] Smoke E2E de fallo de auth/offline en CI (Playwright no corre en CI; app/os/\*\* sin tests)

- **Área:** Infra · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** CI
- **Ruta/Archivo:** `.github/workflows/ci.yml; e2e/smoke.spec.ts; e2e/authenticated.spec.ts.disabled; vitest.config.ts`

**Descripción**

VERIFICADO: Vitest con 123 archivos de test (lib/dal 37, lib 20, app/auth 5, components 4); app/os/** (15 rutas) tiene CERO tests. CI corre lint (--max-warnings 1850), tsc, vitest, build y presupuesto de bundle 7600 KB: sólido. Pero `playwright test` NO está en CI (solo script local); e2e/ tiene smoke.spec.ts y un .disabled. Ninguno de los spinners (PERF-01), crashes (PERF-02) ni fake-success (PERF-04) es visible para tsc/vitest.
FIX: proyecto Playwright que intercepte **/auth/v1/user con route.abort() y afirme que cada ruta top muestra reintentar; job no bloqueante primero. 85 de 556 archivos superan 300 líneas (26 superan 500; top: os/clients/[id] 1356, my-coach 1242, promote/boosts 1022) y quedan 42 toLocaleDateString + 39 `new Date(x+'T00:00:00')` fuera de formatSessionDate.
ACEPTACIÓN: job e2e en CI verde; presupuesto de líneas por archivo en lint.

### [SEC-06] Las llamadas servidor-a-servidor a /api/notify-admin-signup y /api/admin/notify mueren en middleware (sin cookie -> redirect a /auth)

- **Área:** Infra · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Admin: señal de signups y bug reports
- **Ruta/Archivo:** `app/api/auth/signup/route.ts:98-118; app/feedback/useFeedback.ts:168-179; middleware.ts:62-95,199-203; app/api/admin/notify/route.ts:20`

**Descripción**

VERIFICADO: ninguna de las dos rutas está en publicApiPaths. (1) signup/route.ts:98-102 hace fetch server-side a /api/notify-admin-signup/ sin cookie -> middleware redirige a /auth y el POST se pierde: el email de "nuevo signup" NUNCA se envía para signups por email. (2) :106-118 igual para /api/admin/notify/ (aunque manda x-admin-notify-secret): sin badge de campana para admins. (3) app/feedback/useFeedback.ts:168-176 llama /api/admin/notify desde el navegador SIN el secret -> pasa middleware y falla el check fail-closed en :20: las notificaciones de bug report nunca dispararon. Los tres están tragados por .catch(). Solo el camino OAuth funciona (lib/auth-helpers.ts:62-71 corre en el navegador con cookie). Como efecto, el escapado HTML de notify-admin-signup (:21-28) protege un camino muerto.
FIX: extraer el fan-out a una función de servidor y llamarla en proceso desde signup y desde una ruta /api/feedback; si las rutas quedan, agregarlas a publicApiPaths (ambas fail-closed por secreto).
ACEPTACIÓN: un signup por email genera email al admin + campana; un bug report genera campana.

### [SEC-07] Capturar en migraciones las policies de 4 buckets sin ninguna policy en el repo (profile-images, session-photos, session-stories, instructor-posts)

- **Área:** Infra · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Migración (captura, idempotente)
- **Journey / lado:** Uploads / todos
- **Ruta/Archivo:** `app/profile/useProfile.ts:130-132; app/profile/edit/useEditProfile.ts:252,311; components/PostSessionFlow.tsx:265; components/StoryUpload.tsx:159; components/dashboard/PostComposer.tsx:173; supabase/migrations/add_session_stories.sql:42-46`

**Descripción**

QUÉ PASA: grep storage.objects en migraciones solo cubre product-images/digital-products (013), community-banners (026/038/090), community-bulletin-flyers (040), storefront-banners (057), media (091/145/146). profile-images, session-photos, session-stories e instructor-posts se escriben desde la app y NO tienen policy en el repo (add_session_stories.sql:42-46 las tiene comentadas). Sus ACLs reales viven solo en el dashboard: no revisables, no reconstruibles, invisibles al verifier. Buckets públicos confirmados: product-images, community-bulletin-flyers, community-banners, media; digital-products privado y gateado (products/download/[orderId]:44-45). Nota: profile-images no admite el idioma (storage.foldername(name))[1]=auth.uid() porque el primer segmento es el literal `avatars` (useProfile.ts:130-131).
FIX: migración de captura (patrón 146) + revisión + probes en el verifier; límites file_size_limit/allowed_mime_types en cada bucket (hoy solo media los tiene).
ACEPTACIÓN: cada bucket escrito por la app tiene sus policies en supabase/migrations y un probe.

### [SEC-10] Reemplazar el origen https://tribe-v3.vercel.app hardcodeado en los triggers que llevan secretos de Vault

- **Área:** Infra · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Migración
- **Journey / lado:** Chat push / dominio custom
- **Ruta/Archivo:** `supabase/migrations/111_async_http_and_externalize_secrets.sql:132-137,151-158; 136_retire_edge_function_push_triggers.sql:14`
- **Notion:** actualiza la fila existente «chat_message_webhook hardcodea https://tribe-v3.vercel.app»

**Descripción**

CONFIRMADO con matiz: 111:153 POSTea a un literal https://tribe-v3.vercel.app/api/webhook/chat-message/ y 111:134 a .../api/push/send (ruta que no existe; 136:14 lo registra). El secreto NO está embebido: se lee de vault.decrypted_secrets (:151). Si el dominio Vercel se retira o reasigna (lib/email/tribeOsBetaWelcome.ts:237 ya anticipa dominio custom), esos triggers envían secretos vivos a quien tenga el host, y el push de chat muere el día que aterrice el dominio custom. El mismo literal es fallback benigno en ~15 archivos de app (app/s/[id]/page.tsx:6, etc.).
FIX: guardar la base URL como secreto de Vault y leerla en el cuerpo del trigger; env NEXT_PUBLIC_APP_URL en Vercel para los fallbacks.
ACEPTACIÓN: cambiar el dominio no requiere migración; verifier comprueba que el trigger no contiene 'vercel.app'.

### [DB-04] Columnas de coordenadas duplicadas en sessions (latitude/longitude + location_lat/location_lng): confirmado en vivo; el trigger 054 está bajo el piso del verifier

- **Área:** Infra · **Prioridad:** Baja · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Migración (drop de columnas: destructivo si algo aún lee el par viejo)
- **Journey / lado:** Sesiones / mapa
- **Ruta/Archivo:** `supabase/migrations/054_sessions_coord_sync_trigger.sql:3,21-48; app/create/page.tsx:283-284; app/session/[id]/edit/useEditSession.ts:163-164; lib/dal/sessions.ts:92,113,133,176,268,597-600; 138_rls_h4_gate1_sessions_public_view.sql:70-73`
- **Notion:** actualiza la fila existente «Columnas de coordenadas duplicadas en sessions»

**Descripción**

VERIFICADO EN VIVO: sessions tiene las 4 columnas. latitude/longitude no tienen DDL creador en el repo (primera mención: 054:3 "the sessions table has both … from earlier overlapping schemas"). Crear escribe location_lat/lng (create/page.tsx:283-284); editar lee/escribe latitude/longitude (useEditSession.ts:163-164, sessions.ts:597-600); el DAL selecciona los 4; sessions_public expone los 4 redondeados (138:70-73). El trigger sessions_sync_coords (054:21-48) los mantiene en sincronía PERO 054 está bajo VERIFIER_FLOOR=60, así que no hay prueba repo-side de que esté aplicado (docs/DRIFT_AUDIT lo listó como live-only, lo cual es incorrecto: sí está en el repo).
FIX: elegir un par (location_lat/lng), migrar lectores/escritores, agregar probe del trigger al verifier, y solo después dropear el par viejo.
ACEPTACIÓN: un solo par de columnas en código; verifier prueba sessions_sync_coords hasta el drop.

### [DB-07] Índice único bajo el check-then-insert del cron de sesiones recurrentes + fecha en hora Bogotá

- **Área:** Infra · **Prioridad:** Baja · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Migración (dedupe previo)
- **Journey / lado:** Instructor: series recurrentes
- **Ruta/Archivo:** `app/api/cron/recurring-sessions/route.ts:106,125; lib/dal/sessions.ts:1048-1052; lib/recurrence.ts:39,184`

**Descripción**

QUÉ PASA: childSessionExists (:1048) luego createChildSession (:125) sin constraint único en (recurring_parent_id, date) en ninguna migración: dos corridas solapadas o un retry tras timeout duplican la ocurrencia. lib/recurrence.ts:39 toISODate usa getFullYear/getMonth/getDate (zona del runtime = UTC en Vercel) y :184 parsea parent.date+'T00:00:00' local: el mismo skew UTC/Bogotá que bogotaDate.ts eliminó en otros lados (T2-2 parcialmente arreglado).
FIX: CREATE UNIQUE INDEX CONCURRENTLY ON sessions(recurring_parent_id, date) WHERE recurring_parent_id IS NOT NULL (dedupe antes) y pasar recurrence.ts por bogotaDateOffset.
ACEPTACIÓN: dos invocaciones concurrentes del cron generan una sola hija; una serie de lunes no salta a domingo en UTC-5.

### [MED-02] Fuga de storage sigue en 7 paths (avatar, foto, banner de perfil/onboarding, banner de comunidad) + profile-images sin límites

- **Área:** Infra · **Prioridad:** Baja · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Coordinar con SEC-04 (keys estables + INSERT sin owner = sobrescribible)
- **Journey / lado:** Uploads
- **Ruta/Archivo:** `app/profile/edit/useEditProfile.ts:209,249,252,310; app/profile/useProfile.ts:129,179; app/onboarding/instructor/page.tsx:262,294; app/communities/[id]/page.tsx:207; components/dashboard/StorefrontEditor.tsx:64; components/dashboard/VideoUploadSection.tsx:67,103`
- **Notion:** actualiza la fila existente «Fuga de storage: cada cambio de portada deja huérfano el archivo anterior»

**Descripción**

ACTUALIZACIÓN: el banner y el video del Storefront Editor YA usan path estable + upsert (+ remove del video): esa parte está hecha. Siguen filtrando 7 sitios con keys `…-${Date.now()}` y sin remove del anterior (solo hay 3 .remove() en todo el repo): useEditProfile.ts:209 avatar, :249 foto, :310 banner; useProfile.ts:129,179; onboarding/instructor:262,294; communities/[id]:207. Además useEditProfile.ts:252 sube el File crudo sin compresión ni límite, y profile-images no tiene file_size_limit ni allowed_mime_types (solo media los tiene, 145/146).
FIX: patrón StorefrontEditor (key estable por usuario + upsert + contentType), límites por bucket, sweep único de huérfanos. CUIDADO: keys estables sin policy owner-scoped amplían T-SEC4-B (SEC-04); hacer ambos juntos.
ACEPTACIÓN: reemplazar avatar 5 veces deja 1 objeto; profile-images rechaza >5 MB y tipos no permitidos.

### [NOT-08] Confirmar la migración 136 en vivo y retirar la Edge Function archivada + secreto push_send_bearer

- **Área:** Infra · **Prioridad:** Baja · **Estado:** Por verificar
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Infra push
- **Ruta/Archivo:** `supabase/migrations/136_retire_edge_function_push_triggers.sql:33-35,95-103; supabase/verify-migration-state.sql:616-625; supabase/functions/send-push-notification/index.ts:1-6; supabase/migrations/111:132`
- **Notion:** actualiza la fila existente «Retirar triggers legacy de notificaciones»

**Descripción**

VERIFICADO (repo): 111 ya convirtió los 3 triggers a net.http_post fire-and-forget (sin HTTP sincrónico en la transacción de join: "sync HTTP in join txn" está RESUELTO en el repo). Los triggers legacy POSTean SIN header Authorization (111:65,92), así que la Edge Function los rechaza: hoy hay entrega única por ACCIDENTE, no por diseño; 136 convierte accidente en intención dropeando los 4 triggers y manteniendo chat_message_webhook. El verifier :616-625 tiene el probe pero no registra resultado; supabase/functions/send-push-notification sigue siendo la única función y dice "RETIRED DO NOT DEPLOY"; el secreto push_send_bearer (111:132) sigue referenciado.
VERIFICAR: correr verify-migration-state.sql:616 en el SQL editor. Si applied: borrar la función en Supabase, dropear push_send_bearer, quitar el directorio. Mantener chat_webhook_secret y VAPID.
ACEPTACIÓN: `select to_regprocedure('notify_join_request()')` es NULL en vivo; supabase/functions/ vacío.

---

## Área: Fix rápido (19)

### [NOT-02] Corregir el parse de la ventana horaria en ambos crons de recordatorio (UTC vs Bogotá: 5 horas de corrimiento)

- **Área:** Fix rápido · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Recordatorios
- **Ruta/Archivo:** `app/api/cron/reminders/route.ts:73-74,87; app/api/cron/session-reminders/route.ts:63,75,87; lib/time/bogotaDate.ts`

**Descripción**

QUÉ PASA: el filtro de FECHA sí usa bogotaToday/bogotaDateOffset (T0-9 arreglado), pero la comparación de VENTANA hace `new Date(`${session.date}T${session.start_time}`)` sin offset (:87 en ambos), parseado en la zona del runtime (UTC en Vercel) mientras el valor es Bogotá-local. Las ventanas 1h/15min/2h se comparan contra un timestamp 5 horas corrido: nada cae en ventana en el momento correcto. Hoy es moot solo porque ningún cron está programado (NOT-01).
FIX: `bogotaDateTime(date, time)` en lib/time/bogotaDate.ts que agregue -05:00; test con una sesión a las 19:00 Bogotá.
ACEPTACIÓN: test unitario: sesión 19:00 COT, cron a 18:00 COT -> en ventana de 1h.

### [PERF-01] Spinner infinito: 36 sitios siguen sin guard tras e2dcce9 (29 de página completa, incl. Home y los 14 /os/\*); extraer un helper resolveViewer()

- **Área:** Fix rápido · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Todas / arranque en red inestable
- **Ruta/Archivo:** `app/useHomeFeed.ts:277-279; app/page.tsx:73; hooks/useTribeOSPremiumGate.ts:57; app/os/dashboard/page.tsx:182; app/my-coach/page.tsx:322; app/admin/page.tsx:55; app/feed/page.tsx:127; app/my-training/page.tsx:56; app/notifications/useNotifications.ts:29-40; app/session/[id]/edit/useEditSession.ts:126; app/requests/page.tsx:68; components/NotificationBell.tsx:32; components/TribeOSQuickAccess.tsx:47`
- **Notion:** actualiza la fila existente «Spinner infinito en 39 sitios restantes: guardar auth.getUser dentro del try»

**Descripción**

INVENTARIO RE-HECHO (main@613eddf): 101 llamadas reales a auth.getUser() en app/ (no API) + components/ + hooks/; 41 dentro de try; 60 fuera; de esas, 36 en un path de montaje donde el flag de carga solo se limpia en el branch de éxito -> spinner pegado. e2dcce9 tocó exactamente 3 archivos (useSessionsData, useMessages, useMatches). Los peores: app/useHomeFeed.ts:277 (gatea TODA la Home vía page.tsx:73), hooks/useTribeOSPremiumGate.ts:57 (gatea 14 rutas /os/_), os/dashboard:182, my-coach:322, admin (4), dashboard/instructor:126, feed:127, my-training:56, onboarding/role:60 (.then sin .catch), requests:68, session/[id]/edit:126, settings/_, training-partners:56, tribe-plus:40; + 7 de sección (FindTrainingPartners, InviteToSessionSheet, NotificationBell, AdminQuickAccess, TribeOSQuickAccess, TribeOSEntryCard, TribeOSSection). Caso aparte: /notifications (useNotifications.ts:29-30 retorna en !user con loading=true y sin redirect: un anónimo que sigue un push queda girando para siempre). getUser re-lanza errores no-AuthError (TypeError de red), así que es real, no teórico. Lista completa por archivo:línea en el reporte J §1.
FIX: helper resolveViewer(supabase) -> {user, failed} que nunca lanza + finally que limpie el gate; migrar por lotes de ~6 rutas empezando por useHomeFeed y useTribeOSPremiumGate; patrón de test de app/matches/useMatches.authFailure.test.ts.
ACEPTACIÓN: con \*\*/auth/v1/user abortado, cada ruta top muestra un botón Reintentar, nunca un spinner; 0 llamadas a auth.getUser fuera del helper (lint).

### [PERF-02] Tipar users.name como string|null en el DAL y centralizar getInitials: 5 superficies más crashean con .split(' ') (2 en Home)

- **Área:** Fix rápido · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Home / conexiones / invitar
- **Ruta/Archivo:** `lib/database.types.ts:1462; lib/dal/connections.ts:18,25,37; components/TrainingPartnerCard.tsx:19; app/connections/page.tsx:309,388; components/InviteToSessionSheet.tsx:89; components/PostSessionConnect.tsx:127; app/os/clients/[id]/page.tsx:587; app/os/members/page.tsx:536; app/os/teams/[id]/page.tsx:562; components/InstructorCard.tsx:26-34`
- **Notion:** actualiza la fila existente «Crash en /messages: conv.other_user.name.split(' ') sin guard»

**Descripción**

ACTUALIZACIÓN: el crash de /messages YA está arreglado (page.tsx:258,275 con `|| 'Unknown'` y lib/dal/conversations.ts:103-104). Pero la causa raíz sigue: database.types.ts:1462 dice `name: string | null` y las interfaces del DAL mienten (`name: string`, connections.ts:18,25,37). Sin guard: TrainingPartnerCard.tsx:19 (se renderiza en la HOME vía FindTrainingPartners), connections:309,388, InviteToSessionSheet:89, PostSessionConnect:127, os/clients/[id]:587, os/members:536, os/teams/[id]:562, AtRiskClientsWidget:230, CelebrateWinsWidget:179. También .toFixed() sobre average_rating (number|null): FeaturedInstructorCarousel:141, ReviewsList:195, PartnerPerformance:18, InstructorShareClient:168. JSON.parse dentro del DAL sin try en lib/dal/doorCheckin.ts:13 y lib/dal/waitlist.ts:237 (escapa el contrato DalResult).
FIX: cambiar los tipos del DAL a string|null, dejar que tsc (bloqueante en CI) enumere call sites, un getInitials(name: string|null) copiando InstructorCard.tsx:26-34.
ACEPTACIÓN: tsc verde con los tipos honestos; test con name=null en TrainingPartnerCard.

### [INS-07] 'Atletas entrenados' del dashboard de instructor es siempre 0 (lee session_participants bloqueada por RLS)

- **Área:** Fix rápido · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Instructor: analytics
- **Ruta/Archivo:** `lib/dal/instructorDashboard.ts:132-142,149-151; lib/dal/users.ts:37`

**Descripción**

QUÉ PASA: fetchInstructorStats consulta session_participants desde el cliente (:132-142); sp_select_own (129) devuelve solo filas del caller, así que uniqueUsers siempre es vacío. El mismo archivo recomputa averageRating por cuarta vez en :149-151.
FIX: leer users.total_participants_served (ya mantenido y seleccionado en lib/dal/users.ts:37); usar la columna average_rating del trigger.
ACEPTACIÓN: el tab Analytics muestra el número real; un solo origen para el promedio.

### [NAT-03] /download: la librería QR se carga desde cdnjs, que el CSP bloquea; el QR de escritorio nunca renderiza (la detección de SO SÍ está bien)

- **Área:** Fix rápido · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Funnel: escritorio -> teléfono
- **Ruta/Archivo:** `public/download/index.html:127,148-176,232-245; middleware.ts:118-127,165`
- **Notion:** actualiza la fila existente «/download muestra Google Play como botón primario en iPhone»

**Descripción**

ACTUALIZACIÓN del ticket: la detección de SO YA ESTÁ CORRECTA en main (index.html:148-150 detecta iOS incl. iPadOS; :167-176 promueve App Store a primario y reordena con insertBefore); marcar esa parte como hecha. El bug real: :127 carga qrcodejs desde cdnjs.cloudflare.com; middleware.ts:118-127 permite script-src 'self', posthog, vercel.live, unpkg.com, maps.googleapis.com, NO cdnjs; /download no tiene extensión así que no pasa el short-circuit :165 y recibe el CSP. `typeof QRCode === "undefined"` (:236) retorna en silencio y el catch :245 garantiza que no hay error visible. El puente "escanea para seguir en el teléfono" está muerto en producción. Además nada en el producto enlaza a /download y utm\_\* solo se consume (:135-141), nunca se produce.
FIX: vendorizar qrcode.min.js en public/ (cubierto por 'self') o mover a unpkg.
ACEPTACIÓN: en escritorio /download muestra el QR; test de CSP en CI que liste hosts de script.

### [NAV-04] Arreglar dos enlaces muertos: comentarios de post de comunidad y resultado de sesión en /search

- **Área:** Fix rápido · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Comunidad / búsqueda
- **Ruta/Archivo:** `app/communities/[id]/page.tsx:571; app/search/page.tsx:274`

**Descripción**

QUÉ PASA: (1) app/communities/[id]/page.tsx:571 enlaza a `/communities/${id}/post/${post.id}/comments`, ruta que no existe (solo existe /communities/[id]/post, que es el formulario de crear). Es el botón de conteo de comentarios de CADA post de comunidad: la afordancia principal de engagement da 404. (2) app/search/page.tsx:274 enlaza a `/sessions/${id}` (no existe); lo correcto es `/session/${id}`. Hoy el impacto es bajo solo porque /search está huérfana; en cuanto se enlace, cada resultado de sesión será un 404.
Los enlaces muertos previamente reportados (/auth/login, /dashboard, /settings/subscription) YA NO EXISTEN en el código.
FIX: crear la vista de detalle de post (o abrir el post completo con comentarios) y corregir el prefijo en /search.
ACEPTACIÓN: `grep` de todos los href/push contra la lista de rutas no devuelve destinos inexistentes; test unitario del builder de rutas.

### [NAV-07] Conectar o borrar 3 parámetros de hand-off que el destino nunca lee (?wizard=1, context=package, externalEventId)

- **Área:** Fix rápido · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Atleta->instructor; paquetes; eventos externos
- **Ruta/Archivo:** `components/InstructorUpsellBanner.tsx:78; app/profile/edit/page.tsx:39; components/storefront/StorefrontPackageCard.tsx:47; components/ExternalEventCard.tsx:139; app/create/page.tsx:118-122`

**Descripción**

QUÉ PASA: (1) InstructorUpsellBanner.tsx:78 manda a `/profile/edit?wizard=1` pero app/profile/edit/page.tsx nunca usa useSearchParams; `wizardStep` es useState(0) en :39. El CTA de conversión atleta->instructor aterriza en el formulario plano, no en el wizard de 3 pasos (:325-327). (2) StorefrontPackageCard.tsx:47 manda a `/messages?to=X&context=package:Y`; app/messages/page.tsx:22 lee solo user/to. El instructor recibe un DM sin saber qué paquete lo originó. (3) ExternalEventCard.tsx:139 manda `externalEventId` a /create; app/create/page.tsx:118-122 lee sport|title|location|lat|lng y descarta el vínculo al evento.
FIX: leer `wizard` y sembrar wizardStep=1 (o apuntar el CTA a /onboarding/role); prellenar el primer mensaje con el contexto del paquete; persistir external_event_id.
ACEPTACIÓN: cada parámetro tiene un lector o se elimina del emisor.

### [NOT-06] Chequear res.ok antes de marcar 'enviado' en engagement, daily-motivation y reminders (un 500 quema el slot semanal)

- **Área:** Fix rápido · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Retención
- **Ruta/Archivo:** `app/api/cron/engagement/route.ts:151-166,235-249; app/api/cron/daily-motivation/route.ts:66-78; app/api/cron/reminders/route.ts:229-245; app/api/notifications/send/route.ts:88`

**Descripción**

QUÉ PASA (T2-4 parcial): reminders:174-176 y session-reminders:186 ya chequean res.ok; engagement:163 (last_weekly_recap_sent), engagement:249 (last_reengagement_sent), daily-motivation:78 y reminders:241 (motivación) hacen await fetch y estampan incondicionalmente. Un 500/404 consume el slot del usuario. Ojo: los senders gateados devuelven 200 {suppressed:true} (:88): tratar suprimido-por-preferencia como hecho y non-2xx como reintentar.
ACEPTACIÓN: test: send devuelve 500 -> el flag no cambia.

### [PAY-05] Esconder StripeConnectBanner en /os/revenue tras NEXT_PUBLIC_ENABLE_STRIPE_PAYOUTS (Connect es un callejón sin salida US-only)

- **Área:** Fix rápido · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Instructor Tribe.OS: revenue
- **Ruta/Archivo:** `components/tribe-os/StripeConnectBanner.tsx; app/os/revenue/page.tsx:128; app/earnings/payout-settings/page.tsx:24-30; app/api/stripe/connect/onboard/route.ts:81; lib/payments/stripe.ts:212`

**Descripción**

VERIFICADO: onboarding crea la cuenta Connect con country 'US' hardcodeado (:81, default :212); payout-settings esconde Connect tras NEXT_PUBLIC_ENABLE_STRIPE_PAYOUTS (:24-30). Pero StripeConnectBanner (renderizado en /os/revenue:128) no tiene ese check y manda a coaches colombianos directo al callejón. Las tarjetas de revenue (SummaryCards.tsx:90, RevenueChart.tsx:80, PaymentTable.tsx:236) muestran fee_cents = 0 como "-$0", implicando un régimen de fee que no existe (el spec :13-14 aprobó esconderlas).
FIX: mismo flag en el banner; esconder filas fee/net mientras el kill switch esté off.
ACEPTACIÓN: /os/revenue sin banner de Stripe ni fila de fee para un coach colombiano.

### [PERF-04] Dejar de renderizar fallos del DAL como estados vacíos exitosos (10 sitios; el peor: /requests muestra 'sin solicitudes' cuando falla la lectura)

- **Área:** Fix rápido · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Host aprueba / home / chat / comunidad
- **Notion:** actualiza la fila existente «Calidad de la app / manejo de errores»
- **Ruta/Archivo:** `app/requests/page.tsx:85,93,101; app/useHomeFeed.ts:289-301; app/messages/[conversationId]/page.tsx:203; app/communities/[id]/page.tsx:143,148; app/challenges/[id]/page.tsx:119; app/session/[id]/chat/page.tsx:67; components/ConnectionButton.tsx:76; app/profile/useProfile.ts:100-103`

**Descripción**

QUÉ PASA (clase "swallowed failure = fake success", 4 instancias ya encontradas en un día según la memoria del proyecto): 19 call sites leen .data sin chequear .success. Los de cara al usuario: requests:85,93 (un fallo RLS/red muestra "no pending requests" y el host nunca aprueba a nadie), useHomeFeed:289 (perfil fallido = "sin perfil" -> banner de completar) y :300 (get_my_location fallido = "sin ubicación" -> nudge), messages/[id]:203 (hilo vacío), communities/[id]:143,148, challenges/[id]:119 (re-ofrece Join), chat:67, ConnectionButton:76 (fallo renderiza "Connect" a un ya-conectado e invita a un write duplicado). 38 catch vacíos, 6 sin justificar (useSessionDetail:277, useChatMessages:116, InstructorPostCard:151, os/intelligence:298, useQuickGuide:93, useLiveStatus:81).
FIX: forma `res.success ? (res.data ?? d) : d` + estado de error (ya usada en useProfile:100-103); regla ESLint no-restricted-syntax para `\w+Result\.data \|\|`.
ACEPTACIÓN: cada sitio listado muestra error + reintentar cuando .success=false; la regla de lint está activa.

### [ATL-08] Ocultar 'Unirse como invitado' en sesiones curadas/invite-only y traducir el error invite_required

- **Área:** Fix rápido · **Prioridad:** Baja · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Invitado sin cuenta
- **Ruta/Archivo:** `app/session/[id]/ActionButtons.tsx:97; supabase/migrations/120:74-79; hooks/sessionActionTypes.ts:47,58`

**Descripción**

QUÉ PASA: para un visitante sin cuenta el botón es siempre "Join as guest" (ActionButtons.tsx:97) sin mirar join_policy. En una sesión curada llena nombre y teléfono y el RPC devuelve `invite_required` (120:74-79), código que NO tiene entrada en getJoinErrorMessages -> "Could not join session" genérico. Callejón sin salida.
FIX: mostrar el CTA de guest solo con join_policy='open'; en curada "Inicia sesión para solicitar cupo"; agregar invite_required a ambos idiomas.
ACEPTACIÓN: visitante anónimo en sesión curada ve el CTA correcto; el error tiene texto ES/EN.

### [ATL-09] Anclar la expiración del invite acuñado desde la app (API route) a la sesión, como ya hace el share link (D9)

- **Área:** Fix rápido · **Prioridad:** Baja · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Atleta: invitar a sesión
- **Ruta/Archivo:** `app/api/invites/session/route.ts:104-113; supabase/migrations/143_d9_invite_expiry_session_anchored.sql:98-204`
- **Notion:** actualiza la fila existente «D9 — anclar expiración del token de invitación a la sesión (inicio + 3h)»

**Descripción**

VERIFICADO PARCIAL: el share link (create_session_invite) YA está anclado a la sesión por la migración 143 (:98-204). El mint "invitar a este atleta" desde la app (app/api/invites/session/route.ts:104-113) sigue comentando "expires_at is left to the DB default (created_at + 7 days)". El header de 143 decía que esa ruta se actualizaría "in a later gate" que nunca llegó. Un invite a una sesión a >7 días expira antes de la sesión y el invitado ve "invite expired" (InviteClient.tsx:288).
FIX: llamar session_invite_expiry(session_id) (ya con grant a service_role, 143:167) y pasarlo a insertInviteToken.
ACEPTACIÓN: invite a sesión en 10 días sigue válido hasta inicio+3h.

### [ATL-10] Pasar el user recién resuelto a checkAttendance (hoy lee un `user` null y nunca marca wasMarkedAttended)

- **Área:** Fix rápido · **Prioridad:** Baja · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Atleta: fotos de recap
- **Ruta/Archivo:** `app/session/[id]/useSessionDetail.ts:213-227; app/session/[id]/page.tsx:185-187`

**Descripción**

QUÉ PASA: checkAttendance (:219-227) se llama desde :213 mientras `user` aún es null (lo setea checkUser concurrente en :80), retorna en `if (!user)` en cada primera carga y wasMarkedAttended queda false. Un atleta marcado como asistente nunca puede subir foto de recap (page.tsx:185) ni recibe el prompt (:187).
FIX: pasar authUser como ya hace loadSession para el roster (:151-156).
ACEPTACIÓN: atleta marcado asistente ve el CTA de recap en la primera carga.

### [BRAND-04] FeedbackWidget reporta appVersion 2.5.0 (binarios en 2.6.2) y el shortcut del manifest apunta a /my-sessions (308)

- **Área:** Fix rápido · **Prioridad:** Baja · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Beta feedback / PWA
- **Ruta/Archivo:** `app/layout.tsx:94; android/app/build.gradle:18; ios/App/App.xcodeproj/project.pbxproj:314; package.json:3; public/manifest.json; next.config.ts:21-25`

**Descripción**

QUÉ PASA: app/layout.tsx:94 hardcodea appVersion="2.5.0" mientras los binarios están en 2.6.2 (y package.json:3 en 0.1.0): cada reporte de beta se etiqueta con una versión que no existe desde mayo. manifest.json: shortcut "My Sessions" -> /my-sessions que next.config.ts:21-25 redirige 308 a /sessions; background_color #ffffff choca con la superficie charcoal.
FIX: una constante APP_VERSION (o package.json version real) leída por el widget y por el release script; shortcut a /sessions.
ACEPTACIÓN: el widget muestra la versión del build actual.

### [INS-09] instructor_since se reinicia en cada re-corrida del onboarding y reinicia el trial de boosts gratis

- **Área:** Fix rápido · **Prioridad:** Baja · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Fondos (menor)
- **Journey / lado:** Instructor: promote
- **Ruta/Archivo:** `app/onboarding/instructor/page.tsx:370; app/promote/boosts/page.tsx:391`

**Descripción**

QUÉ PASA: handleFinish escribe instructor_since: new Date() incondicionalmente (:370); boosts decide free vs paid con isFeatureFree(instructorSince) (:391). Reabrir /onboarding/instructor y pulsar Completar da otra ventana de boosts gratis indefinidamente.
FIX: setear instructor_since solo si es null.
ACEPTACIÓN: re-correr el wizard no cambia instructor_since.

### [INS-14] Banner del Storefront Editor: se sube antes de Guardar y no se replica a banner_url (perfil)

- **Área:** Fix rápido · **Prioridad:** Baja · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Instructor: storefront
- **Ruta/Archivo:** `components/dashboard/StorefrontEditor.tsx:78-101; app/onboarding/instructor/page.tsx:379-383`

**Descripción**

QUÉ PASA: el upload de banner escribe a storage ANTES de Guardar y solo actualiza estado local (:101): abandonar la página deja un objeto huérfano sin fila en DB. Además el editor NO dual-escribe banner_url (que usa /profile) como sí hace el wizard (:379-383): cambiar el banner en el editor actualiza el storefront pero no la página de perfil.
FIX: subir en Guardar (o limpiar en abandono) y escribir ambas columnas hasta unificarlas.
ACEPTACIÓN: cambiar banner en el editor se refleja en /profile y /storefront.

### [NAV-08] Montar o eliminar 5 componentes huérfanos que son el único enlace a rutas/crons vivos

- **Área:** Fix rápido · **Prioridad:** Baja · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Descubrimiento / matches / spotlight
- **Ruta/Archivo:** `components/SmartMatchBanner.tsx; components/SpotlightBanner.tsx; components/PostSessionPrompt.tsx; components/InviteIncentiveModal.tsx; components/TrainingNowModal.tsx`

**Descripción**

VERIFICADO (nadie los importa): SmartMatchBanner (único enlace a /matches; consumidor del cron smart-match), SpotlightBanner (consumidor del cron spotlight-rotation), PostSessionPrompt (tercer UI de reseñas, docs/ANALYTICS_FUNNELS.md:80 documenta un funnel que nunca dispara), InviteIncentiveModal (construye `/s/{id}/?invite=true`, param que /s ignora), TrainingNowModal (junto a la página huérfana /training-now es el único llamador de /api/notify-nearby).
IMPACTO: dos crons de vercel.json escriben datos que ningún componente renderiza; /matches es inalcanzable; superficie aparente inflada.
FIX: montar o borrar cada uno junto con su cron/ruta/API.
ACEPTACIÓN: cero componentes en components/ sin import; cada cron de vercel.json tiene un lector.

### [NAV-09] Filtrar sesiones pasadas antes de truncar a 20 en useSessionsData

- **Área:** Fix rápido · **Prioridad:** Baja · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Atleta/instructor: mis sesiones
- **Ruta/Archivo:** `app/sessions/useSessionsData.ts:139-144`

**Descripción**

QUÉ PASA: `pastHosted` se ordena, se corta con `.slice(0,20)` en :141 y DESPUÉS se filtra con isSessionPast en :144. El prefiltro de DB es `dateLte: today` (solo fecha), así que las sesiones de hoy que aún no terminan entran en el slice y luego se descartan: un host con 4 sesiones hoy ve 16 pasadas en vez de 20 y pierde silenciosamente las más antiguas.
FIX: filtrar, luego slice.
ACEPTACIÓN: test con 4 sesiones hoy + 25 pasadas devuelve 20 pasadas.

### [PERF-05] /search: lectura de follow inline con .single() (406 en 0 filas) en vez de isFollowing() del DAL

- **Área:** Fix rápido · **Prioridad:** Baja · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Búsqueda
- **Ruta/Archivo:** `app/search/page.tsx:302-307,320-340; lib/dal/promote.ts:189`
- **Notion:** actualiza la fila existente «app/search hace follow inline y bypassea el DAL»

**Descripción**

ACTUALIZACIÓN: la ESCRITURA ya pasa por followUser/unfollowUser con throw en !success (:325-340): hecho. Queda la LECTURA inline `.from('user_follows')…single()` (:302-307) que ignora error; .single() con 0 filas es un 406 de PostgREST, así que "no sigue" se infiere de un error. isFollowing() existe en promote.ts:189.
ACEPTACIÓN: sin .from('user_follows') en app/search.

---

## Área: Negocio (6)

### [BIZ-01] Server-render la landing: el HTML de `/` que reciben los crawlers es un splash con dos <img> (T-SEO1 / T-FUNNEL1)

- **Área:** Negocio · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Toca la resolución de auth en la puerta de entrada (ver el incidente CSP en middleware.ts:19-31)
- **Journey / lado:** Funnel orgánico / Instagram bio
- **Ruta/Archivo:** `app/page.tsx:2,76-86; app/useHomeFeed.ts:69; app/LandingPage.tsx:16-21; app/sitemap.ts:5-11; app/robots.ts:4-5; app/layout.tsx:64`
- **Notion:** actualiza la fila existente «T-SEO1: Hacer indexable el directorio público (server render, sitemap, metadata)»

**Descripción**

VERIFICADO: app/page.tsx es 'use client'; userChecked arranca en false (useHomeFeed.ts:69) y :76-86 devuelve SOLO el wordmark hasta resolver la sesión. Next prerenderiza el estado inicial, así que el HTML estático de `/` (prioridad 1 en sitemap.ts:6) no tiene titular, copy ni <a> a /for-instructors, /about, /faq. El sitemap lista 4 URLs estáticas (sin /s/[id], /i/[id], /instructors, /session/[id], sin entradas desde la DB). Cero JSON-LD, sin canonical/alternates/hreflang/metadataBase; <html lang="en"> fijo (layout.tsx:64) en una app es/en. Solo 7 de 95 páginas son Server Components.
FIX: `/` como Server Component que renderiza LandingPage estática y difiere el feed autenticado a un hijo cliente; sitemap dinámico con /i/[id] y /s/[id] públicos; JSON-LD Event/Person; lang por locale.
ACEPTACIÓN: `curl -s https://<dominio>/` contiene el H1 y los enlaces; sitemap incluye instructores públicos; Lighthouse SEO ≥ 90.

### [BIZ-02] Emitir utm\_\* en cada share/QR (la atribución es solo-consumo: todo instala como 'direct')

- **Área:** Negocio · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Funnel Instagram / QR / WhatsApp
- **Ruta/Archivo:** `lib/share.ts:57-70; public/download/index.html:135-141; lib/analytics.ts; components/marketing/MarketingLayout.tsx:204-206`

**Descripción**

VERIFICADO: /download lee utm\_\* y lo pasa al referrer de Play (:135-141) pero NADA produce URLs etiquetadas: getSessionShareUrl/getInstructorShareUrl/getInviteShareUrl (share.ts:57-67) emiten paths pelados; solo getReferralShareUrl lleva ?ref= (sin lector fuera de redención). share_link_created (6 sitios) y session_shared (5) no llevan canal. El footer no tiene link de Instagram a propósito (MarketingLayout.tsx:204-206 "hasta tener un handle real") aunque lib/email/tribeOsWaitlist.ts:24 ya usa @tribe.nevertrainalone. Nada en el producto enlaza a /download.
FIX: argumento source en los builders de share.ts que agregue utm_source/medium/campaign; leerlos una vez en PostHogProvider y register() como super-properties; mantenerlos fuera de /invite/[token] (privacidad del token).
ACEPTACIÓN: un signup desde un link de WhatsApp aparece en PostHog con utm_source=whatsapp.

### [BIZ-03] Analytics: Funnel 3 (ratings) nunca dispara porque vive en un componente muerto; 31 de 195 eventos declarados no se emiten (incl. payments y connections)

- **Área:** Negocio · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Medición
- **Ruta/Archivo:** `docs/ANALYTICS_FUNNELS.md:110-114,143-147; components/PostSessionPrompt.tsx:61,222,231; components/PostSessionFlow.tsx:136; lib/analytics.ts:62-236`

**Descripción**

VERIFICADO: rating*modal_shown/rating_submit_failed/rating_submitted están en PostSessionPrompt.tsx (importado por nadie); el UI real es PostSessionFlow.tsx:136 con CERO trackEvent. tribe_os_checkout_started y tribe_os_portal_opened están documentados como paso 2 del funnel de suscripción y no existen en ningún call site. Muertos (31): account_deleted, api_error, challenge*_, connection*accepted/rejected/requested, email_verified, filter_applied, instructor_onboarding*_, notification*received, payment_completed/failed/initiated, product_viewed, profile_completed, promo_code*_, session*boost_purchased, session_cancelled/completed/edited/left, streak_updated, tip*_, tribe*os*_. Tampoco existe un evento follow. Tres dashboards de PostHog leen vacío.
FIX: mover los rating\__ a PostSessionFlow, borrar PostSessionPrompt, agregar los tribe*os*\* en sus handlers, podar o emitir el resto, corregir el doc.
ACEPTACIÓN: test que afirme que cada EventName tiene ≥1 call site o está en una allowlist "deprecated".

### [BIZ-04] Rol de delegado de contenido: no existe; el único rol es users.is_admin y community_members.role es solo display

- **Área:** Negocio · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Auth; migración
- **Journey / lado:** Ops: Ana publica sin admin completo
- **Ruta/Archivo:** `supabase/migrations/043_lock_is_admin.sql; 112_users_private_fields.sql:13-16; 011_social_features.sql:107; app/admin/bulletin/page.tsx:56-62; app/communities/[id]/page.tsx:197,614-620; lib/dal/communities.ts`
- **Notion:** actualiza la fila existente «Rol de delegado de contenido para Ana (no admin completo)»

**Descripción**

VERIFICADO: grep de is_moderator/content_editor/delegate en migraciones = 0. Todo /admin/\* y /api/admin/data gatean por is_admin. community_members.role IN ('admin','moderator','member') (011:107) existe pero solo se renderiza como badge (:614-620) y para permisos dentro de la comunidad (:197); no hay UI ni DAL para promover (updateMemberRole no existe) y no alcanza al bulletin de Tribe ni a /feed. Cualquier usuario puede ENVIAR al bulletin (022:31-33); aprobar exige admin.
FIX mínimo (mínimo privilegio, validar primero con el flujo manual por WhatsApp como dice la nota): flag users.is_content_editor guardado por trigger (INS-02) + policy que permita aprobar bulletin y publicar instructor_posts "de Tribe" sin acceso a users/reports/delete.
ACEPTACIÓN: Ana aprueba un bulletin sin ver el tab de usuarios.

### [BIZ-05] Lectura semanal del embudo (descargas -> registros -> solicitudes -> follows): no existe; /admin muestra solo contadores brutos

- **Área:** Negocio · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Ops semanal
- **Ruta/Archivo:** `app/admin/useAdminData.ts:36-53; components/admin/AdminStats.tsx:52-78; app/api/cron/tribe-os/weekly-summary/route.ts:4; lib/analytics.ts`
- **Notion:** actualiza la fila existente «T-MKT6: Lectura semanal del embudo (descargas, registros, solicitudes, seguidores)»

**Descripción**

VERIFICADO: /admin renderiza totalUsers, activeUsers, activeSessions, sessionsThisWeek/Month, totalMessages, newUsersToday, completed/cancelled, averageParticipants, topSport, retentionPercent, totalCreated/Joined (useAdminData.ts:36-53); grep funnel|downloads|registrations en admin = 0. weekly-summary de Tribe.OS es por gym, no Tribe-wide. No hay evento follow en la taxonomía; descargas solo son medibles en las consolas de las tiendas.
FIX: cron semanal Tribe-wide (o tab en /admin) que calcule registros (users.created_at), solicitudes (session_participants pending por semana), follows (user_follows.created_at) y lo mande por email al admin; descargas manual desde App Store Connect/Play hasta tener utm (BIZ-02).
ACEPTACIÓN: lunes 8am el admin recibe 4 números con delta semanal.

### [PAY-04] Reconciliar el copy de marketing: 'keep 85%' / 'tarifa 15%' vs la realidad (los instructores reciben el 100%, Tribe no procesa pagos)

- **Área:** Negocio · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Instructor: landing / FAQ / payout settings
- **Ruta/Archivo:** `lib/payments/config.ts:6; components/marketing/landing/HowItWorksSection.tsx:52,101; components/marketing/landing/FAQPreviewSection.tsx:16,38; components/marketing/landing/ForInstructorsPreview.tsx:34,41,81; components/marketing/instructors/RevenueModel.tsx:14,33,47; components/partner/PartnerValueCards.tsx:28-29; app/faq/page.tsx:27-28; app/earnings/payout-settings/page.tsx:623-624; app/session/[id]/edit/translations.ts:44-45,100-101`
- **Notion:** actualiza la fila existente «La UI muestra una tarifa de plataforma del 10% que Tribe no cobra»

**Descripción**

ACTUALIZACIÓN: la tarifa en código es 15% (lib/payments/config.ts:6), no 10% (el único 10% es el descuento de invitación, InviteIncentiveModal.tsx:32,42, componente muerto). El desglose a nivel sesión YA se quitó (app/create/page.tsx:710-714, PriceSection.tsx:80-83, SessionDetails.tsx:231-235). Sigue en vivo el "keep 85%" en 5 superficies de marketing + FAQ, y payout-settings:623-624 dice literalmente "Tribe retains a 15% platform fee". Strings muertas platformFee en edit/translations.ts:44-45,100-101. messages/es.json:152 ya dice "Sin tarifas de reserva". Coincide con T-AUD7 del board (4 superficies dicen que Tribe maneja el dinero).
FIX: copy-only en los sitios listados; es decisión de Al (el spec :15-18 lo marca como suya), pero hoy la afirmación es falsa en la dirección desfavorable al instructor e implica que Tribe procesa pagos.
ACEPTACIÓN: cero ocurrencias de 85%/15%/retains en app/ y components/ salvo detrás del kill switch.
