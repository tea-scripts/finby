import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SectionCard, SectionLoading, SectionError, SectionEmpty } from './section-card';

describe('section primitives', () => {
  it('SectionCard shows its title and children', async () => {
    await render(
      <SectionCard title="This month">
        <Text>body</Text>
      </SectionCard>,
    );
    expect(screen.getByText('This month')).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('SectionLoading renders a spinner', async () => {
    await render(<SectionLoading />);
    expect(screen.getByTestId('section-loading')).toBeTruthy();
  });

  it('SectionError fires onRetry', async () => {
    const onRetry = jest.fn();
    await render(<SectionError onRetry={onRetry} />);
    fireEvent.press(screen.getByTestId('section-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('SectionEmpty shows its message', async () => {
    await render(<SectionEmpty message="No budgets yet." />);
    expect(screen.getByText('No budgets yet.')).toBeTruthy();
  });
});
