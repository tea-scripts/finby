import * as ImagePicker from 'expo-image-picker';

/** An image selected on-device, shaped for React Native's FormData multipart
 *  upload (`{ uri, name, type }`). RN has no `File`/`Blob`-from-uri. */
export type PickedImage = { uri: string; name: string; type: string };

export type PickResult =
  | { status: 'picked'; file: PickedImage }
  | { status: 'denied' }
  | { status: 'canceled' };

/** Request the relevant permission, launch the camera or library, and map the
 *  first asset to an RN file object. Never throws for the ordinary
 *  denied/canceled paths — the caller renders those as UI states. */
export async function pickImage(source: 'camera' | 'library'): Promise<PickResult> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });

  const asset = result.canceled ? undefined : result.assets?.[0];
  if (!asset) return { status: 'canceled' };

  return {
    status: 'picked',
    file: {
      uri: asset.uri,
      name: asset.fileName ?? asset.uri.split('/').pop() ?? 'receipt.jpg',
      type: asset.mimeType ?? 'image/jpeg',
    },
  };
}
