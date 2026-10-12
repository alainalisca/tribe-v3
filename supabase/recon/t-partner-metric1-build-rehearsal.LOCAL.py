#!/usr/bin/env python3
"""
Build supabase/rehearsals/217_t_partner_metric1_increment_partner_metric_REHEARSAL.sql from
supabase/recon/217_REHEARSAL.template.sql. Same construction as
t-grow2-build-rehearsal.LOCAL.py (215): two splices, both VERBATIM from the
migration, each asserted to land exactly once, output read back and compared.
  @@MIGRATION_BODY@@  BEGIN; .. "Record this migration as applied" (the slice
                      rehearsalBodyVerbatim.test.ts requires)
  @@GUARD_DO_BLOCK@@  the final DO $$ ... END $$; block, run by Part D

Usage:  python3 supabase/recon/t-partner-metric1-build-rehearsal.LOCAL.py
"""
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MIGRATION = REPO / 'supabase/migrations/217_t_partner_metric1_increment_partner_metric.sql'
TEMPLATE = REPO / 'supabase/recon/217_REHEARSAL.template.sql'
OUT = REPO / 'supabase/rehearsals/217_t_partner_metric1_increment_partner_metric_REHEARSAL.sql'
RECORD_MARKER = '-- ── Record this migration as applied'

mig = MIGRATION.read_text()
tpl = TEMPLATE.read_text()
begin = re.search(r'^BEGIN;[ \t]*\n', mig, re.M)
assert begin, 'migration has no top-level BEGIN;'
end = mig.index(RECORD_MARKER)
body = mig[begin.end():end].strip('\n')
guard_start = mig.rindex('\nDO $$', 0, end) + 1
guard = mig[guard_start:mig.index('END $$;', guard_start) + len('END $$;')]
assert '217 ABORTED' in body and guard.startswith('DO $$') and guard.endswith('END $$;')
assert '$guard$' not in guard
for marker in ('-- @@MIGRATION_BODY@@', '@@GUARD_DO_BLOCK@@'):
    assert tpl.count(marker) == 1, f'{marker} appears {tpl.count(marker)} times'
out = tpl.replace('-- @@MIGRATION_BODY@@', body).replace('@@GUARD_DO_BLOCK@@', guard)
assert body in out and guard in out and '@@' not in out
OUT.write_text(out)
assert OUT.read_text() == out
print(f'wrote {OUT.relative_to(REPO)}: body {len(body)} chars, guard {len(guard)} chars')
