import { describe, it, expect } from 'vitest';
import {
  TERMS_LAST_UPDATED,
  TERMS_INTRO,
  TERMS_SECTIONS,
  SUPPORT_EMAIL,
} from './legal';

describe('legal constants', () => {
  it('TERMS_LAST_UPDATED is June 9, 2026', () => {
    expect(TERMS_LAST_UPDATED).toBe('June 9, 2026');
  });

  it('TERMS_INTRO is non-empty and mentions govern your use of Finby', () => {
    expect(TERMS_INTRO.length).toBeGreaterThan(0);
    expect(TERMS_INTRO).toContain('govern your use of Finby');
  });

  it('TERMS_SECTIONS has exactly 15 entries', () => {
    expect(TERMS_SECTIONS.length).toBe(15);
  });

  it('section titles match exactly', () => {
    const expectedTitles = [
      '1. Eligibility',
      '2. Your account',
      '3. The service',
      '4. Not financial advice',
      '5. AI assistant',
      '6. Subscriptions & billing',
      '7. Acceptable use',
      '8. Your content',
      '9. Intellectual property',
      '10. Termination',
      '11. Disclaimers',
      '12. Limitation of liability',
      '13. Changes to these Terms',
      '14. Governing law',
      '15. Contact',
    ];
    expect(TERMS_SECTIONS.map((s) => s.title)).toEqual(expectedTitles);
  });

  it('every section has at least one non-empty paragraph', () => {
    for (const section of TERMS_SECTIONS) {
      expect(section.paragraphs.length).toBeGreaterThanOrEqual(1);
      for (const p of section.paragraphs) {
        expect(p.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('section 15 (Contact) contains SUPPORT_EMAIL', () => {
    const contact = TERMS_SECTIONS[14]!;
    expect(contact.paragraphs.join(' ')).toContain(SUPPORT_EMAIL);
    expect(SUPPORT_EMAIL).toBe('support@finby.app');
  });
});
