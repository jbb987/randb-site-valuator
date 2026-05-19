import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** Shared button styles. Use these across the Pre-Construction tool so primary
 *  CTAs, secondary actions, and ghost links don't drift in padding / color /
 *  weight from page to page.
 *
 *  Variants:
 *  - primary   — filled brand red, white text. The page's main action (Save,
 *                Review, Create).
 *  - secondary — outlined brand red, white background. Adjacent / sibling
 *                actions (View site analysis).
 *  - ghost     — muted text, red on hover. Cancel, Archive, dismissive links. */
const VARIANTS: Record<Variant, string> = {
  primary:
    'rounded-lg bg-[#ED202B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#9B0E18] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed',
  secondary:
    'rounded-lg bg-white text-[#ED202B] border border-[#ED202B] px-4 py-2 text-sm font-semibold transition hover:bg-[#ED202B]/5 disabled:opacity-50 disabled:cursor-not-allowed',
  ghost:
    'rounded-lg px-3 py-2 text-sm font-medium text-[#7A756E] transition hover:text-[#ED202B] disabled:opacity-50 disabled:cursor-not-allowed',
};

export default function Button({
  variant = 'primary',
  type = 'button',
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 ${VARIANTS[variant]} ${className ?? ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}
