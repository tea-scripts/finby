export interface GateState {
  status: 'loading' | 'idle' | 'authed';
  onboarded: boolean;
  segments: string[];
}

/** Pure routing decision for the root navigation gate. Returns the route to
 *  redirect to, or null to stay put. expo-router's useSegments() includes group
 *  segments (e.g. ['(app)'] at the home route, ['(auth)','login'] at login). */
export function nextRoute({ status, onboarded, segments }: GateState): string | null {
  if (status === 'loading') return null;
  const inAuthGroup = segments[0] === '(auth)';
  const inAppGroup = segments[0] === '(app)';
  if (status === 'authed') {
    return inAppGroup ? null : '/(app)';
  }
  // signed out:
  if (!onboarded) {
    const onOnboarding = segments[1] === 'onboarding';
    return onOnboarding ? null : '/(auth)/onboarding';
  }
  return inAuthGroup ? null : '/(auth)/login';
}
