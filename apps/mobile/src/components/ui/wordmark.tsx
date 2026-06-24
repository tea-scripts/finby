import { Image, type ImageStyle, type StyleProp } from 'react-native';
import lockup from '../../assets/brand/finby-lockup.png';
import mark from '../../assets/brand/finby-mark.png';

/** Aspect ratios of the source brand PNGs (width / height). */
const RATIO = { lockup: 1648 / 512, mark: 1 } as const;

interface WordmarkProps {
  /** `lockup` = icon + "finby" wordmark; `mark` = the square icon only. */
  variant?: 'lockup' | 'mark';
  /** Rendered height in px; width is derived from the brand aspect ratio. */
  height?: number;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}

/** The Finby brand logo, rendered from the shared brand PNGs (no SVG runtime
 *  needed — works in Expo Go). Replaces the hand-typed "Fin<by>" text wordmark. */
export function Wordmark({
  variant = 'lockup',
  height = 32,
  style,
  accessibilityLabel = 'Finby',
}: WordmarkProps) {
  return (
    <Image
      source={variant === 'lockup' ? lockup : mark}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      resizeMode="contain"
      style={[{ height, width: height * RATIO[variant] }, style]}
    />
  );
}
