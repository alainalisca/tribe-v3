import { describe, it, expect } from 'vitest';
import { renderTemplate, extractTemplate, type InsightTemplate } from './insight-templates';

/**
 * Tests for the i18n template layer that powers community_insights.
 * Insight headlines + bodies are persisted as templates in
 * data_payload so the UI can re-render them in either language
 * without DB writes.
 */

describe('renderTemplate', () => {
  it('substitutes {name} in English headline', () => {
    const tpl: InsightTemplate = {
      key: 'churn_risk.default.headline',
      args: { name: 'Ana García' },
    };
    expect(renderTemplate(tpl, 'en')).toBe('Ana García is at risk of churning');
  });

  it('substitutes {name} in Spanish headline', () => {
    const tpl: InsightTemplate = {
      key: 'churn_risk.default.headline',
      args: { name: 'Ana García' },
    };
    expect(renderTemplate(tpl, 'es')).toBe('Ana García está en riesgo de abandonar');
  });

  it('localizes the topSignal arg via SIGNAL_LABEL', () => {
    // attendanceFrequencyDelta is a signal key; the renderer should
    // swap it for the localized label, not echo it back literally.
    const tpl: InsightTemplate = {
      key: 'churn_risk.default.body',
      args: {
        score: '0.72',
        topSignal: 'attendanceFrequencyDelta',
        topValue: '0.85',
      },
    };
    const en = renderTemplate(tpl, 'en');
    expect(en).toContain('attendance dropping off');
    expect(en).not.toContain('attendanceFrequencyDelta'); // raw key shouldn't leak
    const es = renderTemplate(tpl, 'es');
    expect(es).toContain('asistencia bajando');
  });

  it('renders the REVENUE unpaid-attendance template with name + count', () => {
    const tpl: InsightTemplate = {
      key: 'revenue.unpaid_attendance.headline',
      args: { name: 'Diego', count: 4 },
    };
    expect(renderTemplate(tpl, 'en')).toBe('Diego trained 4 times this month without paying');
  });

  it('falls back to English when a key is missing in es', () => {
    // The TEMPLATES table is dense so this is theoretical, but the
    // renderer's fallback contract is important enough to test.
    const tpl: InsightTemplate = {
      key: 'retention_opp.partner_at_risk.headline',
      args: { name: 'Carlos', partnerName: 'Ana' },
    };
    expect(renderTemplate(tpl, 'es')).toContain('Carlos');
    expect(renderTemplate(tpl, 'es')).toContain('Ana');
  });

  it('returns empty string for unknown template key', () => {
    const tpl = {
      key: 'nonexistent.key' as InsightTemplate['key'],
      args: {},
    };
    expect(renderTemplate(tpl, 'en')).toBe('');
  });

  it('leaves unknown {placeholders} in place (defensive)', () => {
    // We don't have a template with {unknownToken} but the substitute
    // function should leave any token without an arg as the literal
    // "{token}" rather than dropping it silently.
    const tpl: InsightTemplate = {
      key: 'churn_risk.default.headline',
      args: {}, // missing name
    };
    expect(renderTemplate(tpl, 'en')).toBe('{name} is at risk of churning');
  });

  it('handles numeric args by stringifying', () => {
    const tpl: InsightTemplate = {
      key: 'growth.high_fill_rate.body',
      args: { sessionLabel: 'CrossFit', fillPct: 95, weekCount: 3 },
    };
    const en = renderTemplate(tpl, 'en');
    expect(en).toContain('95%');
    expect(en).toContain('3 of the last 4');
  });
});

describe('extractTemplate', () => {
  it('reads the headline template from data_payload', () => {
    const payload = {
      template: {
        headline: { key: 'churn_risk.default.headline', args: { name: 'Ana' } },
        body: { key: 'churn_risk.default.body', args: { score: '0.7' } },
      },
      score: 0.7,
    };
    const tpl = extractTemplate(payload, 'headline');
    expect(tpl).toEqual({ key: 'churn_risk.default.headline', args: { name: 'Ana' } });
  });

  it('returns null for missing template block', () => {
    const payload = { score: 0.5 }; // pre-templates layer
    expect(extractTemplate(payload, 'headline')).toBeNull();
  });

  it('returns null for null payload', () => {
    expect(extractTemplate(null, 'headline')).toBeNull();
    expect(extractTemplate(undefined, 'headline')).toBeNull();
  });

  it('returns null for malformed template block', () => {
    expect(extractTemplate({ template: 'not-an-object' }, 'headline')).toBeNull();
    expect(extractTemplate({ template: { headline: 'no-key' } }, 'headline')).toBeNull();
    expect(extractTemplate({ template: { headline: { key: 123, args: {} } } }, 'headline')).toBeNull();
    expect(extractTemplate({ template: { headline: { key: 'x' } } }, 'headline')).toBeNull(); // missing args
  });
});
