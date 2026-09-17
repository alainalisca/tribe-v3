import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import InstructorProfileIncompleteBanner from './InstructorProfileIncompleteBanner';
import { getMissingInstructorFields, type InstructorField } from '@/lib/instructorProfile';

/**
 * T-AUD3: the banner rendered RAW KEYS to instructors.
 *
 * useTranslations dot-walks the NAMESPACE but its key lookup is flat
 * (lib/i18n/useTranslations.ts:78), so t('fields.photo') searched for a literal
 * key "fields.photo", missed, and fell through to `?? key`. An instructor with
 * an incomplete profile saw a bullet list reading "fields.photo",
 * "fields.bio", "fields.specialties" -- in both languages.
 *
 * THESE TESTS ASSERT ON RENDERED TEXT, NOT ON THE MESSAGES FILE. The messages
 * were always present and correct in both en and es; only the lookup was
 * broken. A test that checked messages/en.json would have passed throughout the
 * entire life of the bug.
 *
 * The real dictionaries are used deliberately -- only useLanguage is mocked --
 * so this exercises the actual lookup path rather than a fixture of it.
 */

const languageRef = { current: 'en' as 'en' | 'es' };
vi.mock('@/lib/LanguageContext', () => ({
  useLanguage: () => ({ language: languageRef.current }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

/**
 * Every value getMissingInstructorFields can emit, taken from the function
 * itself rather than retyped, so a sixth field added there fails this test
 * instead of quietly shipping a raw key.
 */
const ALL_FIELDS = getMissingInstructorFields({} as Parameters<typeof getMissingInstructorFields>[0]);

const EXPECTED: Record<'en' | 'es', Record<InstructorField, string>> = {
  en: {
    photo: 'Profile photo',
    bio: 'Bio',
    specialties: 'At least one specialty',
    location: 'Location',
    years_experience: 'Years of experience',
  },
  // NOTE: these are the strings as they exist in messages/es.json today, and
  // three of them are missing accents -- Biografia, Ubicacion, and
  // "Anos de experiencia", which should be "Años". Asserted as-is rather than
  // silently corrected here: fixing the copy is a separate change and Ana
  // reviews Spanish. If you fix the accents, this test SHOULD fail; update it
  // in the same commit.
  es: {
    photo: 'Foto de perfil',
    bio: 'Biografia',
    specialties: 'Al menos una especialidad',
    location: 'Ubicacion',
    years_experience: 'Anos de experiencia',
  },
};

function renderBanner(fields: InstructorField[], language: 'en' | 'es') {
  languageRef.current = language;
  return render(<InstructorProfileIncompleteBanner missingFields={fields} />);
}

describe('InstructorProfileIncompleteBanner field names', () => {
  it('covers every field getMissingInstructorFields can emit', () => {
    // Guards the fixture itself: if the five become six, EXPECTED goes stale
    // and every assertion below would silently stop covering the new one.
    expect(ALL_FIELDS).toHaveLength(5);
    for (const f of ALL_FIELDS) expect(EXPECTED.en[f]).toBeDefined();
  });

  for (const language of ['en', 'es'] as const) {
    describe(language, () => {
      it('renders translated names for all five fields, never raw keys', () => {
        const { container } = renderBanner(ALL_FIELDS, language);
        const list = container.querySelector('ul')!;

        for (const field of ALL_FIELDS) {
          expect(within(list).getByText(EXPECTED[language][field])).toBeInTheDocument();
        }
        // The failure this exists to catch, stated directly.
        expect(list.textContent).not.toContain('fields.');
      });

      for (const field of ALL_FIELDS) {
        it(`renders "${field}" alone as its translated name`, () => {
          // One field at a time, because the list version would still pass if
          // four resolved and one fell through to its key.
          const { container } = renderBanner([field], language);
          const list = container.querySelector('ul')!;
          expect(list.textContent?.trim()).toBe(EXPECTED[language][field]);
          expect(list.textContent).not.toContain(field.includes('_') ? `fields.${field}` : `fields.${field}`);
        });
      }
    });
  }

  it('renders nothing when the profile is complete', () => {
    const { container } = renderBanner([], 'en');
    expect(container.firstChild).toBeNull();
  });

  it('still resolves the surrounding copy from the parent namespace', () => {
    // The fix splits one hook into two; the title/description/cta must keep
    // resolving from 'instructorIncomplete' while the fields come from
    // 'instructorIncomplete.fields'.
    renderBanner(['photo'], 'en');
    expect(screen.getByText('Complete your instructor profile')).toBeInTheDocument();
    expect(screen.getByText('Finish my profile')).toBeInTheDocument();
  });
});
