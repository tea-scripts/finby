import { render, screen } from '@testing-library/react-native';

// Mock Ionicons to render its `name` as text so we can assert which glyph shows.
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

import { TabBarIcon } from './tab-bar-icon';

describe('TabBarIcon', () => {
  it('shows the filled icon when focused', async () => {
    await render(
      <TabBarIcon outline="grid-outline" filled="grid" focused color="#1d6ef5" size={24} />,
    );
    expect(screen.getByText('grid')).toBeTruthy();
    expect(screen.getByTestId('tab-bar-icon')).toBeTruthy();
  });

  it('shows the outline icon when not focused', async () => {
    await render(
      <TabBarIcon outline="grid-outline" filled="grid" focused={false} color="#8da3c0" size={24} />,
    );
    expect(screen.getByText('grid-outline')).toBeTruthy();
  });
});
