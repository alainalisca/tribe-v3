import { describe, it, expect } from 'vitest';
import { renderTemplate, type InsightTemplateKey, type InsightTemplate } from './insight-templates';

/**
 * Contract tests — protect invariants the rest of the codebase
 * depends on. These don't test specific copy or behavior; they
 * assert structural promises that would silently break the user
 * experience if violated.
 *
 * Specifically: every template key MUST resolve to non-empty text
 * in both `en` and `es`. If anyone adds a new key to the union but
 * forgets to add the Spanish translation, this test fails.
 */

// The full union of valid template keys. Update this when adding
// new keys to InsightTemplateKey in insight-templates.ts — TS will
// scream if a literal here drifts from the actual type.
const ALL_KEYS: InsightTemplateKey[] = [
  'churn_risk.default.headline',
  'churn_risk.default.body',
  'churn_risk.no_signals.body',
  'retention_opp.partner_at_risk.headline',
  'retention_opp.partner_at_risk.body',
  'revenue.unpaid_attendance.headline',
  'revenue.unpaid_attendance.body',
  'growth.high_fill_rate.headline',
  'growth.high_fill_rate.body',
];

// Stub args covering every {placeholder} any template might use.
// renderTemplate substitutes only what's needed and ignores extras,
// so passing the union is fine.
const STUB_ARGS = {
  name: 'Test Member',
  partnerName: 'Test Partner',
  score: '0.72',
  topSignal: 'attendanceFrequencyDelta',
  topValue: '0.85',
  count: 4,
  amount: '$80.00',
  sessionLabel: 'CrossFit',
  fillPct: 95,
  weekCount: 3,
};

describe('insight-templates contract', () => {
  it.each(ALL_KEYS)('renders %s in English to non-empty text', (key) => {
    const tpl: InsightTemplate = { key, args: STUB_ARGS };
    const rendered = renderTemplate(tpl, 'en');
    expect(rendered).toBeTruthy();
    expect(rendered.length).toBeGreaterThan(5);
  });

  it.each(ALL_KEYS)('renders %s in Spanish to non-empty text', (key) => {
    const tpl: InsightTemplate = { key, args: STUB_ARGS };
    const rendered = renderTemplate(tpl, 'es');
    expect(rendered).toBeTruthy();
    expect(rendered.length).toBeGreaterThan(5);
  });

  it.each(ALL_KEYS)('leaves no unresolved {placeholders} in %s (en)', (key) => {
    const rendered = renderTemplate({ key, args: STUB_ARGS }, 'en');
    // An unresolved placeholder would surface as `{token}` in the
    // output. If we see one, the test exposed it — either STUB_ARGS
    // is missing a key, or the template references an unknown arg.
    expect(rendered).not.toMatch(/\{[a-zA-Z_]+\}/);
  });

  it.each(ALL_KEYS)('leaves no unresolved {placeholders} in %s (es)', (key) => {
    const rendered = renderTemplate({ key, args: STUB_ARGS }, 'es');
    expect(rendered).not.toMatch(/\{[a-zA-Z_]+\}/);
  });

  it('en and es renders for the same key produce distinct strings (no copy-paste drift)', () => {
    // If someone accidentally pastes the English copy into the
    // Spanish slot, this catches it. Allowed exception: gym-name-
    // only keys that might genuinely be identical across languages.
    // We skip the structural test for those — the assertion is "if
    // a key has body text, it should differ between locales."
    for (const key of ALL_KEYS) {
      const en = renderTemplate({ key, args: STUB_ARGS }, 'en');
      const es = renderTemplate({ key, args: STUB_ARGS }, 'es');
      expect(es, `${key} should have a distinct Spanish translation`).not.toBe(en);
    }
  });
});
