import type { CommunityEditableFields } from '@/lib/dal/communities';

/** What the edit form holds. Text inputs are strings; '' means "none". */
export interface CommunityEditDraft {
  name: string;
  description: string;
  sport: string;
  location_name: string;
  location_lat: number | null;
  location_lng: number | null;
  is_private: boolean;
}

/** Row to form. Every field comes from the loaded row, never from a default. */
export function draftFromCommunity(row: CommunityEditableFields): CommunityEditDraft {
  return {
    name: row.name,
    description: row.description ?? '',
    sport: row.sport ?? '',
    location_name: row.location_name ?? '',
    location_lat: row.location_lat,
    location_lng: row.location_lng,
    is_private: row.is_private,
  };
}

/** Form to column values, with the same normalisation the save uses. */
export function normaliseDraft(draft: CommunityEditDraft): CommunityEditableFields {
  const locationName = draft.location_name.trim();
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    sport: draft.sport || null,
    location_name: locationName || null,
    // No place, no coordinates: a cleared location must not leave a pin behind.
    location_lat: locationName ? draft.location_lat : null,
    location_lng: locationName ? draft.location_lng : null,
    is_private: draft.is_private,
  };
}

/**
 * Only the columns that actually changed. An untouched field is ABSENT from
 * the patch, not re-sent with its loaded value, so a save can never overwrite
 * something that changed elsewhere while the form was open, and an empty
 * patch makes no request at all.
 */
export function buildCommunityPatch(
  original: CommunityEditableFields,
  draft: CommunityEditDraft
): Partial<CommunityEditableFields> {
  const next = normaliseDraft(draft);
  const patch: Partial<CommunityEditableFields> = {};
  (Object.keys(next) as Array<keyof CommunityEditableFields>).forEach((key) => {
    if (next[key] !== original[key]) {
      (patch as Record<keyof CommunityEditableFields, unknown>)[key] = next[key];
    }
  });
  return patch;
}
