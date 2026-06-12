import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReceiptConfirmationCard } from './ReceiptConfirmationCard';
import type { Category, ReceiptExtraction } from '@/lib/types';

const CATEGORIES: Category[] = [
  { id: 'cat-groceries', name: 'Groceries', isArchived: false },
  { id: 'cat-dining', name: 'Dining', isArchived: false },
  { id: 'cat-other', name: 'Other', isArchived: false },
  { id: 'cat-old', name: 'Old', isArchived: true },
];

const EXTRACTION: ReceiptExtraction = {
  merchant: 'Walmart',
  total: 42.5,
  currency: 'USD',
  date: '2026-06-10',
  category: 'Groceries',
  lineItems: [
    { name: 'Milk', amount: 4.5 },
    { name: 'Bread', amount: 12 },
  ],
  confidence: 0.92,
  isMixedCategories: false,
  showLineItems: false,
  notes: null,
};

function setup(overrides: Partial<ReceiptExtraction> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ReceiptConfirmationCard
      extraction={{ ...EXTRACTION, ...overrides }}
      categories={CATEGORIES}
      confirming={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
}

describe('ReceiptConfirmationCard', () => {
  it('renders merchant, total, date and category', () => {
    setup();
    expect(screen.getByLabelText('Merchant')).toHaveValue('Walmart');
    expect(screen.getByLabelText(/total/i)).toHaveValue(42.5);
    expect(screen.getByText('2026-06-10')).toBeInTheDocument();
    // The extracted category is resolved against workspace categories.
    expect(screen.getByRole('button', { name: 'Category' })).toHaveTextContent('Groceries');
  });

  it('does not render line items when showLineItems is false', () => {
    setup({ showLineItems: false });
    expect(screen.queryByText('Milk')).not.toBeInTheDocument();
  });

  it('renders line items when showLineItems is true', () => {
    setup({ showLineItems: true });
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('Bread')).toBeInTheDocument();
    expect(screen.getByText('4.50')).toBeInTheDocument();
  });

  it('renders the low confidence warning when confidence < 0.5', () => {
    setup({ confidence: 0.4 });
    expect(screen.getByText(/not fully confident/i)).toBeInTheDocument();
  });

  it('hides the low confidence warning for confident extractions', () => {
    setup({ confidence: 0.9 });
    expect(screen.queryByText(/not fully confident/i)).not.toBeInTheDocument();
  });

  it('falls back to "Other" when the extracted category does not exist', () => {
    setup({ category: 'Personal Care' });
    expect(screen.getByRole('button', { name: 'Category' })).toHaveTextContent('Other');
  });

  it('lets the user change the category before confirming', () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Category' }));
    fireEvent.click(screen.getByRole('option', { name: 'Dining' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log Transaction' }));
    expect(onConfirm).toHaveBeenCalledWith({
      total: '42.5',
      merchant: 'Walmart',
      categoryId: 'cat-dining',
    });
  });

  it('lets the user edit the total and passes the corrected value through', () => {
    const { onConfirm } = setup();
    const totalInput = screen.getByLabelText(/total/i);
    fireEvent.change(totalInput, { target: { value: '45.99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log Transaction' }));
    expect(onConfirm).toHaveBeenCalledWith({
      total: '45.99',
      merchant: 'Walmart',
      categoryId: 'cat-groceries',
    });
  });

  it('lets the user rename the merchant (franchise corp → brand) before confirming', () => {
    const { onConfirm } = setup({ merchant: 'CIAM HIGHWAY FOOD CORP' });
    const merchantInput = screen.getByLabelText('Merchant');
    expect(merchantInput).toHaveValue('CIAM HIGHWAY FOOD CORP');
    fireEvent.change(merchantInput, { target: { value: 'Jollibee' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log Transaction' }));
    expect(onConfirm).toHaveBeenCalledWith({
      total: '42.5',
      merchant: 'Jollibee',
      categoryId: 'cat-groceries',
    });
  });

  it('disables Log Transaction while the total is invalid', () => {
    const { onConfirm } = setup();
    fireEvent.change(screen.getByLabelText(/total/i), { target: { value: '' } });
    const logButton = screen.getByRole('button', { name: 'Log Transaction' });
    expect(logButton).toBeDisabled();
    fireEvent.click(logButton);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls the cancel handler from the Cancel button', () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
