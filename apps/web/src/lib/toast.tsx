'use client';

// The app's toast API. Every feature imports `toast` from here.
// sonner is imported ONLY here and in components/ui/toast.tsx — nowhere else.
//
//   import { toast } from '@/lib/toast';
//   toast.success('Settings saved');
//   toast.error('Failed to delete', 'Please try again');

import { toast as sonnerToast } from 'sonner';
import { ToastCard, TOAST_DURATION, type ToastVariant } from '@/components/ui/toast';

function show(variant: ToastVariant, title: string, description?: string): void {
  sonnerToast.custom(
    (id) => (
      <ToastCard
        variant={variant}
        title={title}
        description={description}
        onDismiss={() => sonnerToast.dismiss(id)}
      />
    ),
    { duration: TOAST_DURATION[variant] },
  );
}

export const toast = {
  success: (title: string, description?: string) => show('success', title, description),
  error: (title: string, description?: string) => show('error', title, description),
  warning: (title: string, description?: string) => show('warning', title, description),
  info: (title: string, description?: string) => show('info', title, description),
} as const;
