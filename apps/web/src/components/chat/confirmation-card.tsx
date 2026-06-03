'use client';

import { Button } from '@/components/ui/button';
import type { PendingConfirmation } from '@/lib/types';

/** A low-confidence draft awaiting confirmation. The backend resolves these
 *  conversationally, so the buttons just send a natural-language reply. */
export function ConfirmationCard({
  confirmation,
  disabled,
  onRespond,
}: {
  confirmation: PendingConfirmation;
  disabled: boolean;
  onRespond: (reply: string) => void;
}) {
  return (
    <div className="mt-2 rounded-xl border border-warn/40 bg-warn/10 p-3.5">
      <p className="text-sm text-ink">{confirmation.question}</p>
      <div className="mt-3 flex gap-2">
        <Button
          variant="primary"
          className="px-3 py-1.5"
          disabled={disabled}
          onClick={() => onRespond('Yes, that’s correct.')}
        >
          Yes, that’s right
        </Button>
        <Button
          variant="ghost"
          className="px-3 py-1.5"
          disabled={disabled}
          onClick={() => onRespond('No, that’s not right.')}
        >
          No
        </Button>
      </div>
    </div>
  );
}
