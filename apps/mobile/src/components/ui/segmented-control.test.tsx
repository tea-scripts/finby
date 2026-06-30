import { render, screen, fireEvent } from '@testing-library/react-native';
import { SegmentedControl } from './segmented-control';

const OPTS = [
  { value: 'all', label: 'All' },
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

describe('SegmentedControl', () => {
  it('renders options and fires onChange on press', async () => {
    const onChange = jest.fn();
    await render(<SegmentedControl options={OPTS} value="all" onChange={onChange} />);
    expect(screen.getByText('Expense')).toBeTruthy();
    fireEvent.press(screen.getByTestId('segment-income'));
    expect(onChange).toHaveBeenCalledWith('income');
  });
});
