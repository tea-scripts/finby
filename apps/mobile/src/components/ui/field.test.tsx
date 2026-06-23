import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Field } from './field';

describe('Field', () => {
  it('renders the label and children', async () => {
    await render(<Field label="Email"><Text>child</Text></Field>);
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('child')).toBeTruthy();
  });
  it('shows the error when present (over the hint)', async () => {
    await render(<Field label="Email" error="Required" hint="we never share it"><Text>x</Text></Field>);
    expect(screen.getByText('Required')).toBeTruthy();
    expect(screen.queryByText('we never share it')).toBeNull();
  });
});
