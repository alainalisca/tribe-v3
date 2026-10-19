/**
 * T-MOM1 tests only: an in-memory stand-in for the slice of the Supabase
 * client the Moments server code uses (select / insert / update / upsert /
 * delete with eq, is, not-is-null, in, gt, gte, lt, order, maybeSingle, count
 * head, and the storage calls). It applies the filters for real, so a test can
 * prove WHICH rows a query reaches, not just that a query ran.
 */
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

export function fakeDb(tables: Record<string, Row[]>) {
  const db: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(tables)) db[k] = v.map((r) => ({ ...r }));
  const signed: string[] = [];

  function from(table: string) {
    db[table] ??= [];
    const filters: Filter[] = [];
    let op: 'select' | 'update' | 'delete' | 'insert' | 'upsert' = 'select';
    let values: Row | Row[] = {};
    let head = false;
    let count = false;
    let returning = false;
    let single: 'maybe' | 'one' | null = null;
    const orders: Array<[string, boolean]> = [];
    let conflict: string[] = [];

    const run = () => {
      const rows = db[table];
      if (op === 'insert' || op === 'upsert') {
        const list: Row[] = (Array.isArray(values) ? values : [values]).map((v) => ({ id: newId(), ...v }));
        for (const r of list) {
          const twin = conflict.length ? rows.find((x) => conflict.every((c) => x[c] === r[c])) : undefined;
          if (twin) Object.assign(twin, r);
          else rows.push(r);
        }
        return { data: returning ? list : null, error: null };
      }
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op === 'update') {
        for (const r of hit) Object.assign(r, values);
        return { data: returning ? hit.map((r) => ({ ...r })) : null, error: null };
      }
      if (op === 'delete') {
        db[table] = rows.filter((r) => !hit.includes(r));
        return { data: null, error: null };
      }
      let out = hit.map((r) => ({ ...r }));
      for (const [col, asc] of [...orders].reverse())
        out = out.sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (asc ? 1 : -1));
      if (head) return { data: null, count: out.length, error: null };
      if (single) {
        if (out.length > 1 && single === 'one') return { data: null, error: { message: 'many' } };
        return { data: out[0] ?? null, error: null };
      }
      return { data: out, count: count ? out.length : undefined, error: null };
    };

    const q = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (op !== 'select') returning = true;
        head = !!opts?.head;
        count = !!opts?.count;
        return q;
      },
      insert(v: Row | Row[]) {
        op = 'insert';
        values = v;
        return q;
      },
      upsert(v: Row | Row[], opts?: { onConflict?: string }) {
        op = 'upsert';
        values = v;
        conflict = opts?.onConflict?.split(',') ?? [];
        return q;
      },
      update(v: Row) {
        op = 'update';
        values = v;
        return q;
      },
      delete() {
        op = 'delete';
        return q;
      },
      eq(col: string, v: unknown) {
        filters.push((r) => r[col] === v);
        return q;
      },
      is(col: string, v: null) {
        filters.push((r) => (r[col] ?? null) === v);
        return q;
      },
      not(col: string, _op: 'is', _v: null) {
        filters.push((r) => (r[col] ?? null) !== null);
        return q;
      },
      in(col: string, vs: unknown[]) {
        filters.push((r) => vs.includes(r[col]));
        return q;
      },
      gt(col: string, v: string) {
        filters.push((r) => String(r[col]) > v);
        return q;
      },
      gte(col: string, v: string) {
        filters.push((r) => String(r[col]) >= v);
        return q;
      },
      lt(col: string, v: string) {
        filters.push((r) => String(r[col]) < v);
        return q;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orders.push([col, opts?.ascending !== false]);
        return q;
      },
      maybeSingle() {
        single = 'maybe';
        return Promise.resolve(run());
      },
      single() {
        single = 'one';
        return Promise.resolve(run());
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };
    return q;
  }

  const storage = {
    from: () => ({
      createSignedUrls: async (files: string[]) => {
        signed.push(...files);
        return { data: files.map((f) => ({ signedUrl: `signed:${f}` })), error: null };
      },
      createSignedUrl: async (file: string, _ttl: number, opts?: { download?: boolean }) => {
        signed.push(file);
        return { data: { signedUrl: `signed:${file}${opts?.download ? ':download' : ''}` }, error: null };
      },
      download: async () => ({ data: null, error: { message: 'no file in tests' } }),
    }),
  };

  return { client: { from, storage } as never, db, signed };
}
