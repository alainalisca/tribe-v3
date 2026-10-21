// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * /my-coach carries the shared nav in every state (T-POLISH1). The page has
 * four early-return states, so the nav sits in the default export around the
 * whole content rather than in each branch.
 */
describe('/my-coach shared nav', () => {
  it('the default export renders BottomNav after the page content', () => {
    const src = readFileSync(join(__dirname, 'page.tsx'), 'utf8');
    const start = src.indexOf('export default function MyCoachPage()');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf('\n}\n', start));
    expect(body).toContain('<MyCoachContent />');
    expect(body).toContain('<BottomNav />');
    expect(src).toContain("import BottomNav from '@/components/BottomNav';");
  });
});
