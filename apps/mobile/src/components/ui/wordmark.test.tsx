import { render, screen } from '@testing-library/react-native';
import { Wordmark } from './wordmark';

describe('Wordmark', () => {
  it('renders the lockup with an accessible Finby label by default', async () => {
    await render(<Wordmark />);
    expect(screen.getByLabelText('Finby')).toBeTruthy();
  });

  it('sizes from the given height, keeping the lockup aspect ratio', async () => {
    await render(<Wordmark height={32} />);
    const img = screen.getByLabelText('Finby');
    expect(img.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: 32, width: 32 * (1648 / 512) })]),
    );
  });

  it('renders the square mark variant at a 1:1 ratio', async () => {
    await render(<Wordmark variant="mark" height={40} />);
    const img = screen.getByLabelText('Finby');
    expect(img.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: 40, width: 40 })]),
    );
  });
});
