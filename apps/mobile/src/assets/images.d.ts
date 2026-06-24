// Type declarations for static image imports (Metro bundles these to an asset
// source). Expo's bundled types don't ship a `*.png` module declaration.
declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';

  const content: ImageSourcePropType;
  export default content;
}
