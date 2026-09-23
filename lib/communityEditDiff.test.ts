import { describe, it, expect } from 'vitest';
import { buildCommunityPatch, draftFromCommunity, normaliseDraft } from './communityEditDiff';
import type { CommunityEditableFields } from '@/lib/dal/communities';

const ROW: CommunityEditableFields = {
  name: 'Runners Laureles',
  description: 'Salimos los martes',
  sport: 'Running',
  location_name: 'Laureles, Medellín',
  location_lat: 6.2447,
  location_lng: -75.5896,
  is_private: false,
};

describe('the edit form prefills from the row and sends only what changed', () => {
  it('an untouched form produces an empty patch, so Save makes no request', () => {
    expect(buildCommunityPatch(ROW, draftFromCommunity(ROW))).toEqual({});
  });

  // The storefront sports near miss: a field the form never loaded, sent as
  // its empty default, wipes a value set somewhere else.
  it('a row with nulls round-trips through the form without writing anything', () => {
    const sparse: CommunityEditableFields = {
      name: 'x',
      description: null,
      sport: null,
      location_name: null,
      location_lat: null,
      location_lng: null,
      is_private: true,
    };
    expect(buildCommunityPatch(sparse, draftFromCommunity(sparse))).toEqual({});
  });

  it('changing one field sends exactly that field', () => {
    const draft = { ...draftFromCommunity(ROW), description: 'Salimos los jueves' };
    expect(buildCommunityPatch(ROW, draft)).toEqual({ description: 'Salimos los jueves' });
  });

  it('whitespace-only edits are not changes', () => {
    const draft = { ...draftFromCommunity(ROW), name: '  Runners Laureles  ' };
    expect(buildCommunityPatch(ROW, draft)).toEqual({});
  });

  it('clearing the description sends null, not an empty string', () => {
    const draft = { ...draftFromCommunity(ROW), description: '   ' };
    expect(buildCommunityPatch(ROW, draft)).toEqual({ description: null });
  });

  it('choosing no sport sends null', () => {
    const draft = { ...draftFromCommunity(ROW), sport: '' };
    expect(buildCommunityPatch(ROW, draft)).toEqual({ sport: null });
  });

  it('clearing the location also clears its coordinates', () => {
    const draft = { ...draftFromCommunity(ROW), location_name: '' };
    expect(buildCommunityPatch(ROW, draft)).toEqual({
      location_name: null,
      location_lat: null,
      location_lng: null,
    });
  });

  it('a new place with coordinates sends all three', () => {
    const draft = {
      ...draftFromCommunity(ROW),
      location_name: 'El Poblado',
      location_lat: 6.2088,
      location_lng: -75.5679,
    };
    expect(buildCommunityPatch(ROW, draft)).toEqual({
      location_name: 'El Poblado',
      location_lat: 6.2088,
      location_lng: -75.5679,
    });
  });

  it('toggling privacy sends is_private', () => {
    const draft = { ...draftFromCommunity(ROW), is_private: true };
    expect(buildCommunityPatch(ROW, draft)).toEqual({ is_private: true });
  });

  it('normalises the name by trimming it', () => {
    expect(normaliseDraft({ ...draftFromCommunity(ROW), name: '  Nuevo  ' }).name).toBe('Nuevo');
  });
});
