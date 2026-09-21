import { describe, it, expect } from 'vitest';
import { stripJsComments } from './stripJsComments';

// The fixture token is deliberately NOT a real column name. It was
// `banner_url` at first, and lib/coverImage.singleColumn.test.ts flagged this
// file -- correctly, because a string literal is a read, not a mention. A test
// fixture should not pick a token that another guard is hunting.

describe('stripJsComments', () => {
  it('removes a line comment', () => {
    expect(stripJsComments('const a = 1; // probe_token')).not.toContain('probe_token');
  });

  it('removes a block comment, including multi-line', () => {
    expect(stripJsComments('/*\n * probe_token\n */\nconst a = 1;')).not.toContain('probe_token');
  });

  it('keeps code', () => {
    expect(stripJsComments("select('probe_token') // note")).toContain("select('probe_token')");
  });

  /** The reason this is not a regex. A `//`-to-end-of-line stripper eats the
   *  rest of any line containing a URL, hiding real code in the direction of
   *  passing. */
  it('does NOT truncate at the // inside a URL', () => {
    const src = "const u = 'https://example.com/x'; const c = 'probe_token';";
    expect(stripJsComments(src)).toContain('probe_token');
  });

  it('does not truncate at a // inside a template literal', () => {
    const src = 'const u = `https://a.b/${id}`; const c = "probe_token";';
    expect(stripJsComments(src)).toContain('probe_token');
  });

  it('does not treat an escaped quote as the end of a string', () => {
    const src = `const s = 'it\\'s // fine'; const c = 'probe_token';`;
    expect(stripJsComments(src)).toContain('probe_token');
  });

  it('a // inside ${} IS code, not a comment', () => {
    const src = 'const x = `${a // b\n}`;';
    expect(stripJsComments(src)).not.toContain('// b');
  });
});
