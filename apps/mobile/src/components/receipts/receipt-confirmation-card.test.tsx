import { render, screen, fireEvent } from '@testing-library/react-native';
import type { Category, ReceiptExtraction } from '@finby/shared';
import { ReceiptConfirmationCard } from './receipt-confirmation-card';

const categories: Category[] = [
  { id: 'c-dining', name: 'Dining', isArchived: false },
  { id: 'c-other', name: 'Other', isArchived: false },
];

function extraction(over: Partial<ReceiptExtraction> = {}): ReceiptExtraction {
  return {
    merchant: 'Cafe Roma',
    total: 24.5,
    currency: 'USD',
    date: '2026-07-01',
    category: 'Dining',
    lineItems: [{ name: 'Latte', amount: 4.5 }],
    confidence: 0.9,
    isMixedCategories: false,
    showLineItems: false,
    notes: null,
    ...over,
  };
}

describe('ReceiptConfirmationCard', () => {
  it('prefills the merchant and total from the extraction', async () => {
    await render(
      <ReceiptConfirmationCard
        extraction={extraction()}
        categories={categories}
        confirming={false}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByDisplayValue('Cafe Roma')).toBeTruthy();
    expect(screen.getByDisplayValue('24.5')).toBeTruthy();
  });

  it('emits the trimmed values and resolved category on confirm', async () => {
    const onConfirm = jest.fn();
    await render(
      <ReceiptConfirmationCard
        extraction={extraction()}
        categories={categories}
        confirming={false}
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByText('Log Transaction'));
    expect(onConfirm).toHaveBeenCalledWith({ total: '24.5', merchant: 'Cafe Roma', categoryId: 'c-dining' });
  });

  it('disables confirm when the total is not a positive number', async () => {
    const onConfirm = jest.fn();
    await render(
      <ReceiptConfirmationCard
        extraction={extraction()}
        categories={categories}
        confirming={false}
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );
    await fireEvent.changeText(screen.getByTestId('receipt-total'), '0');
    await fireEvent.press(screen.getByText('Log Transaction'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows line items when showLineItems is set', async () => {
    await render(
      <ReceiptConfirmationCard
        extraction={extraction({ showLineItems: true })}
        categories={categories}
        confirming={false}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByText('Latte')).toBeTruthy();
  });

  it('warns when confidence is low', async () => {
    await render(
      <ReceiptConfirmationCard
        extraction={extraction({ confidence: 0.3 })}
        categories={categories}
        confirming={false}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByText(/not fully confident/i)).toBeTruthy();
  });
});
