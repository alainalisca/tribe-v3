/**
 * T-AV28 (Al's browser test, 2026-10-01). The initials an avatar shows for a
 * name: the first LETTER of up to two words. "BullBox (Prueba)" showed "B(",
 * because the old code took each word's first character and "(Prueba)" starts
 * with a bracket. A word with no letter at all ("&", "24/7") contributes nothing.
 * Letters in any script count (\p{L}), so "Ñandú Óscar" is "ÑÓ".
 */
export function initialsOf(name: string, max = 2): string {
  const letters: string[] = [];
  for (const word of name.split(/\s+/)) {
    const first = word.match(/\p{L}/u)?.[0];
    if (first) letters.push(first.toLocaleUpperCase('es'));
    if (letters.length === max) break;
  }
  return letters.join('');
}
