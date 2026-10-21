import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import en from '@/messages/en.json';
import es from '@/messages/es.json';

/** T-POLISH1 PR 4: the field components /create and /session/[id]/edit share. */
const lang = vi.hoisted(() => ({ value: 'es' as 'es' | 'en' }));
vi.mock('@/lib/LanguageContext', async () => {
  const { translations } = await import('@/lib/translations');
  return {
    useLanguage: () => ({
      language: lang.value,
      t: (key: string) => (translations[lang.value] as Record<string, string>)[key] ?? key,
    }),
  };
});
// The two pickers talk to Supabase and Leaflet; LocationFields only lays them out.
vi.mock('@/components/VenuePicker', () => ({
  default: ({ disabled }: { disabled?: boolean }) => (
    <div data-testid="venue-picker" data-disabled={String(!!disabled)} />
  ),
}));
vi.mock('@/components/LocationPicker', () => ({
  default: ({ value, error, placeholder }: { value: string; error?: string; placeholder?: string }) => (
    <div data-testid="location-picker" data-value={value} data-placeholder={placeholder}>
      {error}
    </div>
  ),
}));

import SportSelect from './SportSelect';
import { SkillLevelChips, WhoCanJoinChips, DurationChips } from './ChoiceChips';
import DateTimeFields from './DateTimeFields';
import LocationFields from './LocationFields';
import CapacityInput from './CapacityInput';
import { JoinPolicySelect, DescriptionField, EquipmentField } from './TextFields';
import PhotoHint from './PhotoHint';
import { useFieldErrorText } from './useFieldErrorText';
import { ERROR_MESSAGE_KEY } from '@/lib/sessions/sessionFormRules';
import type { UseVenuePickerResult } from '@/hooks/useVenuePicker';

beforeEach(() => {
  lang.value = 'es';
});

describe('SportSelect', () => {
  it('lists the sports in Spanish and reports the pick', () => {
    const onChange = vi.fn();
    render(<SportSelect value="" onChange={onChange} />);
    expect(screen.getByRole('option', { name: 'Boxeo' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Boxing' } });
    expect(onChange).toHaveBeenCalledWith('Boxing');
  });

  it('keeps a sport the list does not have, so an old session never changes on open', () => {
    render(<SportSelect value="Spikeball" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveValue('Spikeball');
  });

  it('shows its error', () => {
    render(<SportSelect value="" onChange={() => {}} error="El deporte es obligatorio" />);
    expect(screen.getByText('El deporte es obligatorio')).toBeInTheDocument();
  });
});

describe('choice chips', () => {
  it('level: marks the current one and reports a new one', () => {
    const onChange = vi.fn();
    render(<SkillLevelChips value="all_levels" onChange={onChange} />);
    expect(screen.getByRole('button', { name: /Todos los Niveles/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Avanzado/ }));
    expect(onChange).toHaveBeenCalledWith('advanced');
  });

  it('who can join: reports the database value, not the label', () => {
    const onChange = vi.fn();
    render(<WhoCanJoinChips value="all" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Solo Mujeres/ }));
    expect(onChange).toHaveBeenCalledWith('women_only');
  });

  it('duration: eight choices, reported in minutes', () => {
    const onChange = vi.fn();
    render(<DurationChips value={60} onChange={onChange} />);
    expect(screen.getAllByRole('button')).toHaveLength(8);
    expect(screen.getByRole('button', { name: '1h' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '1h 30m' }));
    expect(onChange).toHaveBeenCalledWith(90);
  });
});

describe('DateTimeFields', () => {
  it('passes the minimum date and reports each field', () => {
    const onDate = vi.fn();
    const onTime = vi.fn();
    const { container } = render(
      <DateTimeFields date="" startTime="" onDateChange={onDate} onStartTimeChange={onTime} minDate="2026-10-21" />
    );
    const date = container.querySelector('input[name="date"]') as HTMLInputElement;
    const time = container.querySelector('input[name="start_time"]') as HTMLInputElement;
    expect(date).toHaveAttribute('min', '2026-10-21');
    fireEvent.change(date, { target: { value: '2026-10-25' } });
    fireEvent.change(time, { target: { value: '07:00' } });
    expect(onDate).toHaveBeenCalledWith('2026-10-25');
    expect(onTime).toHaveBeenCalledWith('07:00');
  });

  it('has no minimum when the page passes none (edit, where a series template is dated in the past)', () => {
    const { container } = render(
      <DateTimeFields date="2026-09-01" startTime="06:00" onDateChange={() => {}} onStartTimeChange={() => {}} />
    );
    expect(container.querySelector('input[name="date"]')).not.toHaveAttribute('min');
  });

  it('shows the time error under the time', () => {
    render(
      <DateTimeFields
        date="2026-10-21"
        startTime="09:00"
        onDateChange={() => {}}
        onStartTimeChange={() => {}}
        startTimeError="Elige una hora que aún no haya pasado."
      />
    );
    expect(screen.getByText('Elige una hora que aún no haya pasado.')).toBeInTheDocument();
  });
});

describe('LocationFields', () => {
  it('lays out the gym search and the address picker under one label', () => {
    const venue = { selected: null, select: vi.fn(), status: null, failed: false } as unknown as UseVenuePickerResult;
    render(
      <LocationFields venue={venue} disabled value="Laureles" onChange={() => {}} error="La ubicación es obligatoria" />
    );
    expect(screen.getByText('Ubicación *')).toBeInTheDocument();
    expect(screen.getByTestId('venue-picker')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByTestId('location-picker')).toHaveAttribute('data-value', 'Laureles');
    expect(screen.getByText('La ubicación es obligatoria')).toBeInTheDocument();
  });
});

describe('CapacityInput', () => {
  it('carries the 2..500 bounds', () => {
    render(<CapacityInput value={10} onChange={() => {}} />);
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('min', '2');
    expect(input).toHaveAttribute('max', '500');
  });

  it('reports an emptied box as empty, not as a default', () => {
    const onChange = vi.fn();
    render(<CapacityInput value={10} onChange={onChange} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('');
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '120' } });
    expect(onChange).toHaveBeenLastCalledWith(120);
  });
});

describe('text fields', () => {
  it('join policy, description and equipment report their text', () => {
    const onPolicy = vi.fn();
    const onDesc = vi.fn();
    const onEquip = vi.fn();
    render(
      <>
        <JoinPolicySelect value="open" onChange={onPolicy} />
        <DescriptionField value="" onChange={onDesc} />
        <EquipmentField value="" onChange={onEquip} />
      </>
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'curated' } });
    fireEvent.change(screen.getByPlaceholderText('Describe tu sesión...'), { target: { value: 'Técnica' } });
    fireEvent.change(screen.getByPlaceholderText(/Tapete de yoga/), { target: { value: 'Guantes' } });
    expect(onPolicy).toHaveBeenCalledWith('curated');
    expect(onDesc).toHaveBeenCalledWith('Técnica');
    expect(onEquip).toHaveBeenCalledWith('Guantes');
  });
});

describe('copy', () => {
  it('the photo line says what a photo does, with no claim about bookings', () => {
    render(<PhotoHint />);
    expect(screen.getByText('Una foto ayuda a que la gente reconozca el lugar.')).toBeInTheDocument();
    lang.value = 'en';
    render(<PhotoHint />);
    expect(screen.getByText('A photo helps people recognize the place.')).toBeInTheDocument();
  });

  it('no session-form string, in either language, mentions bookings or reservations', () => {
    for (const dict of [es.sessionForm, en.sessionForm]) {
      for (const text of Object.values(dict)) expect(text).not.toMatch(/reserv|booking|book\b/i);
    }
  });

  it('every rules error has a message in both languages', () => {
    for (const key of Object.values(ERROR_MESSAGE_KEY)) {
      expect(es.sessionForm).toHaveProperty(key);
      expect(en.sessionForm).toHaveProperty(key);
    }
  });

  it('the range message names the real bounds', () => {
    const { result } = renderHook(() => useFieldErrorText());
    expect(result.current('max_participants_range')).toBe('Elige entre 2 y 500 atletas.');
    expect(result.current('start_time_past')).toBe('Elige una hora que aún no haya pasado.');
    expect(result.current(undefined)).toBeUndefined();
  });
});
