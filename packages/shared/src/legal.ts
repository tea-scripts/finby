export const TERMS_LAST_UPDATED = 'June 9, 2026';
export const SUPPORT_EMAIL = 'support@finby.app';

/** Intro paragraph shown above the numbered sections. */
export const TERMS_INTRO =
  'These Terms of Service (“Terms”) govern your use of Finby (“Finby”, “we”, “us”), a conversational personal-finance app. By creating an account or using Finby, you agree to these Terms. If you don’t agree, don’t use the app.';

export interface TermsSection {
  /** e.g. "1. Eligibility" */
  title: string;
  /** One string per <p> paragraph, in order. */
  paragraphs: string[];
}

export const TERMS_SECTIONS: TermsSection[] = [
  {
    title: '1. Eligibility',
    paragraphs: [
      'You must be at least 16 years old to use Finby. By using it, you confirm you meet this requirement and can form a binding agreement with us.',
    ],
  },
  {
    title: '2. Your account',
    paragraphs: [
      'Provide accurate information, keep your password secure, and don’t share your account. You’re responsible for activity under your account. Tell us promptly if you suspect unauthorized access.',
    ],
  },
  {
    title: '3. The service',
    paragraphs: [
      'Finby helps you log and understand your finances through conversation — you enter your own transactions, budgets, accounts, and holdings. Finby is not a bank, broker, or money transmitter, does not connect to or move money in your financial accounts, and does not execute trades.',
    ],
  },
  {
    title: '4. Not financial advice',
    paragraphs: [
      'Finby is an informational tool, not a financial, investment, tax, or legal adviser. Anything Finby (including its AI assistant) tells you is for general information only and is not professional advice. Decisions you make are your own; consult a qualified professional before acting. Investing carries risk, including loss of principal.',
    ],
  },
  {
    title: '5. AI assistant',
    paragraphs: [
      'Finby uses AI to interpret your messages and respond. AI can be inaccurate or incomplete — always review what it logs and don’t rely on it as your sole source of truth for financial decisions.',
    ],
  },
  {
    title: '6. Subscriptions & billing',
    paragraphs: [
      'Paid plans are billed in advance on a recurring basis through our payment processors and renew automatically until cancelled. Upgrades take effect immediately and are prorated; downgrades take effect at the end of your current billing period.',
      'You can cancel anytime; your plan stays active until the end of the paid period. Except where required by law, payments are non-refundable. We may change prices with reasonable notice, effective on your next billing cycle.',
      'Cancelling stops future renewals but keeps your account; if you close your account, your data is then retained or deleted as described in the Data retention section of our Privacy Policy.',
    ],
  },
  {
    title: '7. Acceptable use',
    paragraphs: [
      'Don’t use Finby for anything unlawful, don’t attempt to break, overload, reverse-engineer, or gain unauthorized access to it, and don’t scrape or misuse the service or other users’ data.',
      'Don’t attempt to manipulate or deceive the AI assistant into producing false or fraudulent financial records, or use it to generate misleading information.',
    ],
  },
  {
    title: '8. Your content',
    paragraphs: [
      'You own the data you enter. You grant us a limited licence to store and process it solely to operate the service for you, as described in our Privacy Policy. You can export or delete your data by managing or closing your account.',
    ],
  },
  {
    title: '9. Intellectual property',
    paragraphs: [
      'Finby, its software, design, and branding belong to us. These Terms don’t transfer any of our intellectual property to you.',
    ],
  },
  {
    title: '10. Termination',
    paragraphs: [
      'You may stop using Finby and close your account at any time. We may suspend or terminate access if you breach these Terms or to protect the service or other users. On termination, your right to use Finby ends; sections that by nature should survive (e.g. disclaimers, liability limits) continue to apply.',
    ],
  },
  {
    title: '11. Disclaimers',
    paragraphs: [
      'Finby is provided “as is” and “as available” without warranties of any kind. We don’t guarantee the app will be uninterrupted, error-free, or that any information or AI output is accurate or complete.',
    ],
  },
  {
    title: '12. Limitation of liability',
    paragraphs: [
      'To the maximum extent permitted by law, Finby is not liable for indirect, incidental, or consequential damages, or for financial losses arising from your use of (or reliance on) the app. Our total liability is limited to the amount you paid us in the 12 months before the claim.',
    ],
  },
  {
    title: '13. Changes to these Terms',
    paragraphs: [
      'We may update these Terms as the product evolves. We’ll revise the date above and, for material changes, notify you in the app or by email. Continued use after changes means you accept them.',
    ],
  },
  {
    title: '14. Governing law',
    paragraphs: [
      'These Terms are governed by the laws of the jurisdiction in which Finby operates, without regard to its conflict-of-law rules.',
    ],
  },
  {
    title: '15. Contact',
    paragraphs: ['Questions about these Terms? Email us at support@finby.app.'],
  },
];
