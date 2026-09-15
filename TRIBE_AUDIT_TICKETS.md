# Tribe — Audit Tickets (2026-09-04)

Generated from a read-only audit of `tribe-v3` at `main` @ `613eddf` (migrations through 155) plus the live Supabase project `twyplulysepbeypqralz` (schema pulled 2026-09-04 via `supabase gen types --linked`, `supabase inspect db`, `supabase db lint --linked`). Companion files: `TRIBE_AUDIT_SUMMARY.md` (map, route table, top 10, themes) and `TRIBE_AUDIT_TICKETS.csv` (Notion import).

**104 tickets** (95 del audit original + 9 añadidos el 2026-09-12/13 desde T-GYM3 y T-GYM3b; ver la sección «Añadidos 2026-09-12» arriba de Flujo/Navegación). Grouped by Área, then Prioridad. Every ticket carries: Título, Área, Prioridad, Estado, Descripción (qué pasa, evidencia file:line, impacto, fix propuesto, criterios de aceptación), Esfuerzo, Deploy, Riesgo, Journey/lado, Ruta/Archivo. `Notion:` names the existing Build Backlog row this ticket updates (de-duplicated against the board on 2026-09-04; 46 tickets update existing rows, 50 Notion pages were created (49 new findings + PAY-01, which complements the existing DECISIÓN row)).

| Área             | Alta | Media | Baja | Total |
| ---------------- | ---- | ----- | ---- | ----- |
| Flujo/Navegación | 3    | 3     | 0    | 6     |
| Producto         | 10   | 17    | 4    | 31    |
| Seguridad        | 6    | 3     | 3    | 12    |
| Pagos            | 5    | 1     | 0    | 6     |
| Infra            | 8    | 13    | 4    | 25    |
| Fix rápido       | 3    | 9     | 10   | 22    |
| Negocio          | 1    | 5     | 0    | 6     |
| **Total**        | 31   | 53    | 21   | 104   |

---

## Añadidos 2026-09-12 / 09-13 (T-GYM3 + T-GYM3b) (9)

Nueve hallazgos levantados mientras se construía la página pública de gimnasios `/g/[slug]` (T-GYM3, PR #156). **Ninguno lo introduce T-GYM3**: los dos primeros ya están vivos en producción hoy y son anteriores al ticket. Se archivan aquí, fuera del alcance de T-GYM3, porque cada uno necesita su propia auditoría antes de tocar nada.

### [SEC-13] anon puede leer los términos comerciales de TODO partner activo (cuota mensual, mínimos de contrato, métricas)

- **Área:** Seguridad · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Supabase (migración) + Web · **Riesgo:** Alto — cualquier cambio de columnas rompe lecturas de cliente si no se audita antes
- **Journey / lado:** Cualquiera con la anon key / ambos lados
- **Ruta/Archivo:** `supabase/migrations/018_featured_partners.sql:8`; política «Anyone can read active...» sobre `public.featured_partners`

**Descripción**

QUÉ PASA: `featured_partners` NO tiene régimen de grants a nivel columna. `anon` tiene SELECT a nivel tabla y la política de lectura es `(status = 'active' OR is_app_admin())`, es decir: **fila entera, todas las columnas, de todo partner activo**. Eso incluye `monthly_fee_cents` (lo que el partner le paga a Tribe), `min_sessions_per_month` y `min_rating` (los mínimos de su contrato), y `total_impressions`, `total_clicks`, `total_bookings` (su rendimiento comercial).

EVIDENCIA: verificado en vivo con la anon key contra PostgREST el 2026-09-12 — `GET /rest/v1/featured_partners?select=*` devuelve las 3 filas activas con las 29 columnas. Los privilegios a nivel tabla (`anon` SELECT, `authenticated` SELECT/INSERT/UPDATE) se confirmaron todos `true` con `has_table_privilege` en el recon de T-GYM3.

IMPACTO: **la anon key se publica en el bundle del cliente por diseño.** No hace falta ninguna cuenta: cualquiera que abra el DevTools de tribe puede leer lo que paga cada gimnasio y cómo está negociado su contrato. Y cualquier partner puede leer los términos de otro partner. Esto está vivo hoy y es anterior a T-GYM3.

FIX: régimen de grants a nivel columna sobre `featured_partners` para `anon` (patrón de 066/140: `REVOKE SELECT ON t FROM anon` + `GRANT SELECT (cols públicas) ON t TO anon`). **NO se puede hacer a ciegas**: primero hay que auditar qué superficie de cliente lee qué columnas, porque una columna revocada que aparezca en CUALQUIER expresión de política deja la tabla ilegible entera con `42501` (lección de las migraciones 159/160), y porque un `select('*')` superviviente en cualquier DAL falla completo en vez de degradar. Por eso es su propio ticket y no entró en T-GYM3.

NOTA: T-GYM3 no amplía nada de esto. La vista `partners_public` (163) es lo contrario: excluye deliberadamente las 12 columnas comerciales y su lista de columnas es la frontera de seguridad, con un guard permanente en `supabase/verify-migration-state.sql`.

ACEPTACIÓN: `has_column_privilege('anon','public.featured_partners','monthly_fee_cents','SELECT')` es `false`, igual para `min_rating`, `min_sessions_per_month`, `total_impressions`, `total_clicks`, `total_bookings`; la app cargada como visitante anónimo no produce ningún `42501`; el banner del feed, `/instructors` y la consola del partner siguen renderizando.

### [SEC-14] is_app_admin() tiene el search_path sin fijar, y `featured_partners` tiene una política ALL para {public} que depende enteramente de ella

- **Área:** Seguridad · **Prioridad:** Alta (**subida** — antes menor) · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Supabase (migración) · **Riesgo:** Bajo
- **Journey / lado:** Todas las tablas con políticas de admin / ambos lados
- **Ruta/Archivo:** `public.is_app_admin()`; políticas de `pg_policies` sobre `featured_partners`

**Descripción**

QUÉ PASA: `is_app_admin()` es `SECURITY DEFINER` y **no** lleva `SET search_path`. Una función `SECURITY DEFINER` sin `search_path` fijado resuelve sus nombres contra el `search_path` de quien la llama.

POR QUÉ SUBE DE PRIORIDAD AHORA: el recon de T-GYM3 enumeró las políticas vivas de `featured_partners` y encontró **`"Admins manage all"` — comando `ALL`, rol `{public}`, `qual` = `is_app_admin()`**. O sea: el control de escritura completo (INSERT/UPDATE/DELETE) sobre la tabla de partners, para el rol `public`, cuelga íntegramente de esa función. No es una función auxiliar más: es el único gate de una política `ALL`.

FIX: `ALTER FUNCTION public.is_app_admin() SET search_path = public, pg_catalog;` y auditar el resto de funciones `SECURITY DEFINER` por lo mismo. Las funciones nuevas de la migración 163 (`slugify_partner_name`, `set_partner_slug`) ya nacen con el `search_path` fijado precisamente para no crear una segunda instancia.

ACEPTACIÓN: `select proname, proconfig from pg_proc where proname = 'is_app_admin'` devuelve `{search_path=public,pg_catalog}`; ninguna función `SECURITY DEFINER` en `public` queda con `proconfig IS NULL`.

### [GYM-01] El logo de BullBox está guardado en la columna equivocada (avatar de la cuenta, no logo_url)

- **Área:** Fix rápido · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Datos (sin código) · **Riesgo:** Ninguno
- **Journey / lado:** Descubrimiento + link de bio / invitado
- **Ruta/Archivo:** `public.featured_partners.logo_url` (fila `040cbc21-1b11-4ae1-aa99-9fe35a32bda0`)

**Descripción**

QUÉ PASA: `logo_url` es NULL en **las tres** filas de `featured_partners`. Lo que se ve como logo de BullBox en el feed, en `/instructors`, en su storefront y ahora en `/g/bullbox` es en realidad el `avatar_url` de la cuenta de usuario dueña, alcanzado por la cadena de fallback de `partnerLogoUrl()` (y, en la vista pública, por `coalesce(logo_url, u.avatar_url)` de la migración 163).

CORRECCIÓN RESPECTO A LA PRIMERA VERSIÓN DE ESTE TICKET: se renderizó la tarjeta OG el 2026-09-13 y **la imagen que hay en `avatar_url` ES el logo real de BullBox** (el logotipo del box sobre fondo blanco), no la cara de una persona. Así que hoy se ve bien. El problema es de dónde está guardado, no de qué se ve.

IMPACTO: menor hoy, latente después. (1) El logo depende de que la persona dueña no cambie su propia foto de perfil: el día que lo haga, su cara pasa a ser la identidad del gimnasio en el feed, en descubrimiento, en el storefront y en la tarjeta de WhatsApp del link de bio. (2) Para el siguiente partner que se registre con una foto personal como avatar, el fallo es inmediato y no hay ninguna alerta. (3) `partners_public` expone `logo_url` y `logo_image_url` por separado justamente para poder detectar este caso, y ahora mismo `logo_url` es NULL en las tres filas.

FIX: subir un logo real para BullBox a `logo_url`. **El `coalesce` de la vista se queda permanentemente** — es el fallback correcto y hace que cualquier gimnasio futuro se vea bien el día que se registra, sin ningún dato extra —; el punto de este ticket es que ese fallback no se convierta en la razón por la que nadie sube nunca un logo. `partners_public` expone `logo_url` y `logo_image_url` por separado justamente para poder distinguir un logo real de un avatar prestado.

ACEPTACIÓN: `select logo_url from featured_partners where slug = 'bullbox'` no es NULL y apunta al logo del box; `/g/bullbox/` y su tarjeta OG se ven igual que hoy pero ya sin depender del avatar de la cuenta. Idealmente hecho antes de publicar el link de bio, aunque **esto NO bloquea el DoD 3**: la tarjeta ya muestra el logo correcto.

### [GYM-03] /g/<slug inexistente> devuelve la página 404 con status HTTP 200 (soft 404)

- **Área:** Infra · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Bajo
- **Journey / lado:** Link de bio mal escrito / invitado + crawlers
- **Ruta/Archivo:** `app/g/[id]/page.tsx` (`generateMetadata` + `notFound()`)

**Descripción**

QUÉ PASA: `/g/does-not-exist/` y `/g/marce-anahata/` (un partner `independent`, excluido de la vista a propósito) **renderizan la página 404 correcta pero devuelven HTTP 200**, no 404.

EVIDENCIA, medida y reproducida el 2026-09-13 sobre Next 16.0.10:

- preview de Vercel: `HTTP 200`, `x-matched-path: /g/[id]`, `<title>Not Found | Tribe</title>`
- `next start` local sobre el mismo build: `HTTP 200` — así que **no es un artefacto de Vercel**
- con `notFound()` lanzado desde el cuerpo de la página: 200
- con `notFound()` lanzado desde dentro de `generateMetadata`: 200 también
- **discriminador**: rutas públicas sin match en esta misma app sí devuelven un 404 real (`/legal/does-not-exist/` → 404, `/faq/nope/` → 404, `/about/nope/` → 404). O sea: el 404 del router funciona; lo que no fija el status es `notFound()` en una ruta cuyo `generateMetadata` hace `await` de una llamada de red. Hipótesis (sin confirmar): el streaming de metadata de Next manda la shell antes de que resuelva el fetch, y para cuando `notFound()` se lanza el status ya está comprometido.

IMPACTO: bajo para una persona (ve la página 404 correcta, ni un 500 ni un redirect a `/auth`, así que el DoD 5 de T-GYM3 pasa tal como está escrito) y real para los buscadores: un crawler indexa cada slug mal tecleado como página viva. En una ruta de link de bio, donde los slugs son permanentes y se escriben a mano en una bio de Instagram, los slugs mal tecleados van a existir.

FIX: necesita una respuesta del lado de Next, no otro intento a ciegas. Caminos a evaluar: desactivar el streaming de metadata en esta ruta; resolver el partner antes de que empiece el streaming; o un `route.ts`/middleware que valide el slug antes de llegar a la página. **No mover `notFound()` a `generateMetadata` "para arreglarlo"** — ya se probó y no cambia nada; hay un comentario en `app/g/[id]/page.tsx` que lo dice para que no se repita el intento.

ACEPTACIÓN: `curl -s -o /dev/null -w '%{http_code}' <host>/g/does-not-exist/` devuelve `404`; `/g/bullbox/` sigue devolviendo `200`; la página 404 renderizada no cambia.

### [GYM-04] Extraer el shell visual compartido de /g/[slug] e /i/[id]

- **Área:** Infra · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) · **Riesgo:** Medio — toca las dos páginas públicas del funnel
- **Journey / lado:** Funnel de Instagram/WhatsApp / invitado
- **Ruta/Archivo:** `app/g/[id]/GymShareClient.tsx`; `app/i/[id]/InstructorShareClient.tsx`

**Descripción**

QUÉ PASA: después de T-GYM3b el _chrome_ de las dos páginas de compartir es **idéntico carácter por carácter**: el wrapper de página (`min-h-screen bg-theme-page` + el `paddingBottom` de `--bottom-nav-h`), el header (wordmark centrado con `flex justify-center` + tagline), el shell de tarjeta (`<Card className="bg-theme-card border-theme"><CardContent className="p-4">`), y la fila de sesión (`p-3 rounded-xl bg-theme-inset border border-theme hover:border-tribe-green`, con fecha, hora, deporte y el título derivado por `sessionDisplayTitle`).

CONTEXTO, y por qué esto contradice una decisión anterior: durante el recon de T-GYM3 se preguntó si convenía extraer un shell compartido y la respuesta fue **no, duplicar**, con el argumento de que los _datos_ de las dos páginas casi no se solapan — una es una persona (avatar circular, rating, bio, sesiones por `creator_id`), la otra una organización (logo cuadrado, dirección, sesiones por `partner_id`). Ese argumento sigue en pie y no es lo que cambió. Lo que cambió es que T-GYM3b tuvo que aplicar **la misma corrección de marca, línea por línea, en los dos archivos**: tema, shell de tarjeta, centrado del wordmark y fallback de título. Esa es la prueba de que la duplicación ya cuesta, y de que la próxima corrección costará lo mismo.

IMPACTO: cada arreglo de marca en el funnel público se paga dos veces, y basta olvidar uno de los dos archivos para que las dos páginas vuelvan a divergir — que es exactamente cómo llegó aquí el fondo oscuro fijo (`/g/` lo heredó copiando `/i/`, incluido el wordmark de tinta oscura sobre casi negro).

FIX: extraer el chrome, NO el contenido. Un `<SharePageShell>` que reciba el header, el padding inferior y el shell de tarjeta, más un `<ShareSessionRow>` para la fila. Los dos clientes conservan su propia cabecera de identidad y sus propias consultas.

ACEPTACIÓN: ni `GymShareClient.tsx` ni `InstructorShareClient.tsx` declaran `min-h-screen`, el header o las clases del shell de tarjeta por su cuenta; un cambio de radio o de padding en el shell se ve en las dos rutas; las capturas de las dos páginas siguen leyéndose como el mismo producto.

### [UI-A11Y-01] Contraste en el chrome global de la app: FeedbackWidget y el item activo de BottomNav fallan AA

- **Área:** Fix rápido · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Journey / lado:** Todas las rutas / ambos lados
- **Ruta/Archivo:** `components/FeedbackWidget.tsx:67-68`; `components/BottomNav.tsx`; `components/IOSInstallPrompt.tsx:96`

**Descripción**

QUÉ PASA: tres elementos del chrome global no llegan a AA. Medidos el 2026-09-13 sobre la página desplegada con `getComputedStyle`, componiendo cada capa translúcida (no calculados a mano desde la paleta):

| elemento                                | color     | sobre                                  | ratio                       | mínimo |
| --------------------------------------- | --------- | -------------------------------------- | --------------------------- | ------ |
| `FeedbackWidget` — «Bug report»         | `#A8DA36` | chip verde/15 sobre blanco (`#F2F9E1`) | **1.52:1**                  | 4.5:1  |
| `FeedbackWidget` — «Feature idea»       | `#6B7280` | `#F5F5F4`                              | **4.43:1**                  | 4.5:1  |
| `BottomNav` — item activo «Create»      | `#A8DA36` | blanco                                 | **1.65:1**                  | 4.5:1  |
| `IOSInstallPrompt:96` — texto del botón | blanco    | `bg-tribe-green`                       | ~1.9:1 (del audit original) | 4.5:1  |

CONTEXTO: los tres son anteriores a T-GYM3/T-GYM3b y son **globales**, no de las páginas de compartir. Salieron a la luz al medir `/g/[slug]` e `/i/[id]`, donde eran literalmente los elementos menos legibles de la pantalla. En las rutas de compartir el `FeedbackWidget` ya no aparece (T-GYM3b lo suprimió allí por motivos de producto, no de contraste), así que ahora sólo afectan a las superficies internas.

CAUSA RAÍZ, la misma en tres sitios: **verde de marca como TEXTO sobre una superficie clara.** Ningún verde de la paleta llega a 4.5:1 en claro — `tribe-green` 1.65:1 sobre blanco, `tribe-green-100` 1.40:1, y el mejor, `tribe-green-dark`, se queda en 3.04:1. La regla está escrita en `CLAUDE.md` con la tabla de medidas.

FIX: el mismo patrón que usaron las páginas de compartir — el verde se queda como **relleno**, y la etiqueta pasa a `text-tribe-dark` (12.6:1 sobre el chip verde). Para el item activo de `BottomNav`, mantener el indicador verde (icono o barra: 3:1 basta para UI no textual) y poner la etiqueta en un token de texto. «Feature idea» se arregla subiendo `#6B7280` a `text-theme-tertiary` (`#5B616B`), que ya existe justamente porque `#6B7280` se quedaba corto.

ACEPTACIÓN: los cuatro elementos miden >= 4.5:1 contra su fondo compuesto, medido en el DOM; ningún verde de la paleta se usa como texto pequeño sobre superficie clara en `components/`.

### [REC-01] Series recurrentes duplicadas: una sola serie mal creada se multiplica sola cada noche

- **Área:** Producto · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web + Supabase (limpieza de datos) · **Riesgo:** Medio — toca datos existentes con reservas
- **Journey / lado:** Crear sesión recurrente / instructor
- **Ruta/Archivo:** `app/create/page.tsx:210`; `app/api/cron/recurring-sessions/route.ts`; `lib/dal/sessions.ts:1106` (`childSessionExists`)

**Descripción**

QUÉ PASA: 19 grupos de sesiones duplicadas (mismo creador + fecha + hora + deporte) sobre 342 sesiones totales, 32 filas de más, 5 creadores, entre 2025-12-13 y 2026-09-12. Dos filas dentro de un grupo tienen participantes reales.

QUÉ **NO** ES, comprobado antes de escribir esto:

1. **NO es el formulario de crear aceptando un segundo submit.** El guard existe: `app/create/page.tsx:804` es `<Button type="submit" disabled={loading}>` y `setLoading(true)` (:236) corre antes del insert (:280). Y los datos lo respaldan: de 342 sesiones hay **un solo** grupo con dos filas humanas creadas a menos de 10s.

2. **NO es el cron.** `childSessionExists` (`lib/dal/sessions.ts:1106`) comprueba `recurring_parent_id + date` antes de insertar, y funciona: de los 12 grupos duplicados generados por el cron, **0** comparten `recurring_parent_id`. En todos, los hijos cuelgan de padres DISTINTOS. El cron generó correctamente un hijo por cada padre que existía.

QUÉ ES: **hay varias filas PADRE para la misma serie**, y el cron las expande todas, todas las noches. El duplicado no es un error puntual: es una serie mal creada que se multiplica sola indefinidamente.

CAUSA RAÍZ del caso más claro, con la huella intacta en los datos — las tres filas padre de BullBox (creador `eaff348f`, 12:12 CrossFit) se crearon con **un segundo de diferencia** y sus `recurrence_pattern` son:

```
2026-09-11T23:29:02   weekly_0
2026-09-11T23:29:03   weekly_0_1
2026-09-11T23:29:04   weekly_0_1_2
```

Es decir: **cada toque en un botón de día de la semana envió el formulario**, con la lista de días acumulándose. Es exactamente el bug de `RecurringSessionToggle` — los `<button>` sin `type` dentro de un `<form>`, que por defecto son `type="submit"` — y **ya está arreglado** (el `Button` compartido ahora tiene `type="button"` por defecto). Estas filas son residuo histórico de ese bug, no una regresión viva.

Los grupos de Yoga (creador `9a16aa6b`, 19:00) también tienen varios padres, pero creados con días de diferencia, no en ráfaga: ahí alguien creó la misma clase semanal más de una vez. No hay ninguna deduplicación al crear una serie.

IMPACTO: cada padre de más produce una sesión fantasma por ocurrencia, para siempre, sin que nadie vuelva a tocar nada. En `/g/bullbox/` esto se ve como dos clases idénticas de CrossFit el 14 de septiembre a las 12:12.

FIX, en dos partes:

- **Prevención:** al crear una serie recurrente, rechazar (o fusionar) un padre que coincida en creador + hora + deporte + patrón con otro creado en los últimos minutos. Un índice único parcial sobre los padres recurrentes es la versión fuerte.
- **Limpieza:** identificar los padres sobrantes y terminarlos, NO borrarlos — dos filas de grupos duplicados tienen participantes. Cualquier borrado se decide fila a fila, no en lote.

ACEPTACIÓN: la consulta de agrupación (mismo creador+fecha+hora+deporte, `having count(*) > 1`) devuelve 0 grupos nuevos después del fix; ningún padre recurrente duplicado se puede crear desde el formulario; los grupos existentes con participantes siguen intactos hasta que alguien decida caso por caso.

---

**DOS MITADES, Y NO SON LA MISMA COSA (investigado 2026-09-13).**

**MITAD COSMÉTICA — residuo, ya inerte.** Las tres filas padre de BullBox del bug de `RecurringSessionToggle`, más los 10 grupos de Yoga del creador `9a16aa6b`. Los de Yoga **ya están parados**: 7 de sus 8 padres tienen `recurrence_end_date` puesto (2026-08-19 o 2026-08-31), los 10 grupos son todos de fechas pasadas, ninguna fila de esos grupos tiene participantes, y de los 8 padres sólo queda uno abierto (`51238378`, seed 2026-09-09, `weekly_2`, 0 inscritos) que genera **una** fila futura. Alguien ya cerró esas series. Esto es limpieza, no urgencia.

**MITAD VIVA — está pasando ahora, y es la clase real de un instructor real.** El creador `0df617e9` (Leo Garcia) tiene **tres filas padre para la misma clase**, CrossFit 06:00, creadas con 40 y 13 minutos de diferencia el 2026-09-08:

```
f76a54be  seed 2026-09-08  weekly_0_1_2_3_4  (lun-vie)  0 inscritos  creada 01:02:45
c1cb18a5  seed 2026-09-09  weekly_0          (lunes)    1 inscrito   creada 01:42:20
a7b498d6  seed 2026-09-10  weekly_0          (lunes)    0 inscritos  creada 01:55:26
```

No es una ráfaga de submits: son minutos de diferencia, alguien creando la misma clase tres veces. Nada deduplica una serie al crearla.

CONSECUENCIA, ya materializada: **el lunes 14 de septiembre a las 06:00 hay TRES sesiones idénticas** en el horario de Leo — `cc6d9830`, `d51aa666` y `9c81877a`, una por padre. En `/g/bullbox/` sólo se ve una porque sólo una tiene `partner_status = 'approved'`; en el feed y en su propia lista aparecen las tres.

Y Darian (`eaff348f`) tiene lo mismo a las 12:12, con grupos futuros el 14 y el 15 de septiembre.

¿PUEDE EL INSTRUCTOR VERLO? **Sí, y no puede distinguirlas.** No hay ninguna deduplicación ni aviso de duplicado en ningún sitio. `components/dashboard/SessionManager.tsx:86,145` pinta `session.title || sportLabel`, y como `title` es NULL en todas, las tres filas se leen exactamente igual: «CrossFit», misma fecha, misma hora. La única señal que las diferencia es el contador de inscritos de cada tarjeta.

ROSTER PARTIDO: **todavía no ha ocurrido.** De los 19 grupos duplicados, en **0** hay más de una copia con inscritos — todas las reservas están sobre una sola copia. Las dos filas con inscritos dentro de un grupo son ambas **pasadas** y ninguna es de Yoga:

```
fbb9af93  eaff348f  2026-03-15 08:30 Running   2 inscritos (ambos invitados, sin cuenta)
c1cb18a5  0df617e9  2026-09-09 06:00 CrossFit  1 inscrito  (cuenta real 804f2c28)
```

Pero el mecanismo está armado para el 14: tres copias de la misma clase, quien reserve elige una de las tres al azar, y el instructor ve tres listas separadas de la misma clase. Es esto lo que hay que arreglar, no el residuo.

PRIORIDAD REAL: la mitad viva son los padres duplicados de `0df617e9` y `eaff348f`, no los grupos de Yoga.

### [GYM-05] Volver una sesión a partner_status='pending' es completamente silencioso

- **Área:** Producto · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web · **Riesgo:** Bajo
- **Journey / lado:** Aprobación de sede / instructor + atleta inscrito
- **Ruta/Archivo:** `supabase/migrations/158_gym_venue_approval.sql` (`review_venue_request`); `lib/dal/gymVenue.ts:207`; `lib/dal/venueRequests.ts`

**Descripción**

QUÉ PASA: `review_venue_request` cambia `partner_status` y **no notifica a nadie**: ni al creador de la sesión, ni a los atletas ya inscritos. No hay ningún insert en `notifications` en la migración 158, ni en `lib/dal/venueRequests.ts`, ni en `lib/dal/gymVenue.ts`.

QUÉ VE UN ATLETA YA INSCRITO cuando su sesión pasa de `approved` a `pending` (enumerado leyendo los consumidores de la columna, no supuesto):

- **NO pierde la sesión.** `partner_status` no aparece en ningún filtro de visibilidad ni de inscripción. La sesión sigue en su lista, la página de detalle funciona y su reserva queda intacta.
- **Sí pierde la identidad del gimnasio, en silencio.** `lib/sessionGym.ts:80` exige `partner_status = 'approved'` para renderizar el chip de sede, el nombre en negrita y el logo. Con `pending`, la tarjeta y el detalle vuelven a mostrar una dirección normal: reservó «CrossFit BullBox» y al día siguiente ve «Cra 43G #25a-50».
- El **creador** sí ve algo: `lib/sessionGym.ts:86` le pinta «Pendiente · {gym}» en su propia tarjeta. La asimetría es deliberada (T-GYM1) y aquí juega a favor.
- Desaparece además de `/g/[slug]` y deja de contar en las estadísticas del gimnasio en descubrimiento (`lib/dal/gymDirectory.ts:114,163`).

IMPACTO: bajo mientras el movimiento sea de nuestra parte y sobre sesiones con 0 inscritos. Deja de serlo en cuanto se aplique a una sesión reservada — que es exactamente lo que hay pendiente con la sesión de natación del 11 de noviembre, con una persona inscrita.

FIX: notificar al creador y a los participantes confirmados cuando una sede aprobada deja de estarlo. Como mínimo, que la herramienta de revisión avise a quien la usa de cuántos inscritos va a afectar antes de confirmar.

ACEPTACIÓN: quitar la aprobación de una sede con inscritos genera una notificación por participante; la interfaz de revisión muestra el número de inscritos afectados antes de confirmar.

### [DRIFT-01] La base de datos de producción no se puede reconstruir desde las migraciones, y eso ya se escribió en julio

- **Área:** Infra · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** L · **Deploy:** Proceso + Supabase · **Riesgo:** Alto — cualquier migración futura sobre `users` se escribe contra un estado que no conocemos
- **Journey / lado:** Todo el equipo
- **Ruta/Archivo:** `supabase/migrations/*`; `supabase/drift-probe.sql`; `docs/DRIFT_AUDIT_2026-07-08.md:57`

**Descripción**

QUÉ PASA: **permisos y datos de producción se están fijando fuera del control de versiones como práctica habitual.** Una reconstrucción desde `supabase/migrations/` produce una base de datos DISTINTA de la que está sirviendo a los usuarios, y más abierta. CI no puede ver la diferencia, porque CI solo ve el repositorio.

**ESTO NO ES UN FALLO DE DETECCIÓN. ES UN FALLO DE SEGUIMIENTO.** `docs/DRIFT_AUDIT_2026-07-08.md:57` ya enumeró las funciones y triggers que viven solo en producción, hace dos meses. Llamó a `protect_verified_instructor` textualmente **«a security guard living only in live»**. Su recomendación fue: _«capture each into a tracked migration verbatim, then review bodies for column-reference and logic drift»_. No se hizo nada. La nota se escribió, se archivó, y la deriva siguió creciendo.

Esa es la evidencia y ese es el ticket. Una quinta instancia no es la historia; la historia es que **la cuarta se escribió y se ignoró**.

INSTANCIAS CONOCIDAS (las cuatro de esta semana, más la nota de julio):

1. **093 emitió `GRANT SELECT ON public.users TO authenticated;`** y el probe del 2026-09-14 mide ese privilegio en `false`. **CERRADO el 2026-09-14 por medición: causa explicada, 166 desbloqueado.** Medido en producción el 2026-09-14, solo lectura:

   | medición                                                                 | resultado                                         |
   | ------------------------------------------------------------------------ | ------------------------------------------------- |
   | `has_table_privilege` SELECT en `public.users`                           | `anon` **false**, `authenticated` **false**       |
   | grants SELECT de columna para anon/authenticated sobre `users`           | **168**                                           |
   | `email`, `is_admin`, `location_lat`, `location_lng`, `push_subscription` | `has_column_privilege` **false** para AMBOS roles |

   **LO QUE ESTO CIERRA:** el estado efectivo del régimen SELECT sobre `users` ya no es desconocido, está medido columna por columna. 166 toca el allowlist de **UPDATE** y ahora puede escribirse contra realidad medida en lugar de contra una incógnita. **166 queda desbloqueado.**

   **LA CAUSA, Y POR QUÉ NO ES LO QUE PARECÍA.** Se propuso que 113, 115 y 118 hubieran revocado a nivel de tabla y re-concedido por columna, y que por tanto esto fuera el patrón correcto y no deriva. **Eso no es lo que hacen esas tres migraciones.** Las tres emiten únicamente `REVOKE SELECT (columnas)` — revoke de COLUMNA — y un revoke de columna no puede restar de un grant de tabla; es la lección documentada de 093 y de CLAUDE.md. Verificado sobre el repositorio completo: los únicos `REVOKE SELECT ON public.users` a nivel de tabla están en **066** (`:45-46`) y **067** (`:55-56`), ambas ANTERIORES a 093, y **ninguna migración posterior a 093 revoca ese grant**. 114 concede sobre `users_discoverable`, que es otro objeto.

   Es decir: 093 concedió el grant de tabla, el control de versiones no lo retira en ningún sitio, y producción lo mide en `false`. **Eso es deriva por definición.** Y 093 se escribió para reparar una caída real, así que sí se aplicó. Los perfiles siguen funcionando hoy porque el allowlist de columnas cubre lo que la app lee. Lo que queda por explicar es solo qué retiró el grant de tabla — y la aritmética de abajo lo contesta.

   **CERRADO EL 2026-09-14. CAUSA EXPLICADA.** La aritmética de los grants de columna lo resuelve sin ambigüedad. `public.users` tiene 100 columnas (medido). 067 concede todas menos 8 — los cuatro `tribe_os_*` más `push_subscription`, `fcm_token`, `fcm_platform`, `fcm_updated_at` — y concede la misma lista a los dos roles (`067:30-58`):

   | paso                                                                                                     | columnas por rol |
   | -------------------------------------------------------------------------------------------------------- | ---------------- |
   | regenerado de 067                                                                                        | 100 − 8 = **92** |
   | 113 revoca `is_admin`, `payout_method`, `stripe_account_id`, `wompi_merchant_id`, `total_earnings_cents` | 92 − 5 = 87      |
   | 115 revoca `location_lat`, `location_lng`                                                                | 87 − 2 = 85      |
   | 118 revoca `email`                                                                                       | 85 − 1 = **84**  |

   84 × 2 roles = **168**, que es exactamente lo medido. **Un re-run a mano del patrón regenerador de 066/067 habría dado 184**, porque el regenerado devuelve las 92 y no sabe nada de 113, 115 ni 118. Por tanto ese re-run NO ocurrió: **los ACL de columna están intactos y explicados al completo por el control de versiones.**

   Lo único que falta es el grant **a nivel de tabla** que 093 restauró. Un `REVOKE SELECT ON public.users FROM authenticated` suelto, ejecutado a mano, elimina exactamente eso y deja los 168 grants de columna intactos. **Es la única acción compatible con todos los números medidos.**

   VEREDICTO: **deriva, sí; peligro, no.** 093 restauró un grant de tabla en blanco para reparar una caída real — todas las páginas de perfil en blanco con `permission denied for table users` — y al hacerlo **volvió a exponer todas las columnas que 067 había retirado deliberadamente, las claves de push incluidas**. Alguien lo detectó y lo revocó. **La acción fue correcta y quien la tomó tenía razón.** El defecto es el registro que falta, no la acción. Esto no se vuelve a abrir: se vuelve a contar en la regla de equipo de más abajo, que es donde pertenece.

   CONSECUENCIA PARA 166: se puede escribir ya, pero **su guarda debe afirmar el hecho positivo** — que exactamente las N columnas del allowlist tienen UPDATE y ninguna otra — y no que un conjunto de columnas indebidas esté vacío. La misma mano que reescribió los grants de SELECT sin dejar rastro puede reescribir los de UPDATE después de que 166 aterrice, y una afirmación de vacuidad no distingue «lo arreglé» de «nunca se ejecutó». Ver el mensaje de commit de 164 y [DRIFT-04].

2. **`is_trailblazer`**: ninguna línea del repositorio lo escribe. Las insignias de la cohorte fundadora se pusieron a mano.
3. **`is_verified_instructor`**: ninguna línea del repositorio lo escribe tampoco — y medido con la anon key el 2026-09-14, **0 de 97 filas lo tienen en true**. Nadie ha verificado nunca a un instructor.
4. **Funciones y triggers que no están en ninguna migración**: `protect_verified_instructor`, `update_instructor_stats`, `on_payment_approved`, `set_payment_status_on_join`, y la lista completa de julio. Ver [DRIFT-02].
5. **Políticas RLS con el email de Al escrito dentro del cuerpo**, sobre `users` y `sessions`, que no están en ninguna migración. Ver [SEC-03].
6. **`authenticated` sobre `public.sessions` tiene grant a nivel de TABLA **y** 3 grants a nivel de COLUMNA a la vez** (medido en producción el 2026-09-14). Los tres de columna son inertes: un `GRANT SELECT (col)` no puede restar de un `GRANT SELECT` sobre la tabla — la misma lección que dejó 093. Alguien empezó un régimen por columnas sobre `sessions` y quedó a medias, o el grant de tabla se volvió a emitir por encima. No sabemos cuál, y ninguna migración explica la mezcla. No es trabajo de 164 y no se toca ahí; queda anotado porque es exactamente la forma de deriva que persigue este ticket, y porque cualquiera que lea los grants de columna sobre `sessions` concluirá que hay un régimen restrictivo que en realidad no está vigente.

CONSECUENCIA MEDIBLE, no hipotética: la deriva de la migración 093 significa que hoy no sabemos si el régimen de columnas sobre `users` es el que creemos. Y los triggers no versionados ya están produciendo datos incorrectos en producción — ver [DRIFT-03], donde `total_participants_served` está congelado en 0 para todo el mundo excepto el único admin.

FIX, y es de proceso antes que de SQL:

- ~~Resolver primero la deriva de 093 antes de escribir 166.~~ **Superado el 2026-09-14:** el estado efectivo está medido (punto 1) y 166 está desbloqueado. Queda pendiente explicar la CAUSA, que es un ticket de proceso, no un bloqueante de 166.
- **Capturar todo lo no versionado** — [DRIFT-02].
- **Ejecutar `supabase/drift-probe.sql` de forma recurrente**, no una sola vez, y comparar contra lo que las migraciones afirman. Es una consulta de solo lectura y ya está validada.
- **Regla de equipo**: nada se aplica en el editor SQL sin quedar en una migración numerada. Si hace falta un arreglo urgente a mano, la migración que lo captura se escribe en la misma sesión.

ACEPTACIÓN: `drift-probe.sql` sobre producción coincide con lo que las migraciones producen sobre una base reconstruida desde cero, en grants, políticas, triggers y funciones. Cualquier diferencia está explicada por una migración numerada.

### [DRIFT-02] Capturar todas las funciones y triggers que viven solo en producción (pendiente desde julio)

- **Área:** Infra · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Supabase (migración de captura, sin cambios de comportamiento) · **Riesgo:** Bajo si se captura verbatim
- **Ruta/Archivo:** `docs/DRIFT_AUDIT_2026-07-08.md:57` (la lista original)

**Descripción**

QUÉ PASA: hay funciones y triggers ejecutándose en producción que no existen en ninguna migración. No se pueden revisar en un code review, no se pueden reconstruir, y pueden referenciar columnas que ya no existen sin que nada en el repositorio lo detecte.

Lo pidió el audit de julio y sigue sin hacerse. Esta semana costó tiempo real: la migración 165 se quedó bloqueada porque nadie podía leer el cuerpo de `protect_verified_instructor` ni el de `update_instructor_stats` sin pedirle a Al que corriera `pg_get_functiondef` a mano.

LISTA, de `docs/DRIFT_AUDIT_2026-07-08.md:57` y de lo encontrado esta semana:

| función                                              | trigger / evento                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| `protect_verified_instructor`                        | `users` BEFORE UPDATE — «a security guard living only in live»            |
| `update_instructor_stats`                            | `sessions` AFTER UPDATE (`on_session_status_change`)                      |
| `on_payment_approved`                                | `payments` INSERT + UPDATE                                                |
| `set_payment_status_on_join`                         | `session_participants` BEFORE INSERT                                      |
| `sync_session_coords`                                | `sessions` BEFORE INSERT/UPDATE                                           |
| `notify_new_chat_message`                            | `chat_messages` — segunda vía de notificación, redundante con el webhook  |
| `update_last_login`                                  |                                                                           |
| `update_payment_updated_at`                          |                                                                           |
| `update_service_packages_updated_at`                 |                                                                           |
| `on_post_like`, `on_user_follow`, `on_user_unfollow` | contadores por delta, también sin versionar                               |
| `handle_new_user`                                    | `auth.users` — el único creador de filas en `public.users` al registrarse |

FIX: una migración de captura que haga `CREATE OR REPLACE` de cada una **verbatim**, tal como devuelve `pg_get_functiondef`, sin cambiar una línea. Cero cambios de comportamiento por diseño: el objetivo es que el repositorio y producción coincidan. **Después**, y en migraciones separadas, revisar cada cuerpo por deriva de columnas y por lógica — que es donde salió [DRIFT-03].

CUIDADO AL CAPTURAR: `CREATE OR REPLACE FUNCTION` reemplaza la definición COMPLETA, incluida su configuración. Si el `pg_get_functiondef` de origen no lleva `SET search_path`, capturarlo verbatim **despinnea** lo que la 164 fijó. Capturar verbatim y añadir el `SET search_path` explícito en la misma sentencia, como hace la 165.

ACEPTACIÓN: `select proname from pg_proc where pronamespace='public'::regnamespace` no devuelve ninguna función que no aparezca en alguna migración; el guard de `verify-migration-state.sql` lo comprueba de forma continua.

### [DRIFT-03] Los contadores derivados de instructor llevan congelados en 0 para todo el mundo menos el admin

- **Área:** Producto · **Prioridad:** Alta · **Estado:** En curso (lo arregla la 165)
- **Esfuerzo:** S · **Deploy:** Supabase · **Riesgo:** Bajo
- **Ruta/Archivo:** `public.protect_verified_instructor()`; `public.update_instructor_stats()`

**Descripción**

QUÉ PASA: `protect_verified_instructor` revierte en silencio cualquier escritura a `total_earnings_cents` y `total_participants_served` cuando quien llama no es admin. `update_instructor_stats` se dispara desde una acción de un instructor (AFTER UPDATE sobre `sessions`), así que `auth.uid()` NO es NULL y la reversión se lo come. El trigger que recalcula los contadores lleva ejecutándose y siendo descartado desde que existe.

MEDIDO el 2026-09-14 con el service role:

| instructor        | is_admin | contador dice | inscripciones confirmadas |
| ----------------- | -------- | ------------- | ------------------------- |
| Darian            | **true** | 6             | 34                        |
| Alexandra Aguirre | false    | **0**         | 13                        |
| Caroline Vanegas  | false    | **0**         | 11                        |

`total_participants_served > 0` -> solo Darian. `total_earnings_cents > 0` -> solo Darian (2430). Y **Darian es el único admin de toda la base de datos.**

LA PRUEBA, y es la parte que lo convierte en certeza: `total_sessions_hosted` — que el trigger NO protege — avanza correctamente para todos (97, 40, 36, 34…). Las dos columnas protegidas están congeladas; la no protegida no. El contraste es el guard.

IMPACTO: «atletas atendidos» en la vitrina muestra 0 para todo instructor real, y **los ingresos de instructor no se han registrado nunca para nadie salvo el admin**. Es visible en dinero.

FIX: migración 165. La regla correcta no es «admin o no», es **«originado por trigger u originado por cliente»**: un contador derivado no debería depender de quién tocó la fila. `pg_trigger_depth() > 1` distingue exactamente eso, y está validado contra un stub.

ACEPTACIÓN: tras la 165, un instructor no admin cancela o cambia el estado de una sesión y su `total_participants_served` se mueve; una escritura directa desde el cliente a esa columna se sigue revirtiendo.

### [DRIFT-04] El propio verificador de migraciones da falsos "applied": cuatro comprobaciones de REVOKE usan `information_schema.column_privileges`

- **Área:** Infra · **Prioridad:** Media · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Solo SQL de verificación · **Riesgo:** Medio — **defecto de herramienta únicamente, NO incidente de privacidad** (medido 2026-09-14, ver abajo). La herramienta con la que comprobamos si una migración se aplicó puede mentir, y ya lo ha hecho
- **Journey / lado:** Todo el equipo
- **Ruta/Archivo:** `supabase/verify-migration-state.sql:218,374,386,425,455`; contra-comentarios en `:856,:958,:1060`

**Descripción**

QUÉ PASA: `verify-migration-state.sql` contiene **cinco** comprobaciones de privilegios que consultan `information_schema`, en el mismo archivo que advierte tres veces contra hacer exactamente eso (`:856`, `:958`, `:1060` — _«USE has_column_privilege(). DO NOT swap in information_schema.column_privileges.»_).

`information_schema.column_privileges` y `role_table_grants` **solo muestran los grants en los que el usuario actual es el que concede, el que recibe, o miembro del rol que recibe**. No ven los grants a nivel de tabla. Por eso están prohibidos en CLAUDE.md, y por eso `has_table_privilege` / `has_column_privilege` son la única respuesta fiable: contestan _«¿puede este rol hacerlo?»_, no _«¿existe una fila que lo diga?»_.

CUATRO DE ELLAS SON `NOT EXISTS`, que es la peor dirección posible: verifican que un REVOKE se aplicó, y **reportan `applied` precisamente cuando la vista no puede ver el grant**. Un grant que sigue vivo y es invisible para la vista se lee como éxito. Estas cuatro llevan dando falsos positivos desde que existen:

| línea | migración                            | columna de `public.users` | qué debería probar                                         |
| ----- | ------------------------------------ | ------------------------- | ---------------------------------------------------------- |
| 374   | `067_users_push_token_revoke`        | `push_subscription`       | claves privadas de push no legibles por anon/authenticated |
| 386   | `113_revoke_users_sensitive_columns` | `is_admin`                | el flag de admin no es legible entre usuarios              |
| 425   | `115_revoke_users_coords`            | `location_lat`            | las coordenadas del usuario no son legibles entre usuarios |
| 455   | `118_revoke_users_email`             | `email`                   | el correo no es legible entre usuarios                     |

Las cuatro columnas son sensibles: claves de push, el flag de administrador, la ubicación y el correo. **Si alguno de esos REVOKE no se aplicó, hoy no lo sabríamos**, porque la fila del verificador dice `applied` en ambos mundos. No está medido todavía; medirlo es el primer paso del fix.

LA QUINTA (`:218`, `093_restore_users_select_grant`) es `EXISTS` sobre `role_table_grants`, dirección contraria: puede dar un falso **MISSING**, no un falso `applied`. Pero importa más de lo que parece, porque **093 es justo el bloqueante de la migración 166** descrito en [DRIFT-01] punto 1: la migración emitió `GRANT SELECT ON public.users TO authenticated` y el probe lo mide en `false`. Si esta fila dice `applied`, tenemos las dos herramientas contradiciéndose sobre el hecho exacto que impide escribir 166. Resolver esa contradicción puede desbloquear 166 sin arqueología adicional.

ESTE ARCHIVO NO FUE LA FUENTE DEL FALSO "164 APLICADA". Su cobertura termina en `163_partner_slug_and_public_view` (`:1049`); **no tiene sección para 164 ni para 165**. El falso positivo de 164 vino de otro sitio (una guarda que afirmaba un conjunto vacío, ver el mensaje de commit de 164). Es el mismo defecto de clase — _preguntar si existe una fila en vez de preguntar si la capacidad existe_ — encontrado de forma independiente en dos herramientas distintas el mismo día. Esa coincidencia es la razón de la prioridad Alta: no es un error aislado, es un hábito.

**MEDIDO EL 2026-09-14 — LAS CUATRO SE APLICARON. NO REABRIR COMO INCIDENTE.**

Contra producción, solo lectura, con `has_table_privilege` / `has_column_privilege`:

| medición                                                                 | resultado                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------- |
| SELECT a nivel de tabla sobre `public.users`                             | `anon` **false**, `authenticated` **false**       |
| `email`, `is_admin`, `location_lat`, `location_lng`, `push_subscription` | `has_column_privilege` **false** para AMBOS roles |
| grants SELECT de columna para anon/authenticated                         | 168                                               |
| las cinco columnas existen                                               | sí                                                |

Las cuatro migraciones de REVOKE — **067** (`push_subscription`), **113** (`is_admin`), **115** (`location_lat`/`location_lng`) y **118** (`email`) — **están aplicadas y en vigor**. Ninguna columna sensible es legible por anon ni por authenticated. El riesgo de privacidad que este ticket planteaba como hipótesis queda descartado por medición, no por razonamiento.

**NO EXISTE LIBRO DE REGISTRO. CERO FILAS.** Medido el 2026-09-14: `supabase_migrations.schema_migrations` contiene **0 filas**, frente a **163 migraciones en el repositorio**. No es que falte 093 — no consta ninguna. Este proyecto no lleva contabilidad de migraciones aplicadas.

Ese número es el argumento entero de este ticket. **«¿Se aplicó X?» no se puede contestar nunca desde los propios registros de la base de datos aquí; solo midiendo efectos.** Y es también lo que hace que las filas de `information_schema` sean peores que simplemente inexactas: **son lo único que se parece a un registro, y no pueden ver lo que dicen comprobar.** Un verificador que miente es estrictamente peor que no tener verificador, porque ocupa el sitio donde alguien buscaría la verdad. Fue exactamente lo que ocurrió con 164 durante un día entero.

Corolario para todo lo demás: cualquier afirmación de «aplicada» en este repositorio vale lo que valga la medición de efectos que la acompañe. Sin medición, es una suposición con formato de hecho.

Lo que queda es exactamente lo que dice el título: **el verificador informa `applied` sin poder saberlo**. Cuatro filas que hoy aciertan por casualidad, porque la respuesta correcta y la respuesta que la vista no puede ver coinciden en ser la misma. El día que un REVOKE no se aplique, esas filas seguirán diciendo `applied`. Por eso sigue siendo un ticket y no se cierra: la corrección es del instrumento, no del estado.

**FIX**

1. ~~**Medir primero, antes de tocar el verificador.**~~ **HECHO el 2026-09-14, resultado arriba.** La consulta, para repetirla: Las cuatro columnas, con la función correcta:

```sql
begin;
select c.col,
       has_column_privilege('anon',          'public.users', c.col, 'SELECT') as anon_select,
       has_column_privilege('authenticated', 'public.users', c.col, 'SELECT') as auth_select
from (values ('push_subscription'), ('is_admin'), ('location_lat'), ('email')) c(col);
rollback;
```

Las ocho celdas deben ser `false`. Cualquier `true` es un REVOKE que nunca se aplicó y que el verificador lleva reportando como `applied`; eso deja de ser un ticket de herramientas y pasa a ser un incidente de privacidad.

2. **Sustituir las cuatro filas** por la forma basada en capacidad. Patrón, para `067`:

```sql
select '067_users_push_token_revoke',
       case when not has_column_privilege('anon',          'public.users', 'push_subscription', 'SELECT')
             and not has_column_privilege('authenticated', 'public.users', 'push_subscription', 'SELECT')
            then 'applied' else 'MISSING' end
```

`has_column_privilege` devuelve `true` si el rol tiene el privilegio por grant de columna **o** por grant de tabla, que es exactamente lo que una verificación de REVOKE necesita saber.

3. **Sustituir `:218`** por `has_table_privilege('authenticated', 'public.users', 'SELECT')`, y anotar el resultado en [DRIFT-01] punto 1 sea cual sea, porque contesta directamente a la pregunta que bloquea 166.

4. **Regla, no solo parche:** ninguna comprobación de privilegios en este repositorio consulta `information_schema`. Los tres comentarios que ya lo dicen no bastaron — el archivo los contiene y los incumple a la vez. Vale la pena una regla de lint o un grep en CI sobre `supabase/**/*.sql` que falle ante `information_schema.(table_privileges|column_privileges|role_table_grants)`.

5. **Añadir secciones para 164 y 165**, ambas aplicadas el 2026-09-14 y ninguna cubierta por este archivo.

**ACEPTACIÓN:** `verify-migration-state.sql` no contiene ninguna referencia a `information_schema.(table_privileges|column_privileges|role_table_grants)`; las cuatro filas de REVOKE usan `has_column_privilege`; ~~existe la medición del punto 1~~ (hecha, arriba); 164 y 165 tienen sección; y CI falla si alguien reintroduce el patrón.

### [COUNTER-01] Reconstruir total_participants_served: recomputado, un solo dueño, sobre una finalización real

- **Área:** Producto · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Supabase (migración) · **Riesgo:** Medio — toca dos triggers vivos no versionados
- **Ruta/Archivo:** `public.update_instructor_stats()`; `public.on_payment_approved()` — ninguna de las dos está en el repositorio, ver [DRIFT-02]
- **Bloquea:** [DRIFT-03]. **Bloqueada por:** [DRIFT-02] (hay que capturar los cuerpos antes de reescribirlos).

**Descripción**

QUÉ PASA: `total_participants_served` lo incrementan **dos** triggers distintos, con semánticas distintas, y ninguno lo recalcula:

- `update_instructor_stats` (`sessions` AFTER UPDATE) hace `total_participants_served + participant_count` en **cualquier** cambio de estado. Cancelar una sesión lo INCREMENTA. Cualquier ida y vuelta de estado lo incrementa otra vez.
- `on_payment_approved` (`payments` INSERT+UPDATE) hace `total_participants_served + 1` sobre la misma columna.

POR QUÉ NO SE PUEDE «DESCONGELAR» Y YA: hoy la columna está congelada porque `protect_verified_instructor` revierte en silencio toda escritura de un no-admin (ver [DRIFT-03]). Quitar esa reversión NO arregla el contador: lo pone a acumular basura desde una base de cero, sin histórico, con dos incrementadores pisándose. **Congelado es visiblemente incorrecto; en movimiento y mal parece que funciona**, que es estrictamente peor. La migración 165 deja la reversión puesta a propósito por esto, y lleva un guard que falla si alguien la quita sin leer el motivo.

Se construyó y se validó un mecanismo `pg_trigger_depth() > 1` que distingue correctamente escrituras originadas por trigger de las originadas por cliente, y se descartó: un mecanismo correcto apuntando a un cálculo roto solo hace que el número equivocado se mueva más rápido.

FIX, y las tres partes son necesarias juntas:

1. **RECOMPUTAR, no incrementar.** `SELECT count(*) FROM session_participants WHERE status='confirmed'` sobre las sesiones pasadas del instructor, siguiendo el patrón de recompute de la migración 109 (que el audit de julio ya recomendó para todos los contadores).
2. **UN solo dueño.** Quitar el incremento de `on_payment_approved` y el de `update_instructor_stats`; que un único trigger mantenga la columna.
3. **Sobre una finalización real**, no sobre cualquier cambio de estado. OJO: hoy `sessions.status` solo toma los valores `active` y `cancelled` — no existe `completed`. Así que «finalización» hay que definirla (fecha pasada y no cancelada, probablemente) antes de escribir el trigger.
4. Backfill de una sola vez para todas las filas existentes, ya que el histórico no está.

ACEPTACIÓN: para cada instructor, `total_participants_served` coincide con el conteo real de inscripciones confirmadas en sus sesiones pasadas no canceladas; cancelar una sesión no lo incrementa; un round-trip de estado no lo mueve.

### [STATS-01] sessions_completed cuenta CANCELACIONES, y se muestra en el perfil público

- **Área:** Producto · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Supabase (migración) · **Riesgo:** Medio
- **Ruta/Archivo:** `public.update_instructor_stats()` (no versionada, ver [DRIFT-02]); `lib/dal/users.ts:37` la lee; se renderiza en el perfil

**Descripción**

QUÉ PASA: `update_instructor_stats` hace `sessions_completed + 1` en **cada** cambio de estado de una sesión, incluidas las cancelaciones. Nada la recalcula. Y a diferencia de los otros dos contadores, esta columna **no está protegida** por `protect_verified_instructor`, así que sí se ha estado moviendo para todo el mundo, todo este tiempo.

MEDIDO el 2026-09-14 con el service role. Como `sessions.status` solo tiene `active` y `cancelled`, el único cambio de estado que ocurre en la práctica es active -> cancelled, y el resultado es exacto:

| instructor        | `sessions_completed` | sesiones CANCELADAS | sesiones pasadas reales |
| ----------------- | -------------------- | ------------------- | ----------------------- |
| Darian            | 16                   | **16**              | 97                      |
| Alexandra Aguirre | 9                    | **9**               | 40                      |
| Caroline Vanegas  | 3                    | **3**               | 34                      |
| Marcela Anahata   | 1                    | **1**               | 15                      |
| Leo Garcia        | 1                    | **1**               | 9                       |

**`sessions_completed` es igual al número de sesiones canceladas para 5 de 5 instructores.** No está inflada: está contando exactamente lo contrario de lo que dice contar. En total la columna suma 30 frente a 255 sesiones pasadas reales.

IMPACTO: el perfil público de un instructor muestra como «sesiones completadas» su número de cancelaciones. Alexandra, con 40 sesiones pasadas, aparece con 9 — que es su número de cancelaciones. Es una cifra de reputación, visible a desconocidos, y dice lo contrario de la verdad.

FIX: mismo tratamiento que [COUNTER-01] — recomputar desde `sessions` en lugar de incrementar, sobre una definición explícita de «completada», con backfill. Las dos columnas las mantiene el mismo trigger, así que conviene arreglarlas en la misma migración.

ACEPTACIÓN: `sessions_completed` coincide con el conteo real de sesiones pasadas no canceladas de cada instructor; cancelar una sesión no la incrementa.

### [PAY-08] on_payment_approved no es SECURITY DEFINER, así que la escritura de ingresos no afecta a ninguna fila

- **Área:** Pagos · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Supabase (migración) · **Riesgo:** Bajo
- **Ruta/Archivo:** `public.on_payment_approved()` (no versionada, ver [DRIFT-02])

**Descripción**

QUÉ PASA: `on_payment_approved` **no** es `SECURITY DEFINER`. Corre como quien la llama. Su `UPDATE public.users SET total_earnings_cents ...` apunta a la fila del **INSTRUCTOR**, mientras que quien llama es el **PAGADOR**. La política RLS de UPDATE sobre `users` es `auth.uid() = id`, así que el UPDATE **no coincide con ninguna fila** y no hace nada, en silencio.

ESTO ES UNA SEGUNDA RAZÓN, INDEPENDIENTE, de que los ingresos de instructor no se hayan registrado nunca. La primera es la reversión silenciosa de `protect_verified_instructor` ([DRIFT-03]). Están apiladas: **arreglar solo una de las dos no cambia nada.** Si se hace la función `SECURITY DEFINER` sin tocar la reversión, la escritura pasa el RLS y la revierte el trigger. Si se quita la reversión sin tocar la función, la escritura sigue sin coincidir con ninguna fila.

FIX: `SECURITY DEFINER` con `SET search_path` fijado, capturada primero en una migración ([DRIFT-02]). Coordinar con [COUNTER-01], que además le quita a esta función el incremento de `total_participants_served`.

ACEPTACIÓN: un pago aprobado mueve `total_earnings_cents` del instructor; verificado con un pago real de extremo a extremo, no con una escritura directa.

### [PAY-09] Los registros de pago almacenados llevan un reparto de comisión que Tribe no aplica — DECISIÓN DE AL

- **Área:** Pagos · **Prioridad:** Alta · **Estado:** **Necesita decisión de Al**
- **Esfuerzo:** M · **Deploy:** Supabase + revisión de datos · **Riesgo:** Alto — son datos financieros almacenados
- **Ruta/Archivo:** `public.on_payment_approved()` (no versionada, ver [DRIFT-02]); columnas `payments.platform_fee_cents`, `payments.instructor_payout_cents`
- **Relacionado, NO duplicar:** [PAY-04] (copy de marketing «keep 85%» / 15%) y la fila de Notion «La UI muestra una tarifa de plataforma del 10% que Tribe no cobra».

**Descripción**

QUÉ PASA: `on_payment_approved` calcula `v_fee_cents := ROUND(NEW.amount_cents * 0.10)` y escribe `platform_fee_cents` e `instructor_payout_cents` en **cada fila de pago aprobada**.

POR QUÉ ESTE ES DISTINTO DE LOS DOS TICKETS QUE YA EXISTEN, y por qué es el peor de los tres:

- [PAY-04] y la fila de Notion son sobre **cadenas de texto que se muestran**: la UI decía 10%, el marketing dice 15%, y el código de config dice 15% (`lib/payments/config.ts:6`). Eso se arregla editando copy.
- Esto **no es una cadena de texto. Son datos financieros almacenados.** Cada pago aprobado en la base de datos lleva escrito un reparto que no corresponde a lo que Tribe hace realmente, y el número que usa (10%) tampoco coincide con el 15% del código ni con el «100% al instructor» del camino de pago que está vivo (`PaidSessionRequest`, off-platform).

Son por tanto **tres capas distintas**: lo que dice el marketing (15%), lo que decía la UI (10%), y lo que queda escrito en la tabla de pagos (10%). Editar el copy no toca la tercera.

LO QUE NECESITA DECIDIR AL, y por eso este ticket no propone un fix:

1. ¿Cuál es la comisión real, si es que hay alguna, para cada camino de pago?
2. Las filas ya escritas: ¿se recalculan, se anulan, o se dejan con una nota de que el campo nunca fue autoritativo?
3. ¿Debería `on_payment_approved` escribir estos campos siquiera, o el reparto lo debería decidir el gateway en el momento del cobro?

Hasta que eso esté decidido, **no tocar la función**: cambiar el 0.10 por otro número sin responder (1) solo cambia qué cifra incorrecta se almacena.

ACEPTACIÓN: decisión escrita en este ticket; `platform_fee_cents` e `instructor_payout_cents` o reflejan la comisión real o se retiran; las filas históricas tienen un tratamiento definido.

### [PAY-10] El camino de pago automático nunca se ha completado ni una sola vez: 0 aprobados, 12 errores, 5 pendientes, y ninguna fila desde el 2026-07-06

- **Área:** Pagos · **Prioridad:** Alta · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Ninguno todavía — el primer paso es solo lectura · **Riesgo:** Alto cuando se cobre, **cero hoy** porque no se cobra
- **Journey / lado:** Atleta que paga · Instructor que cobra
- **Ruta/Archivo:** `public.payments`; `public.on_payment_approved()` (no versionada, ver [DRIFT-02]); camino manual en `lib/dal/sessions.ts:1283`
- **CONDICIÓN BLOQUEANTE:** hay que resolverlo **antes de habilitar el cobro**, NO antes de la próxima release. Al no está cobrando.

**Descripción**

> **CORRECCIÓN 2026-09-15 — LA CAUSA NO ES LA QUE ESTE TICKET SUPUSO AL ABRIRSE.**
> Se leyeron las 12 filas en `error`. No son un fallo de Wompi. Son un fallo de
> **selección de pasarela**, y son deliberadas: alguien enrutó COP a Stripe a
> propósito. Ver «Diagnóstico corregido» más abajo antes que nada.

MEDIDO EN PRODUCCIÓN el 2026-09-14, `public.payments` completa:

| estado | filas | rango de fechas |
|---|---|---|
| `error` | **12** | 2026-05-02 → 2026-07-06 |
| `pending` | **5** | 2026-05-03 → 2026-07-01 |
| `approved` | **0** | — |

**Cero aprobados de 17 intentos, y ninguna fila nueva desde el 2026-07-06.** El camino automático de pago no ha llegado a término nunca. No es que falle a veces: no ha funcionado ni una vez, y lleva más de dos meses sin recibir siquiera un intento.

**ESTO REENCUADRA [PAY-08].** Ese ticket dice que `on_payment_approved` no es `SECURITY DEFINER`, así que su `UPDATE public.users SET total_earnings_cents ...` corre como el PAGADOR contra la fila del INSTRUCTOR, no coincide con ninguna fila por la política `auth.uid() = id`, y no hace nada en silencio. **Eso sigue siendo cierto y sigue siendo un defecto real — pero nunca ha tenido efecto, porque el trigger nunca se ha disparado.** Se dispara con `payments` INSERT + UPDATE hacia `approved`, y aprobados hay cero. PAY-08 no baja de prioridad: es una bomba con la espoleta puesta que se armará el día que el primer pago se apruebe. Lo que cambia es que hoy no está causando daño y no explica ningún dato observado.

**CONSECUENCIA PARA LOS CONTADORES.** `total_earnings_cents = 0` para todo el mundo tiene ahora **dos** causas independientes, y conviene no seguir atribuyéndolo solo a una:

1. El revert silencioso de `protect_verified_instructor` — ver [COUNTER-01] y [DRIFT-03], y la migración 165, que lo dejó congelado a propósito.
2. **La escritura nunca ocurre.** Aunque el revert no existiera y `on_payment_approved` fuese `SECURITY DEFINER`, el contador seguiría en 0, porque no hay ningún pago aprobado que lo incremente.

Arreglar cualquiera de las dos por separado no moverá el número. Quien retome [COUNTER-01] debe leer esto primero para no volver a derivarlo desde cero: **la causa raíz de los ingresos en cero es que no ha habido ingresos que registrar por esta vía**, no la lógica del trigger.

**EL ÚNICO CAMINO QUE HA FUNCIONADO ES EL MANUAL.** Las confirmaciones de pago que sí han ocurrido no pasaron por `public.payments`: van por `session_participants.payment_confirmed_by` (escrito en `lib/dal/sessions.ts:1283`) y por el trigger `set_payment_status_on_join`, es decir, el instructor marca a mano que le pagaron en efectivo o por transferencia. Esa es la realidad operativa de la plataforma hoy y coincide con [PAY-04]: Tribe no procesa pagos, los instructores reciben el 100%. La tabla `payments` es infraestructura montada que nunca entró en servicio.

**DIAGNÓSTICO CORREGIDO — LEÍDAS LAS 12 FILAS `error` (2026-09-15)**

| pasarela | moneda | filas | fechas |
|---|---|---|---|
| stripe | **COP** | **8** | 2026-06-25 → 2026-07-06 |
| stripe | USD | 3 | mayo |
| wompi | COP | 1 | 2026-05-03 |

**Wompi se alcanzó UNA vez de doce.** Once fallos fueron a Stripe y ocho de esos en COP, una moneda que Stripe no liquida en Colombia. El problema no está en el código de ninguna pasarela: está en **cuál se elige**.

**1. DÓNDE SE ELIGE.** `lib/payments/config.ts:28-42`, `getPaymentGateway(currency)`. La decisión completa es:

```ts
const override = process.env.PAYMENT_GATEWAY_OVERRIDE?.toLowerCase();
if (override === 'stripe' || override === 'wompi') return override;
switch (currency) { case 'COP': return 'wompi'; case 'USD': return 'stripe'; }
```

Ramifica sobre **la moneda y una variable de entorno, y sobre nada más**. No mira el país, ni `users.stripe_account_id`, ni si el instructor tiene cuenta de cobro, ni si la pasarela elegida puede liquidar esa moneda. El override gana siempre y se aplica a TODAS las monedas a la vez: no existe forma de enrutar USD a Stripe y COP a Wompi mientras esté puesto.

**2. POR QUÉ COP FUE A STRIPE DESDE EL 2026-06-25.** No hubo cambio de código: `git log` sobre `lib/payments` y `app/api/payment` entre el 2026-06-20 y el 2026-07-08 está **vacío**. El override se introdujo antes, el 2026-05-28 (`62d7463`), y lo que cambió en junio fue el **valor de la variable en el panel de Vercel**. `PAYMENT_GATEWAY_OVERRIDE` no está en `.env.local.example` ni en `vercel.json`: **el interruptor que decide por dónde va el dinero de todos los usuarios es invisible para el control de versiones.** Es la misma clase de deriva que [DRIFT-01], aplicada a pagos.

Y fue **deliberado y está documentado**: `docs/PAYMENTS_HANDOFF.md:11-13` dice que Wompi está roto porque `WOMPI_PRIVATE_KEY` y `WOMPI_EVENTS_SECRET` están vacías, y que **el alta como comerciante en Wompi está bloqueada porque Al no tiene teléfono colombiano, cuenta bancaria colombiana ni RUT**. El override fue el arreglo temporal. El comentario en `config.ts:22-24` lo dice con todas las letras.

Es decir: Wompi nunca fue alcanzable desde la UI en la práctica — ni por un bug de código, sino porque **no hay entidad legal colombiana detrás**.

**3. ¿STRIPE FUNCIONÓ ALGUNA VEZ? NO. NUNCA. EN NINGUNA MONEDA.** Los 3 fallos USD de mayo son anteriores a los 8 de COP, y de las 17 filas totales de `public.payments` hay **cero aprobadas**. Stripe no ha completado un solo cobro en USD ni en COP. Conviene decirlo sin rodeos porque la narrativa cómoda — «Wompi está roto, Stripe es el plan B» — implica que el plan B funciona, y no hay ni una fila que lo respalde.

Peor: aunque un cobro en Stripe llegara a aprobarse, **no hay camino de pago al instructor**. Stripe Connect es US-only — ver [PAY-05] — así que un instructor colombiano no puede recibir el dinero. No existe hoy ninguna ruta completa de extremo a extremo, en ninguna de las dos pasarelas.

**4. ¿SE PRUEBA LA SELECCIÓN? A NIVEL DE RUTA, NO — SE FALSEA.** En `app/api/payment/create/route.test.ts` la propia `getPaymentGateway` está mockeada (`vi.mock('@/lib/payments/config')`, líneas 44, 321, 361, 382, 394, 426): cada test **dice** qué pasarela quiere y la ruta nunca ejecuta la decisión real. Y las dos ramas tienen la misma forma de stub:

- `createWompiTransaction` → `{ redirect_url: 'https://checkout.wompi.co/p/…' }` (:362, :427) — un valor que la implementación real **no puede producir**, que es el bug de #71.
- `createStripeCheckoutSession` → `{ url: 'https://checkout.stripe.com/pay/cs_test', sessionId: … }` (:322) — misma forma, y nunca se ha verificado contra la función real en COP.

`lib/payments/config.test.ts:38-68` **sí** prueba `getPaymentGateway` de verdad, incluido `PAYMENT_GATEWAY_OVERRIDE=stripe forces stripe for COP`. Esos tests no están mal: describen exactamente lo que producción hace. **El defecto no es la lógica de selección, es la decisión que codifica.** La suite está en verde afirmando que COP va a Stripe, que es precisamente lo que falla.

**#71 NO ARREGLA ESTO. NO LO MERGEES ESPERANDO QUE LOS PAGOS EMPIECEN A FUNCIONAR.**
El PR #71 (`fix(wompi): switch COP charges to Web Checkout`) corrige un bug real y todavía vivo en `main`: `lib/payments/wompi.ts:90` postea a `/transactions`, que exige una fuente de pago tokenizada y nunca devuelve `redirect_url`, así que `:130` lee `undefined`. Eso es cierto y hay que arreglarlo. **Pero explica 1 de las 12 filas de error, no 12.** Y aunque se mergee:

- Wompi sigue sin credenciales (`WOMPI_PRIVATE_KEY` vacía), y
- el alta como comerciante sigue bloqueada por falta de entidad colombiana, y
- mientras `PAYMENT_GATEWAY_OVERRIDE=stripe` esté puesto en Vercel, **el código de Wompi ni siquiera se ejecuta**.

Mergear #71 deja los pagos exactamente igual de rotos que ahora. Su valor es que la ruta de Wompi esté correcta el día que haya entidad colombiana, no que desbloquee el cobro.

**FIX — EL PRIMER PASO ES LEER, NO TOCAR LA PASARELA**

1. ~~**Leer las 12 filas en `error` y decir qué falló realmente.**~~ **HECHO el 2026-09-15 — resultado arriba.** Antes de que nadie mire el código de la pasarela, hay que saber si son 12 fallos de una misma causa o de varias: credenciales, firma de webhook, moneda, un campo requerido, o llamadas de prueba abandonadas. Doce filas es una muestra que se lee entera en diez minutos y descarta la mitad de las hipótesis posibles.

   ```sql
   begin;
   select id, created_at, status, amount_cents, currency, payment_type,
          provider, provider_payment_id, error_message, metadata
   from public.payments
   order by created_at;
   rollback;
   ```

   Son 17 filas en total: caben todas, no hace falta muestrear.

2. **Decidir la pasarela ANTES de tocar código.** La pregunta no es técnica: o se consigue la entidad colombiana que Wompi exige, o se acepta que Stripe no liquida COP ni paga a instructores colombianos ([PAY-05]). Ningún PR resuelve eso.

3. **Sacar `PAYMENT_GATEWAY_OVERRIDE` del panel de Vercel y meterlo en control de versiones**, o como mínimo documentar su valor vivo aquí. Hoy la ruta del dinero cambia sin dejar rastro en git.

4. **Averiguar por qué no hay intentos desde el 2026-07-06.** ¿Se retiró el punto de entrada de la UI, se apagó por configuración, o simplemente nadie lo intentó? Es una pregunta distinta de por qué fallaron los 12, y la respuesta cambia el alcance.

5. Solo después de lo anterior, decidir sobre el código. Cruza con [PAY-01] (el kill switch `INSTRUCTOR_PAYMENTS_ENABLED` que no existe en código) y [PAY-02] (decisión de Al sobre los branches Stripe/Wompi).

**ACEPTACIÓN:** las 12 filas `error` están clasificadas por causa en este ticket; se sabe por qué no hay intentos desde julio; y existe una decisión escrita de Al sobre si el camino automático se arregla o se retira antes de habilitar el cobro.


### [GYM-02] display_order sin desempate: el orden relativo de dos partners empatados cambia entre cargas

- **Área:** Fix rápido · **Prioridad:** Baja · **Estado:** Por hacer
- **Esfuerzo:** S · **Deploy:** Web (Vercel) · **Riesgo:** Ninguno
- **Ruta/Archivo:** `lib/dal/featuredPartners.ts` (`fetchActivePartners`, cláusulas `.order(...)`)

**Descripción**

QUÉ PASA: BullBox tiene `display_order = 100`; los otros dos partners tienen ambos `0`. El orden es `display_order desc, tier desc, total_impressions asc`, y `total_impressions` se incrementa con cada impresión del banner, así que **el orden relativo de los dos empatados cambia entre cargas de página**. Sin una última clave estable, PostgreSQL no garantiza ningún orden para filas que empatan en todas las claves.

IMPACTO: menor y sólo cosmético — el carrusel de afiliados del feed baraja sus dos últimas tarjetas. Se nota al probar el banner (dos cargas seguidas dan órdenes distintos) y hace irreproducible cualquier reporte de bug sobre «la segunda tarjeta».

FIX: añadir una última clave determinista, `.order('id', { ascending: true })`, al final de la cadena de `fetchActivePartners` (y de `fetchAllPartners`, que ordena sólo por `created_at`).

ACEPTACIÓN: dos cargas consecutivas del feed devuelven los partners en el mismo orden; un test sobre la cadena de `.order(...)` fija la última clave.

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

**ACTUALIZACIÓN 2026-09-13 (T-GYM3b) — hecha la mitad, y la otra mitad es una decisión de producto, no un olvido.**

HECHO: `/g/` e `/i/` ya están suprimidos, vía `lib/publicShareRoutes.ts`, que ahora consumen tanto `IOSInstallPrompt` como `FeedbackWidget`. Tests en `components/IOSInstallPrompt.test.tsx` y `components/FeedbackWidget.test.tsx`, cubriendo las dos mitades (ausente en las rutas de compartir, presente en `/home`, `/sessions`, `/storefront/<id>/`, `/instructors`).

PENDIENTE, y POR QUÉ SE DEJÓ FUERA A PROPÓSITO: `/s/[id]` y `/download` siguen mostrando el modal.

`/download` es obvio: la página existe para instalar la app, así que el modal es redundante pero no está fuera de lugar.

`/s/[id]` es la decisión real. Es una página pública de compartir, igual que `/g/` e `/i/`, pero **no está en la misma parte del embudo**. Un link de sesión compartido va a alguien a quien ya invitaron a algo concreto, y reservar esa sesión requiere la app: ahí el prompt de instalación está haciendo su trabajo. Un link de bio de gimnasio es el tope del embudo — alguien que todavía no sabe qué es Tribe — y el modal se interpone antes de que pueda ver nada. Por eso `/s/` **no** está en `PUBLIC_SHARE_ROUTE_PREFIXES`, y hay un test que fija esa ausencia para que nadie la "arregle" sin decidirlo.

Si se revisa esa decisión, el cambio es una línea en `lib/publicShareRoutes.ts`, y hay que actualizar el test que la fija.

EXTRA que sigue vivo: el locale `/us/` vs `/co/` y el `text-white` sobre `bg-tribe-green` (~1.9:1) del propio modal siguen sin tocar — ver [UI-A11Y-01].

**RESOLUCIÓN 2026-09-13 — Smart App Banner: se queda.** `app/layout.tsx:33` declara `itunes: { appId: '6458219258' }`, que Safari en iOS convierte en una barra nativa de App Store en **todas** las rutas, incluida `/g/[slug]`. Verificado servido en `/g/bullbox/`: `<meta name="apple-itunes-app" content="app-id=6458219258"/>`.

Se deja tal cual, por decisión de Al: es fina, nativa, descartable y no secuestra la página. El problema nunca fue que Tribe ofrezca una app, sino que la página le quitara la decisión al visitante — y eso era el CTA que apuntaba a `/download/`, ya corregido. Además vive en el layout raíz, así que quitarla la quitaría de todas las rutas.

NOTA PARA QUIEN VERIFIQUE: esta barra es **invisible para cualquier arnés headless**. Chromium no la renderiza, así que `scripts/verify-share-routes.mjs` no puede verla ni afirmar nada sobre ella. Sólo se comprueba en un iPhone real.

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

### [SEC-03] Dos sistemas de admin en paralelo, en TRES sitios, y no coinciden

- **Área:** Seguridad · **Prioridad:** **Alta** (subida el 2026-09-14: el tercer sitio son políticas RLS vivas, no código) · **Estado:** Por hacer
- **Esfuerzo:** M · **Deploy:** Web (Vercel) + Supabase (migración) · **Riesgo:** Auth
- **Journey / lado:** Admin
- **Ruta/Archivo:** `lib/admin.ts:10-16; lib/admin-config.ts:12; lib/auth/adminApi.ts:47-48; app/api/admin/users/[id]/delete/route.ts:24; app/api/admin/tribe-os/grant-premium/route.ts:18,33`; políticas RLS sobre `public.users` y `public.sessions`

**Descripción**

QUÉ PASA: dos definiciones de "admin" conviven: flag de DB vía RPC is_app_admin() (lib/auth/adminApi.ts:47-48, gatea /api/admin/data y páginas /admin/\*) y allowlist de emails literal (lib/admin.ts:10-16 + lib/admin-config.ts:12) que gatea las DOS rutas más destructivas: borrar usuario (:36) y otorgar premium (:33). Consecuencias: un admin legítimo (is_admin=true) ve el control de borrar y recibe 403; quien controle una de las dos direcciones literales borra usuarios y otorga premium SIN fila is_admin y sin pasar por admin_role_audit (043:66-85); la comparación es case-sensitive.
FIX: isAdmin() sobre is_app_admin(); retirar ADMIN_EMAILS; un solo helper requireApiAdmin.
ACEPTACIÓN: las dos rutas responden 403 a un email de la lista sin is_admin y 200 a un is_admin real.

---

**ACTUALIZACIÓN 2026-09-14 (SEC-SWEEP) — ya no es categórico, son tres sitios concretos y hay uno que no es código.**

Los **tres** lugares donde vive el gate de admin, y lo que decide cada uno:

1. **`is_app_admin()`** — el flag en base de datos. `lib/auth/adminApi.ts:47-48` (`requireApiAdmin`) lo usa para `/api/admin/data` y las páginas `/admin/*`. Es el mecanismo bueno: consulta una fila real y queda registrado.

2. **`ADMIN_EMAILS`**, allowlist literal de dos direcciones en `lib/admin-config.ts:12`, consumida por `isAdmin()` en `lib/admin.ts:10-16`. Gatea exactamente las **dos rutas más destructivas** — `app/api/admin/users/[id]/delete/route.ts` (borrar una cuenta) y `app/api/admin/tribe-os/grant-premium/route.ts` (otorgar un tier de pago). Comparación sensible a mayúsculas.

3. **NUEVO, y es el que sube la prioridad: políticas RLS vivas con el email escrito dentro del cuerpo.** El volcado de `pg_policies` del 2026-09-14 muestra sobre `public.users` la política `"Admin can update users"` con `qual` = el email del JWT comparado contra `alainalisca@…` literal, **conviviendo** con `"Admins can update any user"` que usa `is_app_admin()`. `public.sessions` carga políticas de la misma forma. Esto no está en ningún archivo del repositorio: se aplicó a mano, igual que el re-revoke de 093 (ver el ticket de deriva).

**LA CONSECUENCIA, en las dos direcciones:**

- Un **admin real** (`is_admin = true`, con su fila y su rastro en `admin_role_audit`) recibe **403** de la ruta que otorga tiers de pago y de la que borra cuentas. El mecanismo legítimo no sirve donde más importa.
- Quien **controle una de las dos direcciones literales** —incluida la recuperación de ese buzón— borra cuentas y otorga tiers de pago **sin fila `is_admin`**, sin pasar por `admin_role_audit` (043:66-85), y ahora además **escribe filas de `users` vía RLS** por la política del punto 3. Nada de eso deja rastro en el sistema de auditoría que existe precisamente para eso.

Los dos sistemas no coinciden en ninguna dirección: ni el admin de base de datos puede hacer lo que hace el email, ni el email aparece en la auditoría del admin de base de datos.

**FIX (sin cambios respecto al original, ampliado al tercer sitio):** `isAdmin()` pasa a apoyarse en `is_app_admin()`; se retira `ADMIN_EMAILS`; un solo helper `requireApiAdmin` para las rutas; y una migración que elimine las políticas RLS con el email literal dejando únicamente las de `is_app_admin()`. **Enumerar las políticas vivas primero** (`pg_policies`), por la lección de 159/160: `DROP POLICY IF EXISTS` es silencioso cuando el nombre no coincide.

**NO se toca en el SEC-SWEEP en curso.** El orden acordado es 164 (el trigger, solo) → el revoke de la allowlist de UPDATE. Este ticket va después y lleva su propia puerta en dispositivo.

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

VERIFICADO EN VIVO: la DB tiene 88 tablas, 4 vistas (sessions*public, users_discoverable, session_participants_public, session_participants_roster) y 42 funciones; lib/database.types.ts (último commit e6ac712, 2026-08-04, era migración 141) tiene 41 tablas, `Views: {}` vacío y 1 función. notification_preferences ni siquiera figura en Tables pese a 037/149/150/151. 36 columnas de users presentes en vivo faltan en el archivo (is_test_account, is_trailblazer, deleted_at, timezone, tribe_os*\_, subscription\_\_, lead\_\*...). El path anon principal (.from('sessions_public')) es untyped. 137:92-94 ya registró un near-miss por confiar en este archivo.
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
Relacionado (mismo ticket del board "Disciplina de migraciones"): 23 archivos legacy sin numerar (add*\_.sql, create\_\_.sql, fix*\*.sql) ordenan lexicalmente DESPUÉS de 155 y no tienen registro de aplicado; add_reviews.sql (que agrega users.average_rating) se aplicaría después de 114/138 que ya la leen; 141*\*.REHEARSAL.sql vive suelto en supabase/ (no en rehearsals/); VERIFIER_FLOOR=60 deja 009-059 sin probe (incluye 041, 042, 047, 054).
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

VERIFICADO: rating*modal_shown/rating_submit_failed/rating_submitted están en PostSessionPrompt.tsx (importado por nadie); el UI real es PostSessionFlow.tsx:136 con CERO trackEvent. tribe_os_checkout_started y tribe_os_portal_opened están documentados como paso 2 del funnel de suscripción y no existen en ningún call site. Muertos (31): account_deleted, api_error, challenge*_, connection*accepted/rejected/requested, email_verified, filter_applied, instructor_onboarding*_, notification*received, payment_completed/failed/initiated, product_viewed, profile_completed, promo_code*_, session*boost_purchased, session_cancelled/completed/edited/left, streak_updated, tip*_, tribe*os*\_. Tampoco existe un evento follow. Tres dashboards de PostHog leen vacío.
FIX: mover los rating\_\_ a PostSessionFlow, borrar PostSessionPrompt, agregar los tribe*os*\* en sus handlers, podar o emitir el resto, corregir el doc.
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
