import { render, screen } from '@testing-library/react-native';
import { CategoryAvatar } from './category-avatar';

// Mock Ionicons to render its `name` as text so we can assert which glyph shows
// (same pattern as tab-bar-icon.test.tsx).
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

// The avatar box is `accessibilityElementsHidden` (decorative — the category name is
// shown as adjacent text elsewhere), so default queries must opt in to hidden elements.
const HIDDEN = { includeHiddenElements: true };

describe('CategoryAvatar', () => {
  it('renders an emoji for a custom category name', async () => {
    await render(<CategoryAvatar category={{ name: 'Monthly Payroll' }} />);
    expect(screen.getByText('💼', HIDDEN)).toBeTruthy();
  });

  it('renders the fallback emoji for an unrecognized name', async () => {
    await render(<CategoryAvatar category={{ name: 'Zorblax' }} />);
    expect(screen.getByText('🏷️', HIDDEN)).toBeTruthy();
  });

  it('renders an Ionicons glyph for a known icon key', async () => {
    await render(<CategoryAvatar category={{ name: 'Groceries', icon: 'cart' }} />);
    expect(screen.getByText('cart', HIDDEN)).toBeTruthy();
  });
});
