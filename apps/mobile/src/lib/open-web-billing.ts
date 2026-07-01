import { Linking } from 'react-native';
import { WEB_BILLING_URL } from './billing-links';

/** Open the web billing page for upgrade/change (best-effort). Lives in its own
 *  module (not billing-links) so billing-links stays free of a runtime react-native
 *  import and remains parseable by Vitest for the pure-constant tests. This module
 *  is only ever imported by .tsx components (Jest/RNTL), never by a Vitest .test.ts. */
export function openWebBilling(): void {
  void Linking.openURL(WEB_BILLING_URL).catch(() => {});
}
