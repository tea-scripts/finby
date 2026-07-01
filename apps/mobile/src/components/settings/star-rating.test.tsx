import { render, screen, fireEvent } from '@testing-library/react-native';
import { StarRating } from './star-rating';

it('selects a rating', async () => {
  const onChange = jest.fn();
  await render(<StarRating value={0} onChange={onChange} />);
  await fireEvent.press(screen.getByLabelText('Rate 4'));
  expect(onChange).toHaveBeenCalledWith(4);
});
