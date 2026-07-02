import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ApiError } from '@finby/core';

const authState = { workspace: { id: 'w1', tier: 'PRO' } };
jest.mock('../../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(authState),
}));

jest.mock('../../lib/image-picker', () => ({ pickImage: jest.fn() }));

jest.mock('../../lib/runtime.native', () => ({
  api: {
    receipts: { extractReceipt: jest.fn() },
    transactions: { listCategories: jest.fn(), createTransaction: jest.fn() },
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Isolate the unit from the billing carousel that UpgradeGate renders for FREE.
jest.mock('../billing/plan-carousel-sheet', () => ({ PlanCarouselSheet: () => null }));

import { pickImage } from '../../lib/image-picker';
import { api } from '../../lib/runtime.native';
import { ReceiptScannerSheet } from './receipt-scanner-sheet';

const mockPick = pickImage as jest.Mock;
const mockApi = api as unknown as {
  receipts: { extractReceipt: jest.Mock };
  transactions: { listCategories: jest.Mock; createTransaction: jest.Mock };
};

const extraction = {
  merchant: 'Cafe Roma',
  total: 24.5,
  currency: 'USD',
  date: '2026-07-01',
  category: 'Dining',
  lineItems: [],
  confidence: 0.9,
  isMixedCategories: false,
  showLineItems: false,
  notes: null,
};

beforeEach(() => {
  mockPick.mockReset();
  mockApi.receipts.extractReceipt.mockReset();
  mockApi.transactions.listCategories.mockReset().mockResolvedValue([
    { id: 'c-dining', name: 'Dining', isArchived: false },
  ]);
  mockApi.transactions.createTransaction.mockReset();
});

describe('ReceiptScannerSheet', () => {
  it('extracts then logs a transaction and fires onLogged', async () => {
    mockPick.mockResolvedValue({ status: 'picked', file: { uri: 'file://a.jpg', name: 'a.jpg', type: 'image/jpeg' } });
    mockApi.receipts.extractReceipt.mockResolvedValue(extraction);
    const tx = { id: 't1' };
    mockApi.transactions.createTransaction.mockResolvedValue(tx);
    const onLogged = jest.fn();

    await render(<ReceiptScannerSheet open onClose={jest.fn()} onLogged={onLogged} />);

    fireEvent.press(screen.getByText('Take photo'));
    await waitFor(() => expect(screen.getByText('Log Transaction')).toBeTruthy());
    fireEvent.press(screen.getByText('Log Transaction'));

    await waitFor(() => expect(mockApi.transactions.createTransaction).toHaveBeenCalledWith('w1', expect.objectContaining({
      type: 'EXPENSE',
      amountOriginal: '24.5',
      currencyOriginal: 'USD',
      categoryId: 'c-dining',
      merchant: 'Cafe Roma',
      transactionDate: '2026-07-01',
    })));
    expect(onLogged).toHaveBeenCalledWith(tx, extraction);
  });

  it('surfaces the backend error message when extraction fails', async () => {
    mockPick.mockResolvedValue({ status: 'picked', file: { uri: 'file://a.jpg', name: 'a.jpg', type: 'image/jpeg' } });
    mockApi.receipts.extractReceipt.mockRejectedValue(
      new ApiError(422, 'BAD', 'Could not read receipt — please try a clearer photo'),
    );

    await render(<ReceiptScannerSheet open onClose={jest.fn()} onLogged={jest.fn()} />);
    fireEvent.press(screen.getByText('Take photo'));

    await waitFor(() => expect(screen.getByText(/Could not read receipt/)).toBeTruthy());
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('shows a permission hint when the picker is denied and makes no API call', async () => {
    mockPick.mockResolvedValue({ status: 'denied' });

    await render(<ReceiptScannerSheet open onClose={jest.fn()} onLogged={jest.fn()} />);
    fireEvent.press(screen.getByText('Choose from library'));

    await waitFor(() => expect(screen.getByText(/enable.*Settings/i)).toBeTruthy());
    expect(mockApi.receipts.extractReceipt).not.toHaveBeenCalled();
  });

  it('gates FREE tier behind the upgrade prompt and never picks', async () => {
    authState.workspace.tier = 'FREE';
    await render(<ReceiptScannerSheet open onClose={jest.fn()} onLogged={jest.fn()} />);
    expect(screen.getByText('This is a Pro feature.')).toBeTruthy();
    expect(screen.queryByText('Take photo')).toBeNull();
    authState.workspace.tier = 'PRO'; // restore for other tests
  });
});
