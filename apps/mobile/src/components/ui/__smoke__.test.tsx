import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

describe('RNTL smoke', () => {
  it('renders a Text node', async () => {
    await render(<Text>hello</Text>);
    expect(screen.getByText('hello')).toBeTruthy();
  });
});
