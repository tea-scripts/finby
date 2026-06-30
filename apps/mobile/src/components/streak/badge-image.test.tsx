// apps/mobile/src/components/streak/badge-image.test.tsx
import { render, screen, waitFor } from '@testing-library/react-native';

jest.mock('../../lib/runtime.native', () => ({
  api: { gamification: { getBadgeSvg: jest.fn() } },
}));
jest.mock('react-native-svg', () => ({
  SvgXml: ({ xml }: { xml: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, xml ? 'svg' : ''),
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

import { api } from '../../lib/runtime.native';
import { BadgeImage } from './badge-image';

const getBadgeSvg = api.gamification.getBadgeSvg as jest.Mock;

beforeEach(() => getBadgeSvg.mockReset());

describe('BadgeImage', () => {
  it('fetches and renders the SVG when unlocked', async () => {
    getBadgeSvg.mockResolvedValue('<svg/>');
    await render(<BadgeImage workspaceId="w1" slug="week-warrior" label="Week Warrior" locked={false} />);
    await waitFor(() => expect(screen.getByText('svg')).toBeTruthy());
    expect(getBadgeSvg).toHaveBeenCalledWith('w1', 'week-warrior');
  });

  it('shows a lock overlay when locked', async () => {
    getBadgeSvg.mockResolvedValue('<svg/>');
    await render(<BadgeImage workspaceId="w1" slug="x" label="X" locked />);
    await waitFor(() => expect(screen.getByText('lock-closed')).toBeTruthy());
  });

  it('keeps the placeholder when the fetch fails', async () => {
    getBadgeSvg.mockRejectedValue(new Error('nope'));
    await render(<BadgeImage workspaceId="w1" slug="x" label="X" locked={false} />);
    await waitFor(() => expect(getBadgeSvg).toHaveBeenCalled());
    expect(screen.queryByText('svg')).toBeNull();
  });

  it('uses a custom lockedOpacity when provided', async () => {
    getBadgeSvg.mockResolvedValue('<svg/>');
    await render(<BadgeImage workspaceId="w1" slug="x" label="Badge X" locked lockedOpacity={0.6} />);
    expect(screen.getByLabelText('Badge X').props.style.opacity).toBe(0.6);
  });

  it('defaults lockedOpacity to 0.4 when locked', async () => {
    getBadgeSvg.mockResolvedValue('<svg/>');
    await render(<BadgeImage workspaceId="w1" slug="x" label="Badge Y" locked />);
    expect(screen.getByLabelText('Badge Y').props.style.opacity).toBe(0.4);
  });

  it('is non-interactive so a wrapping Pressable receives taps (react-native-svg would otherwise steal them)', async () => {
    getBadgeSvg.mockResolvedValue('<svg/>');
    await render(<BadgeImage workspaceId="w1" slug="x" label="Badge Z" locked={false} />);
    expect(screen.getByLabelText('Badge Z').props.pointerEvents).toBe('none');
  });
});
