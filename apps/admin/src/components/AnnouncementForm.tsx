'use client';

import { useState } from 'react';
import type {
  AdminAnnouncement,
  AdminAnnouncementInput,
  AnnouncementStepView,
  LottieAsset,
} from '@finby/shared';
import { Button } from './ui/button';
import { DatePicker } from './ui/date-picker';
import { Dropdown } from './ui/dropdown';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { Toggle } from './ui/toggle';

/** A stored timestamp ('2026-07-01T00:00:00.000Z') → the date-only value the
 *  picker uses ('2026-07-01'). */
function toDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

/** A picked date ('2026-07-01') → a UTC-midnight ISO timestamp, or null. */
function toTimestamp(date: string): string | null {
  return date ? `${date}T00:00:00.000Z` : null;
}

interface Props {
  assets: LottieAsset[];
  initial?: AdminAnnouncement;
  onSubmit: (input: AdminAnnouncementInput) => Promise<void>;
  onCancel: () => void;
}

const MODE_OPTS = [
  { value: 'SIMPLE', label: 'Simple' },
  { value: 'STEPS', label: 'Steps' },
];
const STATUS_OPTS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
];
const KIND_OPTS = [
  { value: 'DISMISS', label: 'Dismiss' },
  { value: 'ENABLE_PUSH', label: 'Enable push' },
];
const TIER_OPTS = [
  { value: '', label: 'Everyone' },
  { value: 'FREE', label: 'Free' },
  { value: 'PRO', label: 'Pro' },
  { value: 'PREMIUM', label: 'Premium' },
  { value: 'FAMILY', label: 'Family' },
];

export function AnnouncementForm({ assets, initial, onSubmit, onCancel }: Props) {
  const [key, setKey] = useState(initial?.key ?? '');
  const [status, setStatus] = useState<AdminAnnouncementInput['status']>(
    initial?.status ?? 'DRAFT',
  );
  const [mode, setMode] = useState<AdminAnnouncementInput['mode']>(initial?.mode ?? 'SIMPLE');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [lottieKey, setLottieKey] = useState(initial?.lottieKey ?? '');
  const [hashtag, setHashtag] = useState(initial?.hashtag ?? '');
  const [confetti, setConfetti] = useState(initial?.confetti ?? false);
  const [steps, setSteps] = useState<AnnouncementStepView[]>(initial?.steps ?? []);
  const [primaryLabel, setPrimaryLabel] = useState(initial?.primaryLabel ?? '');
  const [primaryKind, setPrimaryKind] = useState<AdminAnnouncementInput['primaryKind']>(
    initial?.primaryKind ?? 'DISMISS',
  );
  const [targetTier, setTargetTier] = useState<string>(initial?.targetTier ?? '');
  const [order, setOrder] = useState(String(initial?.order ?? 0));
  const [publishAt, setPublishAt] = useState(toDateInput(initial?.publishAt));
  const [expiresAt, setExpiresAt] = useState(toDateInput(initial?.expiresAt));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const lottieOpts = [
    { value: '', label: 'None' },
    ...assets.map((a) => ({ value: a.key, label: a.label })),
  ];

  function setStep(i: number, patch: Partial<AnnouncementStepView>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function handleSave() {
    if (!key.trim()) {
      setError('Key is required');
      return;
    }
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!body.trim()) {
      setError('Body is required');
      return;
    }
    if (!primaryLabel.trim()) {
      setError('Primary button label is required');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await onSubmit({
        key: key.trim(),
        status,
        mode,
        title: title.trim(),
        body: body.trim(),
        emoji: emoji.trim() || null,
        lottieKey: lottieKey || null,
        hashtag: hashtag.trim() || null,
        confetti,
        steps: mode === 'STEPS' ? steps : null,
        primaryLabel: primaryLabel.trim(),
        primaryKind,
        targetTier: targetTier ? (targetTier as AdminAnnouncementInput['targetTier']) : null,
        order: Number(order) || 0,
        publishAt: toTimestamp(publishAt),
        expiresAt: toTimestamp(expiresAt),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-danger">{error}</p>}

      <Field label="Key" htmlFor="ann-key">
        <Input id="ann-key" value={key} onChange={(e) => setKey(e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Status" htmlFor="ann-status">
          <Dropdown
            id="ann-status"
            aria-label="Status"
            value={status}
            options={STATUS_OPTS}
            onChange={(v) => setStatus(v as AdminAnnouncementInput['status'])}
          />
        </Field>
        <Field label="Mode" htmlFor="ann-mode">
          <Dropdown
            id="ann-mode"
            aria-label="Mode"
            value={mode}
            options={MODE_OPTS}
            onChange={(v) => setMode(v as AdminAnnouncementInput['mode'])}
          />
        </Field>
      </div>

      <Field label="Title" htmlFor="ann-title">
        <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>

      <Field label="Body" htmlFor="ann-body">
        <Input id="ann-body" value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Emoji" htmlFor="ann-emoji">
          <Input id="ann-emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
        </Field>
        <Field label="Hashtag" htmlFor="ann-hashtag">
          <Input id="ann-hashtag" value={hashtag} onChange={(e) => setHashtag(e.target.value)} />
        </Field>
      </div>

      <Field label="Lottie animation" htmlFor="ann-lottie">
        <Dropdown
          id="ann-lottie"
          aria-label="Lottie animation"
          value={lottieKey}
          options={lottieOpts}
          onChange={setLottieKey}
        />
      </Field>

      <div className="flex items-center gap-3">
        <Toggle checked={confetti} onChange={setConfetti} label="Confetti" />
        <span className="text-sm text-muted">Confetti burst on open</span>
      </div>

      {mode === 'STEPS' && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink">Steps</p>
          {steps.map((s, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <Input
                aria-label={`Step ${i + 1} label`}
                value={s.label}
                onChange={(e) => setStep(i, { label: e.target.value })}
              />
              <div className="flex gap-2">
                <Input
                  aria-label={`Step ${i + 1} caption`}
                  value={s.caption}
                  onChange={(e) => setStep(i, { caption: e.target.value })}
                />
                <Button
                  variant="ghost"
                  onClick={() => setSteps((p) => p.filter((_, idx) => idx !== i))}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <Button variant="ghost" onClick={() => setSteps((p) => [...p, { label: '', caption: '' }])}>
            Add step
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Primary button label" htmlFor="ann-primary-label">
          <Input
            id="ann-primary-label"
            value={primaryLabel}
            onChange={(e) => setPrimaryLabel(e.target.value)}
          />
        </Field>
        <Field label="Primary action" htmlFor="ann-primary-kind">
          <Dropdown
            id="ann-primary-kind"
            aria-label="Primary action"
            value={primaryKind}
            options={KIND_OPTS}
            onChange={(v) => setPrimaryKind(v as AdminAnnouncementInput['primaryKind'])}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Target tier" htmlFor="ann-tier">
          <Dropdown
            id="ann-tier"
            aria-label="Target tier"
            value={targetTier}
            options={TIER_OPTS}
            onChange={setTargetTier}
          />
        </Field>
        <Field label="Order" htmlFor="ann-order">
          <Input id="ann-order" value={order} onChange={(e) => setOrder(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Publish on (optional)" htmlFor="ann-publish-at">
          <DatePicker
            id="ann-publish-at"
            aria-label="Publish on"
            clearable
            placeholder="Show immediately"
            value={publishAt}
            onChange={setPublishAt}
          />
        </Field>
        <Field label="Expires on (optional)" htmlFor="ann-expires-at">
          <DatePicker
            id="ann-expires-at"
            aria-label="Expires on"
            clearable
            placeholder="Never expires"
            value={expiresAt}
            onChange={setExpiresAt}
          />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} loading={busy}>
          Save
        </Button>
      </div>
    </div>
  );
}
