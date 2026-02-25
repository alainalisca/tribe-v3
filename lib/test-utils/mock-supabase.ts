// Creates a chainable mock that mimics supabase.from().select().eq().single() etc.
// Each method returns the mock itself for chaining, except terminal methods which return data.

interface TableConfig {
  data?: unknown[] | null;
  error?: { message: string } | null;
  count?: number | null;
  // For single() — returns first item from data
  // For maybeSingle() — returns first item or null
  // For default — returns full data array
}

interface MockSupabaseConfig {
  [table: string]: TableConfig;
}

function createChainableMock(config: TableConfig, insertOverride?: TableConfig) {
  const resolvedData = config.data ?? null;
  const resolvedError = config.error ?? null;
  const resolvedCount = config.count ?? null;

  const terminalResult = {
    data: resolvedData,
    error: resolvedError,
    count: resolvedCount,
  };

  const chain: Record<string, unknown> = {};

  // Terminal methods
  chain.single = async () => ({
    data: Array.isArray(resolvedData) ? resolvedData[0] ?? null : resolvedData,
    error: resolvedError,
  });

  chain.maybeSingle = async () => ({
    data: Array.isArray(resolvedData) ? resolvedData[0] ?? null : resolvedData,
    error: resolvedError,
  });

  // Chaining methods — each returns the chain itself
  chain.eq = () => chain;
  chain.neq = () => chain;
  chain.in = () => chain;
  chain.gte = () => chain;
  chain.gt = () => chain;
  chain.lte = () => chain;
  chain.lt = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;

  // select can be called with options (for count queries) or columns
  chain.select = (_columns?: string, options?: { count?: string; head?: boolean }) => {
    if (options?.count === 'exact') {
      // Count query — return count at the chain level and also through .eq() etc.
      const countChain = { ...chain };
      // Override terminal to return count
      countChain.eq = () => countChain;
      countChain.then = (resolve: (value: unknown) => void) =>
        resolve({ count: resolvedCount, error: resolvedError });
      // Make it thenable for await
      return countChain;
    }
    return chain;
  };

  // insert returns a chain that supports .select().single()
  chain.insert = () => {
    if (insertOverride) {
      return createChainableMock(insertOverride);
    }
    return createChainableMock({ data: [{ id: 'new-id' }], error: resolvedError });
  };

  // update returns a chain with .eq()
  chain.update = () => chain;

  // delete returns a chain with .eq()
  chain.delete = () => chain;

  // Make the chain itself thenable for when people await the chain directly
  chain.then = (resolve: (value: unknown) => void) => resolve(terminalResult);

  return chain;
}

export function createMockSupabase(config: MockSupabaseConfig) {
  return {
    from: (table: string) => {
      const tableConfig = config[table] || { data: null, error: null };
      return createChainableMock(tableConfig);
    },
  };
}
