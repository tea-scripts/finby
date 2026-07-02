import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted: vi.mock is hoisted above imports, so its factory can't reference a
// plain outer `const` (temporal dead zone). hoisted() lifts the mock with it.
const mock = vi.hoisted(() => ({
  requestCameraPermissionsAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
}));
vi.mock('expo-image-picker', () => mock);

import { pickImage } from './image-picker';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pickImage', () => {
  it('returns denied when camera permission is refused', async () => {
    mock.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });
    const res = await pickImage('camera');
    expect(res).toEqual({ status: 'denied' });
    expect(mock.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('returns canceled when the user backs out', async () => {
    mock.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    mock.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
    const res = await pickImage('library');
    expect(res).toEqual({ status: 'canceled' });
  });

  it('maps a camera asset to a file object with sensible fallbacks', async () => {
    mock.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    mock.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/abc.heic', fileName: 'abc.heic', mimeType: 'image/heic' }],
    });
    const res = await pickImage('camera');
    expect(res).toEqual({
      status: 'picked',
      file: { uri: 'file:///tmp/abc.heic', name: 'abc.heic', type: 'image/heic' },
    });
  });

  it('derives name from the uri and defaults the type when metadata is missing', async () => {
    mock.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    mock.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/xyz.jpg' }],
    });
    const res = await pickImage('library');
    expect(res).toEqual({
      status: 'picked',
      file: { uri: 'file:///tmp/xyz.jpg', name: 'xyz.jpg', type: 'image/jpeg' },
    });
  });
});
