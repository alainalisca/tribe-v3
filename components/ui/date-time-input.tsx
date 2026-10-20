'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/lib/LanguageContext';
import { cn } from '@/lib/utils';

type DateTimeInputProps = Omit<React.ComponentProps<'input'>, 'type' | 'value'> & {
  type: 'date' | 'time';
  value: string;
};

/**
 * A native date or time field that looks the same empty or filled.
 *
 * iPhone Safari ignores `placeholder` on these inputs and draws an empty one as
 * a blank, shorter box, with any value centred. This keeps the native picker and
 * fixes only the look: a fixed 48 px height, the value left-aligned
 * (.tribe-date-input in globals.css), 16 px text so iOS does not zoom on tap,
 * display block (Input's flex makes Chrome draw its picker icon right after
 * the text, on top of the hint, instead of at the right edge),
 * and "Elige fecha" / "Elige hora" over the field while it is empty. The hint
 * hides while the field has focus, so a desktop browser's typed segments show.
 */
const DateTimeInput = React.forwardRef<HTMLInputElement, DateTimeInputProps>(
  ({ type, value, className, onFocus, onBlur, ...props }, ref) => {
    const { t } = useLanguage();
    const [focused, setFocused] = React.useState(false);
    const showHint = !value && !focused;

    return (
      <div className="relative w-full">
        <Input
          ref={ref}
          type={type}
          value={value}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          className={cn('tribe-date-input', className, 'block h-12 py-0 text-base', showHint && 'text-transparent')}
          {...props}
        />
        {showHint && (
          <span
            aria-hidden="true"
            data-testid="date-time-hint"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base text-stone-400 md:text-sm dark:text-gray-500"
          >
            {t(type === 'date' ? 'chooseDate' : 'chooseTime')}
          </span>
        )}
      </div>
    );
  }
);
DateTimeInput.displayName = 'DateTimeInput';

export { DateTimeInput };
