import { Image, type ImageSourcePropType, Text, View } from 'react-native';
import { CURRENCIES } from '@finby/shared';
import ae from '../../assets/flags/ae.png';
import au from '../../assets/flags/au.png';
import bw from '../../assets/flags/bw.png';
import ca from '../../assets/flags/ca.png';
import cn from '../../assets/flags/cn.png';
import eu from '../../assets/flags/eu.png';
import gb from '../../assets/flags/gb.png';
import gh from '../../assets/flags/gh.png';
import inFlag from '../../assets/flags/in.png';
import jp from '../../assets/flags/jp.png';
import ke from '../../assets/flags/ke.png';
import ng from '../../assets/flags/ng.png';
import ph from '../../assets/flags/ph.png';
import sg from '../../assets/flags/sg.png';
import us from '../../assets/flags/us.png';
import za from '../../assets/flags/za.png';

/** Currency code → bundled circular flag (mirrors the web's CURRENCY_COUNTRY map). */
const FLAGS: Record<string, ImageSourcePropType> = {
  USD: us, PHP: ph, EUR: eu, GBP: gb, NGN: ng, KES: ke, GHS: gh, ZAR: za,
  BWP: bw, CAD: ca, AUD: au, INR: inFlag, JPY: jp, SGD: sg, AED: ae, CNY: cn,
};

/** Circular currency flag; falls back to the currency symbol in a circle for
 *  unmapped currencies. Decorative — the code is shown as text alongside it. */
export function CurrencyFlag({ currency, size = 26 }: { currency: string; size?: number }) {
  const flag = FLAGS[currency];
  if (flag) {
    return (
      <Image
        testID="currency-flag-image"
        source={flag}
        accessibilityIgnoresInvertColors
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency;
  return (
    <View
      testID="currency-flag-fallback"
      className="items-center justify-center bg-surface-2"
      style={{ width: size, height: size, borderRadius: size / 2 }}
    >
      <Text className="font-semibold text-ink" style={{ fontSize: Math.round(size * 0.45) }}>
        {symbol}
      </Text>
    </View>
  );
}
