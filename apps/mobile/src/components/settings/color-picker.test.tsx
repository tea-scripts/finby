import { render, screen, fireEvent } from '@testing-library/react-native';
import { ColorPicker, ACCOUNT_COLORS } from './color-picker';

it('picks a color', async () => {
  const onChange = jest.fn();
  await render(<ColorPicker value={null} onChange={onChange} />);
  await fireEvent.press(screen.getByLabelText(`Color ${ACCOUNT_COLORS[0]}`));
  expect(onChange).toHaveBeenCalledWith(ACCOUNT_COLORS[0]);
});
