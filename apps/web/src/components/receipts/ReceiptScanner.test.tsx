import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReceiptScanner } from './ReceiptScanner';
import { ApiError } from '@/lib/api-client';
import type { ReceiptExtraction } from '@/lib/types';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/store', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/components/billing/UpgradeModal', () => ({
  UpgradeModal: () => null,
}));

vi.mock('@/lib/receipts-api', () => ({
  extractReceipt: vi.fn(),
}));

vi.mock('@/lib/transactions-api', () => ({
  createTransaction: vi.fn(),
  listCategories: vi.fn(),
}));

import { useAuth } from '@/lib/store';
import { extractReceipt } from '@/lib/receipts-api';
import { createTransaction, listCategories } from '@/lib/transactions-api';

const mockUseAuth = vi.mocked(useAuth);
const mockExtract = vi.mocked(extractReceipt);
const mockCreate = vi.mocked(createTransaction);
const mockListCategories = vi.mocked(listCategories);

function setTier(tier: string) {
  const state = { workspace: { id: 'ws-1', tier } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockUseAuth.mockImplementation((selector: any) => selector(state));
}

const EXTRACTION: ReceiptExtraction = {
  merchant: 'Walmart',
  total: 42.5,
  currency: 'USD',
  date: '2026-06-10',
  category: 'Groceries',
  lineItems: [],
  confidence: 0.92,
  isMixedCategories: false,
  showLineItems: false,
  notes: null,
};

function selectFile() {
  const input = screen.getByLabelText('Receipt photo');
  const file = new File(['fake-bytes'], 'receipt.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  setTier('PRO');
  mockListCategories.mockResolvedValue([]);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ReceiptScanner', () => {
  it('shows the upgrade gate (not the scanner) for FREE tier users', () => {
    setTier('FREE');
    render(<ReceiptScanner open onClose={vi.fn()} onLogged={vi.fn()} />);

    expect(screen.getByText('Receipt Scanning')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upgrade/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose photo' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Receipt photo')).not.toBeInTheDocument();
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it('shows the camera/photo picker for PRO tier users', () => {
    render(<ReceiptScanner open onClose={vi.fn()} onLogged={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Choose photo' })).toBeInTheDocument();
    expect(screen.getByLabelText('Receipt photo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upgrade/i })).not.toBeInTheDocument();
  });

  it('shows the error state with a retry option when the upload fails', async () => {
    mockExtract.mockRejectedValue(
      new ApiError(422, 'UNPROCESSABLE', 'This image does not appear to be a receipt'),
    );
    render(<ReceiptScanner open onClose={vi.fn()} onLogged={vi.fn()} />);

    selectFile();

    expect(
      await screen.findByText('This image does not appear to be a receipt'),
    ).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Try again' });
    fireEvent.click(retry);
    expect(screen.getByRole('button', { name: 'Choose photo' })).toBeInTheDocument();
  });

  it('shows the confirmation card after a successful extraction', async () => {
    mockExtract.mockResolvedValue(EXTRACTION);
    render(<ReceiptScanner open onClose={vi.fn()} onLogged={vi.fn()} />);

    selectFile();

    expect(await screen.findByLabelText('Merchant')).toHaveValue('Walmart');
    expect(screen.getByRole('button', { name: 'Log Transaction' })).toBeInTheDocument();
    // Nothing is logged until the user confirms.
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
