import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('renders a block', async () => {
    await render(<Skeleton style={{ width: 40, height: 12 }} />);
    expect(screen.getByTestId('skeleton', { includeHiddenElements: true })).toBeTruthy();
  });

  it('renders (static) when reduced motion is enabled', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await render(<Skeleton style={{ width: 40, height: 12 }} />);
    expect(screen.getByTestId('skeleton', { includeHiddenElements: true })).toBeTruthy();
    jest.restoreAllMocks();
  });
});
