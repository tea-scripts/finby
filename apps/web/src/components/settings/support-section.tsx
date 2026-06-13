'use client';

import { useState } from 'react';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUS_LABELS,
  type SupportCategory,
} from '@finby/shared';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { createSupportTicket, listSupportTickets } from '@/lib/support-api';
import type { SupportTicketView } from '@/lib/types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-accent-soft text-accent',
  IN_PROGRESS: 'bg-amber-500/15 text-amber-400',
  RESOLVED: 'bg-emerald-500/15 text-emerald-400',
};

export function SupportSection() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tickets, setTickets] = useState<SupportTicketView[]>([]);

  const [category, setCategory] = useState<SupportCategory>(SUPPORT_CATEGORIES[0]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [sent, setSent] = useState(false);

  function openModal(): void {
    setOpen(true);
    if (!loaded) {
      listSupportTickets()
        .then(setTickets)
        .catch(() => {
          /* a load failure shouldn't block submitting a new ticket */
        })
        .finally(() => setLoaded(true));
    }
  }

  async function submit(): Promise<void> {
    setSubmitting(true);
    setError(false);
    setSent(false);
    try {
      const created = await createSupportTicket({
        category,
        subject: subject.trim(),
        message: message.trim(),
      });
      setTickets((prev) => [created, ...prev]);
      setSubject('');
      setMessage('');
      setCategory(SUPPORT_CATEGORIES[0]);
      setSent(true);
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = subject.trim().length > 0 && message.trim().length > 0 && !submitting;

  return (
    <section className="space-y-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
        Support
      </h2>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/60 p-5 shadow-card">
        <p className="text-sm text-muted">Hit a snag? Send us a ticket and we&apos;ll reply by email.</p>
        <Button variant="ghost" className="shrink-0" onClick={openModal}>
          Contact support
        </Button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Support">
        <div className="space-y-4">
          <div className="space-y-1">
            <span className="text-xs text-muted">Category</span>
            <Dropdown
              aria-label="Category"
              value={category}
              onChange={(v) => setCategory(v as SupportCategory)}
              options={SUPPORT_CATEGORIES.map((c) => ({ value: c, label: SUPPORT_CATEGORY_LABELS[c] }))}
            />
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-muted">Subject</span>
            <Input
              aria-label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Short summary"
              maxLength={160}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-muted">Message</span>
            <Textarea
              aria-label="Message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's going on?"
              rows={4}
              maxLength={5000}
            />
          </label>

          {error ? (
            <p className="text-xs text-danger">Couldn&apos;t send your ticket. Please try again.</p>
          ) : null}
          {sent ? (
            <p className="text-xs text-emerald-400">Sent — we&apos;ll be in touch by email.</p>
          ) : null}

          <Button loading={submitting} disabled={!canSubmit} onClick={submit}>
            Submit ticket
          </Button>

          {tickets.length > 0 ? (
            <div className="border-t border-line pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Your tickets
              </p>
              <ul className="divide-y divide-line">
                {tickets.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{t.subject}</p>
                      <p className="text-xs text-faint">
                        {SUPPORT_CATEGORY_LABELS[t.category]} · {formatDate(t.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        STATUS_STYLES[t.status] ?? 'bg-surface-2 text-muted'
                      }`}
                    >
                      {SUPPORT_STATUS_LABELS[t.status]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Modal>
    </section>
  );
}
