'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatDisplayAmount } from '@/lib/formatCurrency';
import type { Currency } from '@/lib/payments/config';
import type { PriceFormInput } from './editGuards';
import type { EditSessionTranslations } from './translations';

interface PriceSectionProps {
  value: PriceFormInput;
  onChange: (next: PriceFormInput) => void;
  error: string | null;
  txt: EditSessionTranslations;
}

/** Paid-session fields for the edit form. Mirrors the create page's section. */
export default function PriceSection({ value, onChange, error, txt }: PriceSectionProps) {
  return (
    <div className="border border-theme rounded-lg p-4 bg-theme-card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-theme-primary font-semibold text-base">{txt.paidSession}</Label>
          <p className="text-xs text-theme-secondary mt-0.5">{txt.paidSessionHint}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value.is_paid}
          onClick={() => onChange({ ...value, is_paid: !value.is_paid })}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tribe-green ${value.is_paid ? 'bg-tribe-green' : 'bg-stone-400'}`}
        >
          <span
            className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white dark:bg-tribe-green shadow-lg transform transition-transform ${value.is_paid ? 'translate-x-5' : 'translate-x-0'}`}
          />
        </button>
      </div>

      {value.is_paid && (
        <div className="space-y-3 pt-2 border-t border-theme">
          <div>
            <Label className="text-theme-primary mb-2">{txt.currency}</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['COP', 'USD'] as const).map((cur) => (
                <button
                  key={cur}
                  type="button"
                  onClick={() => onChange({ ...value, currency: cur })}
                  className={`p-3 rounded-lg font-medium transition-all text-center ${value.currency === cur ? 'bg-tribe-green text-slate-900 ring-2 ring-tribe-green' : 'bg-theme-card border border-theme text-theme-primary hover:border-tribe-green'}`}
                >
                  {cur === 'COP' ? '🇨🇴 COP' : '🇺🇸 USD'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-theme-primary mb-2">
              {txt.price} ({value.currency}) *
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-secondary font-medium">$</span>
              <Input
                type="number"
                name="price_display"
                value={value.price_display}
                onChange={(e) => onChange({ ...value, price_display: e.target.value })}
                min={value.currency === 'COP' ? '20000' : '5'}
                step={value.currency === 'COP' ? '1000' : '0.01'}
                placeholder={value.currency === 'COP' ? '45000' : '15.00'}
                className={`h-auto py-3 pl-8 bg-theme-card text-theme-primary ${error ? 'border-red-500' : 'border-theme'}`}
              />
            </div>
            {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
            {value.price_display && !isNaN(parseFloat(value.price_display)) && parseFloat(value.price_display) > 0 && (
              <div className="mt-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">{txt.breakdown}</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-800 dark:text-emerald-300">{txt.athletePays}</span>
                    <span className="font-medium text-emerald-800 dark:text-emerald-300">
                      {formatDisplayAmount(Number(value.price_display), value.currency as Currency)}
                    </span>
                  </div>
                  {(() => {
                    // Round in cents, not display units, matching the server's
                    // fee math so sub-dollar prices do not show a $0.00 fee.
                    const priceCents = Math.round(Number(value.price_display) * 100);
                    const platformFeeCents = Math.round((priceCents * 15) / 100);
                    const payoutCents = priceCents - platformFeeCents;
                    return (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-theme-tertiary">{txt.platformFee}</span>
                          <span className="text-theme-tertiary">
                            -{formatDisplayAmount(platformFeeCents / 100, value.currency as Currency)}
                          </span>
                        </div>
                        <div className="border-t border-emerald-200 dark:border-emerald-700 pt-1">
                          <div className="flex justify-between text-sm font-bold">
                            <span className="text-emerald-800 dark:text-emerald-300">{txt.youEarn}</span>
                            <span className="text-emerald-800 dark:text-emerald-300">
                              {formatDisplayAmount(payoutCents / 100, value.currency as Currency)}
                            </span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          <div>
            <Label className="text-theme-primary mb-2">{txt.paymentInstructions} *</Label>
            <Textarea
              name="payment_instructions"
              value={value.payment_instructions}
              onChange={(e) => onChange({ ...value, payment_instructions: e.target.value })}
              rows={3}
              placeholder={txt.paymentInstructionsPlaceholder}
              className="py-3 bg-theme-card text-theme-primary resize-none border-theme"
            />
          </div>
        </div>
      )}
    </div>
  );
}
