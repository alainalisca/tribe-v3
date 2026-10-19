# /dev/moments fixture photos

Dev only. Never under `public/`, never uploaded to Vercel (`.vercelignore`),
never traced into a function (`next.config.ts` outputFileTracingExcludes).
`app/dev/moments/fixtures.ts` reads them from disk at request time, in local
development only, and hands the screens small data URLs.

All are Al's own frames, the same crops the marketing site uses (sources from
the T-SITE1.1 photo table). None is a Leo portrait (BullBox IMG_9856 to 9863)
or a banned Zona de Combate frame (IMG_9764 to 9766, 9776 to 9777);
`lib/moments/devFixtures.test.ts` checks the names against the same pattern
as the site's banned-frames test.

| File | Source frame |
| --- | --- |
| hero_full.jpg | w0143, Zona de Combate on the plaza steps |
| door_ath.jpg | Media Archive/BullBox Media/BullBox - HYROX - 9.15/IMG_0455.JPG |
| door_coach.jpg | Media Archive/BullBox Media/BullBox - Andres - 9.16/Juan/IMG_0558.JPG |
| door_gym.jpg | BullBox/Photos/IMG_9714.JPG |
| door_os.jpg | Zona de Combate/IMG_9838.JPG (40% brightness) |
| essay_bb.jpg | Media Archive/BullBox Media/BullBox - HYROX - 9.15/IMG_0389.JPG |
| essay_zona.jpg | Zona de Combate/IMG_9792.JPG |
| essay_wil.jpg | Prof Wilbert - Zona de Combate 10.2.2026/IMG_0072.JPG |
| essay_yoga.jpg | Media Archive/Alex - Yoga - 9.18.2026/IMG_8942.JPG |
