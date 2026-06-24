import type { Ionicons } from '@expo/vector-icons';

type Glyph = keyof typeof Ionicons.glyphMap;

export interface TabDef {
  name: 'index' | 'dashboard' | 'transactions' | 'settings';
  outline: Glyph;
  filled: Glyph;
}

/** Ordered bottom-tab definitions (mirrors web app-nav: Chat/Dashboard/Txns/Settings). */
export const TABS: readonly TabDef[] = [
  { name: 'index', outline: 'chatbubble-ellipses-outline', filled: 'chatbubble-ellipses' },
  { name: 'dashboard', outline: 'grid-outline', filled: 'grid' },
  { name: 'transactions', outline: 'receipt-outline', filled: 'receipt' },
  { name: 'settings', outline: 'settings-outline', filled: 'settings' },
];
