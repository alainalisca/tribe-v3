import { describe, it, expect } from 'vitest';
import {
  MIN_REVIEWS_FOR_RATING,
  coachPath,
  partnerPath,
  publicPassHref,
  ratingToShow,
  reviewerDisplayName,
  signInHref,
} from './publicProfile';

describe('a reviewer on a public page: first name + last initial (Al, 2026-10-22)', () => {
  it.each([
    ['María José Gómez', 'María G.'],
    ['Ana Pérez', 'Ana P.'],
    ['  carlos   ruiz  ', 'carlos R.'],
    ['Ana', 'Ana'],
    ['Óscar Úsuga', 'Óscar Ú.'],
    ['Lucía de la Torre', 'Lucía T.'],
  ])('%s → %s', (name, shown) => {
    expect(reviewerDisplayName(name, 'Atleta')).toBe(shown);
  });

  it('never shows an email, an empty name or a missing one', () => {
    expect(reviewerDisplayName('ana.perez@gmail.com', 'Atleta')).toBe('Atleta');
    expect(reviewerDisplayName('   ', 'Atleta')).toBe('Atleta');
    expect(reviewerDisplayName(null, 'Athlete')).toBe('Athlete');
  });

  it('never contains the full surname', () => {
    expect(reviewerDisplayName('María José Gómez', 'Atleta')).not.toContain('Gómez');
    expect(reviewerDisplayName('María José Gómez', 'Atleta')).not.toContain('José');
  });
});

describe('the star average only from 3 reviews up', () => {
  it('is null below the threshold', () => {
    expect(MIN_REVIEWS_FOR_RATING).toBe(3);
    expect(ratingToShow(0, 0)).toBeNull();
    expect(ratingToShow(1, 5)).toBeNull();
    expect(ratingToShow(2, 4.5)).toBeNull();
  });

  it('shows one decimal from 3', () => {
    expect(ratingToShow(3, 4.666)).toBe(4.7);
    expect(ratingToShow(12, 5)).toBe(5);
  });
});

describe("the pass link from a public page keeps the visit's attribution", () => {
  it("carries this page's src, code, ref and utm_* and nothing else", () => {
    expect(publicPassHref('bullbox', '?src=poster&code=BULLBOX-01&utm_campaign=oct&tab=x&foo=1')).toBe(
      '/pase/bullbox/?src=poster&code=BULLBOX-01&utm_campaign=oct'
    );
    expect(publicPassHref('bullbox', '?ref=ANA7&utm_source=ig&utm_medium=story&utm_content=a')).toBe(
      '/pase/bullbox/?ref=ANA7&utm_source=ig&utm_medium=story&utm_content=a'
    );
  });

  it('is the plain link with no tags (the pass form then uses the last touch), never src=app', () => {
    expect(publicPassHref('bullbox', '')).toBe('/pase/bullbox/');
    expect(publicPassHref('bullbox', '?tab=sessions')).toBe('/pase/bullbox/');
    expect(publicPassHref('bull box', '?src=x')).toBe('/pase/bull%20box/?src=x');
  });
});

describe('sign-in links', () => {
  it('return to the path they came from', () => {
    expect(signInHref('/messages/?user=abc')).toBe('/auth/?returnTo=%2Fmessages%2F%3Fuser%3Dabc');
    expect(signInHref('/i/andres/')).toBe('/auth/?returnTo=%2Fi%2Fandres%2F');
  });
});

describe('in-app links to a coach or a gym (T-POLISH1 PR 3b-2)', () => {
  it('a coach is /i/<account>/', () => {
    expect(coachPath('11111111-1111-4111-8111-111111111111')).toBe('/i/11111111-1111-4111-8111-111111111111/');
  });

  it('a gym or studio is /g/<slug>/, or /g/<id>/ without one', () => {
    expect(partnerPath({ id: 'p1', slug: 'bullbox', business_type: 'gym', user_id: 'u1' })).toBe('/g/bullbox/');
    expect(partnerPath({ id: 'p2', slug: 'zen', business_type: 'studio', user_id: 'u2' })).toBe('/g/zen/');
    expect(partnerPath({ id: 'p3', slug: null, business_type: 'gym', user_id: 'u3' })).toBe('/g/p3/');
  });

  it('an independent trainer is a person: /i/<account>/ (partners_public leaves independents out of /g)', () => {
    expect(partnerPath({ id: 'p4', slug: 'salo', business_type: 'independent', user_id: 'u4' })).toBe('/i/u4/');
    expect(partnerPath({ id: 'p5', slug: 'x', business_type: 'independent', user_id: null })).toBeNull();
  });
});
