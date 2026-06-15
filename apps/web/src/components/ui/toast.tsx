'use client';

// Brand-native toast system for out-of-chat UI feedback (edits, deletes, saves,
// dismissals). The chat flow has its own action-card feedback — do NOT toast there.
//
// Usage:
//   import { toast } from '@/lib/toast';
//
//   toast.success('Transaction updated')
//   toast.success('Budget saved', 'Your dining budget has been updated to ₱5,000')
//   toast.error('Failed to delete', 'Please try again')
//   toast.warning('Heads up', 'This action cannot be undone')
//   toast.info('Export ready', 'Your CSV is downloading')
//
// sonner is imported ONLY here and in lib/toast.tsx — never anywhere else.

import { CheckCircle, Info, Warning, X, XCircle, type Icon } from '@phosphor-icons/react';
import { Toaster as SonnerToaster } from 'sonner';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

/** Per-variant icon, icon color token, and left-accent-bar color token. */
const VARIANT_CONFIG: Record<
  ToastVariant,
  { Glyph: Icon; iconClass: string; barClass: string; label: string }
> = {
  success: { Glyph: CheckCircle, iconClass: 'text-success', barClass: 'bg-success', label: 'Success' },
  error: { Glyph: XCircle, iconClass: 'text-danger', barClass: 'bg-danger', label: 'Error' },
  warning: { Glyph: Warning, iconClass: 'text-warn', barClass: 'bg-warn', label: 'Warning' },
  info: { Glyph: Info, iconClass: 'text-accent', barClass: 'bg-accent', label: 'Information' },
};

export interface ToastCardProps {
  variant: ToastVariant;
  title: string;
  description?: string;
  onDismiss?: () => void;
}

/** The fully custom toast card. Rendered via sonner's `toast.custom` so none of
 *  sonner's default chrome shows through (the Toaster is `unstyled`). */
export function ToastCard({ variant, title, description, onDismiss }: ToastCardProps) {
  const { Glyph, iconClass, barClass, label } = VARIANT_CONFIG[variant];
  return (
    <div
      role="status"
      className="animate-fade-up relative flex w-full max-w-[360px] items-start gap-3 overflow-hidden rounded-xl border border-line bg-surface-2 px-4 py-3.5 font-sans text-sm text-ink shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
    >
      {/* Left accent bar */}
      <div className={`absolute bottom-3 left-0 top-3 w-[3px] rounded-full ${barClass}`} aria-hidden="true" />

      <Glyph
        size={18}
        weight="fill"
        aria-label={label}
        data-testid={`toast-icon-${variant}`}
        className={`mt-0.5 shrink-0 ${iconClass}`}
      />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-ink">{title}</p>
        {description ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p> : null}
      </div>

      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="mt-0.5 shrink-0 rounded-md p-0.5 text-faint transition-colors hover:bg-white/5 hover:text-ink"
        >
          <X size={16} weight="bold" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/** Per-variant auto-dismiss durations (ms). Errors linger longest. */
export const TOAST_DURATION = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000,
} as const;

/** Mount once at the app root (see app/layout.tsx). `unstyled` strips sonner's
 *  default card so our custom ToastCard is the only visible surface. */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      gap={8}
      visibleToasts={3}
      toastOptions={{ unstyled: true }}
    />
  );
}
