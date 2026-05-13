'use client';

/**
 * Tribe.OS Input — single-line form input with optional label, error
 * state, and helper text.
 *
 * Ported from the sibling tribe-os codebase. Uses the canonical
 * border-2 + tribe-green focus ring rather than the consumer
 * shadcn Input.
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, type = 'text', id, ...props }, ref) => {
    // Stable id derivation: prefer caller-provided id, else use the
    // name attribute, else a deterministic ssr-safe random.
    const fallbackId = React.useId();
    const inputId = id || fallbackId;

    return (
      <div className="flex flex-col gap-1">
        {label ? (
          <label htmlFor={inputId} className="text-sm font-semibold text-tribe-dark">
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          type={type}
          className={cn(
            'px-4 py-2 text-base rounded-tribe',
            'border-2 border-tribe-dark-40',
            'bg-white text-tribe-dark',
            'placeholder-tribe-dark-60',
            'focus:outline-none focus:border-tribe-green focus:ring-1 focus:ring-tribe-green-50',
            'disabled:bg-tribe-dark-40 disabled:cursor-not-allowed disabled:text-tribe-dark-80',
            error ? 'border-tribe-danger focus:border-tribe-danger focus:ring-red-100' : '',
            className
          )}
          {...props}
        />
        {error ? <span className="text-xs text-tribe-danger">{error}</span> : null}
        {helperText && !error ? <span className="text-xs text-tribe-dark-80">{helperText}</span> : null}
      </div>
    );
  }
);

Input.displayName = 'TribeInput';

export default Input;
