# T-MOM1 Moments: launch checklist

Moments ships dark. Everything sits behind `MOMENTS_ENABLED` (server-side;
unset means on in Preview and local dev, off in Production). The privacy lines
are not behind the flag: they ship with the merge.

## Before the merge

- [ ] Data policy v1.3: `EFFECTIVE_DATE` in
      `app/legal/tratamiento-de-datos/content.ts` and the privacy page's
      "Last Updated" in `app/legal/legalTranslations.ts` say the merge day
      (set to 2026-10-19 on the branch; change all four strings if the merge
      lands on another day).

## Launch day, in this order, all on the same day

1. [ ] Set `MOMENTS_ENABLED=true` in Vercel, Production, and redeploy.
2. [ ] The same day, move the old session recap photos into Moments
       (Al's decision: the old recap UI reads the old table until the flag is
       on, so the move waits for the flag):

       npx tsx scripts/moveRecapPhotosToMoments.ts            # dry run, read the plan
       npx tsx scripts/moveRecapPhotosToMoments.ts --apply    # then apply

3. [ ] Check, signed in as Al: a session's "Subir fotos" opens, Gestionar
       shows "Fotógrafo de esta sesión", and /profile/momentos/ opens.
4. [ ] Tag only Al's account or `is_test_account` users when trying it on
       Production. Never tag real people to test.

## Not in this launch

- Part D: "Compartir" and "Mostrar en la página de <coach>" (the viewer shows
  Compartir as "Pronto").
- Part F: open posting, video and the Momentos row
  (`MOMENTS_POSTS_ENABLED`).
