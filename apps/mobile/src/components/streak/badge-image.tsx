// apps/mobile/src/components/streak/badge-image.tsx
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/runtime.native';
import { getCachedBadge, setCachedBadge } from '../../lib/badge-cache';

/** An achievement badge: fetches the bearer-protected server SVG by slug and
 *  renders it with react-native-svg. Locked badges are dimmed with a lock
 *  overlay (true grayscale isn't available for SVG in Expo Go). A pulse-free
 *  placeholder stays if the fetch fails. */
export function BadgeImage({
  workspaceId,
  slug,
  label,
  locked,
  size = 64,
  lockedOpacity = 0.4,
}: {
  workspaceId: string;
  slug: string;
  label: string;
  locked: boolean;
  size?: number;
  lockedOpacity?: number;
}) {
  // Initialize from the session cache so an already-loaded badge (e.g. the grid
  // already fetched it) renders instantly with no loading flash.
  const [xml, setXml] = useState<string | null>(() => getCachedBadge(workspaceId, slug) ?? null);

  useEffect(() => {
    const cached = getCachedBadge(workspaceId, slug);
    if (cached) {
      setXml(cached);
      return;
    }
    let active = true;
    api.gamification
      .getBadgeSvg(workspaceId, slug)
      .then((svg) => {
        setCachedBadge(workspaceId, slug, svg);
        if (active) setXml(svg);
      })
      .catch(() => {
        /* leave the placeholder on failure */
      });
    return () => {
      active = false;
    };
  }, [workspaceId, slug]);

  return (
    <View
      accessibilityLabel={label}
      // Purely decorative: react-native-svg views join the touch responder and
      // would otherwise intermittently steal taps from a wrapping Pressable
      // (the achievements grid). Let touches fall through to the parent.
      pointerEvents="none"
      style={{ width: size, height: size, opacity: locked ? lockedOpacity : 1 }}
      className="items-center justify-center rounded-xl bg-surface-2"
    >
      {xml ? <SvgXml xml={xml} width={size} height={size} /> : null}
      {locked ? (
        <View className="absolute inset-0 items-center justify-center">
          <Ionicons name="lock-closed" size={18} color="#8da3c0" />
        </View>
      ) : null}
    </View>
  );
}
