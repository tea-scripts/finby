'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { disablePush, enablePush, getPushState, isPushSupported, type PushState } from '@/lib/push';
import { useAuth } from '@/lib/store';

function BellIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.15 : 0}
      />
      <path d="M9.5 21a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function NotifToggle({ onStateChange }: { onStateChange?: (s: PushState) => void } = {}) {
  const workspace = useAuth((s) => s.workspace);
  const [state, setState] = useState<PushState>('off');
  const [busy, setBusy] = useState(false);

  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  });

  const apply = useCallback((s: PushState) => {
    setState(s);
    onStateChangeRef.current?.(s);
  }, []);

  useEffect(() => {
    if (!isPushSupported()) {
      apply('unsupported');
      return;
    }
    getPushState()
      .then(apply)
      .catch(() => undefined);
  }, [apply]);

  if (state === 'unsupported' || !workspace) return null;

  const on = state === 'on';
  const denied = state === 'denied';
  const label = denied
    ? 'Notifications are blocked in your browser settings'
    : on
      ? 'Notifications on — click to turn off'
      : 'Enable notifications';

  async function toggle() {
    if (busy || denied || !workspace) return;
    setBusy(true);
    try {
      apply(on ? await disablePush(workspace.id) : await enablePush(workspace.id));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy || denied}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition disabled:opacity-50 ${
        on
          ? 'border-accent/50 bg-accent-soft text-accent'
          : 'border-line bg-surface text-muted hover:border-accent/40 hover:text-ink'
      }`}
    >
      <BellIcon active={on} />
    </button>
  );
}
