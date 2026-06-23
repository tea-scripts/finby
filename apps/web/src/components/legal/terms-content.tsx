import type { ReactNode } from 'react';
import {
  TERMS_LAST_UPDATED,
  TERMS_INTRO,
  TERMS_SECTIONS,
  SUPPORT_EMAIL,
} from '@finby/shared';

export { TERMS_LAST_UPDATED };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function renderParagraph(text: string, key: number) {
  const emailIdx = text.indexOf(SUPPORT_EMAIL);
  if (emailIdx === -1) {
    return <p key={key}>{text}</p>;
  }
  const before = text.slice(0, emailIdx);
  const after = text.slice(emailIdx + SUPPORT_EMAIL.length);
  return (
    <p key={key}>
      {before}
      <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:text-accent-hover">
        {SUPPORT_EMAIL}
      </a>
      {after}
    </p>
  );
}

/** The Terms of Service body — shared by the public /terms page and the
 *  scroll-to-accept gate on the register form so both show identical text. */
export function TermsContent() {
  return (
    <div className="space-y-7">
      <p className="text-sm leading-relaxed text-muted">{TERMS_INTRO}</p>

      {TERMS_SECTIONS.map((s) => (
        <Section key={s.title} title={s.title}>
          {s.paragraphs.map((p, i) => renderParagraph(p, i))}
        </Section>
      ))}
    </div>
  );
}
