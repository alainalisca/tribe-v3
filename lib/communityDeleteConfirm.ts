/**
 * The browser half of the typed-name confirmation. soft_delete_community()
 * enforces the same rule on the server (btrim, then exact, case-sensitive
 * match), so this only decides when the button lights up. It must never be
 * looser than the server, or the button would enable for a name the database
 * then refuses.
 */
export function typedNameMatches(typed: string, communityName: string): boolean {
  const a = typed.trim();
  return a.length > 0 && a === communityName.trim();
}
