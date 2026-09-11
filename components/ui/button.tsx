import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

/**
 * Defaults to type="button". Pass type="submit" explicitly on a form's submit
 * control.
 *
 * HTML defaults a typeless <button> inside a <form> to type="submit", which
 * makes every unlabelled control a submit control the moment it is composed
 * into a form. That shipped on 2026-09-11: a day-of-week toggle in the
 * recurring picker published the session on the first click, and the venue
 * request reached the gym twice.
 *
 * Inverting the default removes the class rather than policing it. A forgotten
 * type now fails LOUDLY in development -- the form does not submit, which is
 * immediately visible -- instead of silently submitting early, which is the
 * failure mode that reached production.
 *
 * Changed at the one moment it is safe: a scan of every <form> in the app found
 * zero untyped <Button> inside one, so no call site relies on the old default.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    // asChild renders whatever child was passed -- frequently a Link or an
    // anchor, where `type` is invalid HTML -- so the default applies only to a
    // real <button>. An explicit type is still forwarded either way.
    const resolvedType = asChild ? type : (type ?? 'button');
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...(resolvedType === undefined ? {} : { type: resolvedType })}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
