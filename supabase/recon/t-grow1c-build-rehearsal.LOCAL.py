#!/usr/bin/env python3
"""
Build supabase/rehearsals/214_t_grow1_signup_attribution_REHEARSAL.sql from
supabase/recon/214_REHEARSAL.template.sql.

Three splices, all VERBATIM from the migration file, never retyped:
  @@MIGRATION_BODY@@  everything between the migration's top-level BEGIN; and
                      its "Record this migration as applied" marker, which is
                      the exact slice supabase/rehearsalBodyVerbatim.test.ts
                      requires the rehearsal to contain.
  @@GUARD_DO_BLOCK@@  the migration's final DO $$ ... END $$; block, which Part
                      D runs against five mutations via EXECUTE.
  @@COMMENT_213@@     213's COMMENT ON TABLE attribution_events, which D4
                      restores. The real text, because it contains "v1.1" and
                      a lookalike that did not is how a vacuous guard passed.

Every splice asserts it landed exactly once, and the output is read back and
compared. CLAUDE.md: a replace that matches nothing is silent, so the driver
must check the edit happened rather than infer it.

Usage:  python3 supabase/recon/t-grow1c-build-rehearsal.LOCAL.py
"""
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MIGRATION = REPO / 'supabase/migrations/214_t_grow1_signup_attribution.sql'
TEMPLATE = REPO / 'supabase/recon/214_REHEARSAL.template.sql'
OUT = REPO / 'supabase/rehearsals/214_t_grow1_signup_attribution_REHEARSAL.sql'
RECORD_MARKER = '-- ── Record this migration as applied'

mig = MIGRATION.read_text()
tpl = TEMPLATE.read_text()

begin = re.search(r'^BEGIN;[ \t]*\n', mig, re.M)
assert begin, 'migration has no top-level BEGIN;'
end = mig.index(RECORD_MARKER)
body = mig[begin.end():end].strip('\n')
assert 'CREATE TRIGGER users_signup_attribution_guard' in body and '214 ABORTED' in body

guard_start = mig.rindex('\nDO $$', 0, end) + 1
guard_end = mig.index('END $$;', guard_start) + len('END $$;')
guard = mig[guard_start:guard_end]
assert guard.startswith('DO $$') and guard.endswith('END $$;') and '214 ABORTED' in guard
assert '$guard$' not in guard, 'the guard contains the quote tag used to embed it'

m213 = (REPO / 'supabase/migrations/213_t_grow1_attribution_events.sql').read_text()
c_start = m213.index('COMMENT ON TABLE public.attribution_events IS')
c213 = m213[c_start:m213.index(';', c_start) + 1]
assert 'v1.1' in c213, '213 comment no longer has the text D4 exists to restore'

for marker in ('-- @@MIGRATION_BODY@@', '@@GUARD_DO_BLOCK@@', '@@COMMENT_213@@'):
    assert tpl.count(marker) == 1, f'{marker} appears {tpl.count(marker)} times in the template'
out = (tpl.replace('-- @@MIGRATION_BODY@@', body).replace('@@GUARD_DO_BLOCK@@', guard)
       .replace('@@COMMENT_213@@', c213))
assert body in out and guard in out and c213 in out and '@@' not in out

OUT.write_text(out)
assert OUT.read_text() == out
print(f'wrote {OUT.relative_to(REPO)}: body {len(body)} chars, guard {len(guard)} chars')
