'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';

/** Chat input. Enter sends, Shift+Enter inserts a newline.
 *  Typing the `/clear` command starts a fresh chat instead of sending. */
export function Composer({
  disabled,
  onSend,
  onClearCommand,
}: {
  disabled: boolean;
  onSend: (content: string) => void;
  onClearCommand: () => void;
}) {
  const [value, setValue] = useState('');

  function submit() {
    const content = value.trim();
    if (!content || disabled) return;
    // `/clear` is a client-side command — it never reaches the LLM.
    if (content.toLowerCase() === '/clear') {
      setValue('');
      onClearCommand();
      return;
    }
    onSend(content);
    setValue('');
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex items-end gap-2 rounded-2xl border border-line bg-surface/80 p-2 shadow-card backdrop-blur"
    >
      <textarea
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Tell Finby what you spent…"
        className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-base text-ink outline-none placeholder:text-faint md:text-sm"
      />
      <Button type="submit" loading={disabled} disabled={!value.trim()} className="shrink-0">
        Send
      </Button>
    </form>
  );
}
