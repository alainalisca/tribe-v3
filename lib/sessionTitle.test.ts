import { describe, it, expect } from 'vitest';
import { sessionDisplayTitle, shortName } from './sessionTitle';

describe('shortName', () => {
  it('keeps the first two words', () => {
    expect(shortName('Salomon Tabares Adarve')).toBe('Salomon Tabares');
    expect(shortName('Darian')).toBe('Darian');
  });

  it('survives null, empty and stray whitespace', () => {
    expect(shortName(null)).toBe('');
    expect(shortName(undefined)).toBe('');
    expect(shortName('   ')).toBe('');
    expect(shortName('  Marcela   Anahata  ')).toBe('Marcela Anahata');
  });
});

describe('sessionDisplayTitle', () => {
  const base = { sportName: 'CrossFit', instructorName: 'Darian Smith', withWord: 'with' };

  it('uses the session title when there is one', () => {
    expect(sessionDisplayTitle({ ...base, title: 'Saturday Throwdown' })).toBe('Saturday Throwdown');
  });

  it('derives sport + instructor when the title is NULL', () => {
    // Every BullBox session has title = NULL; without this the share pages
    // rendered an empty element where the name belongs.
    expect(sessionDisplayTitle({ ...base, title: null })).toBe('CrossFit with Darian Smith');
  });

  it('treats a whitespace-only title as absent', () => {
    expect(sessionDisplayTitle({ ...base, title: '   ' })).toBe('CrossFit with Darian Smith');
  });

  it('translates through the words it is given', () => {
    expect(sessionDisplayTitle({ title: null, sportName: 'Yoga', instructorName: 'Marce', withWord: 'con' })).toBe(
      'Yoga con Marce'
    );
  });

  it('never ends on a dangling joining word when there is no name', () => {
    // The inline version produced "CrossFit with" here.
    expect(sessionDisplayTitle({ ...base, title: null, instructorName: null })).toBe('CrossFit');
    expect(sessionDisplayTitle({ ...base, title: null, instructorName: '  ' })).toBe('CrossFit');
  });
});
