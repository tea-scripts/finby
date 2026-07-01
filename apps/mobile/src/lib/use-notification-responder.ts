import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { notifications } from './runtime.native';
import { mapUrlToRoute } from './notification-routing';

/** Sets the foreground presentation handler and routes notification taps
 *  (both warm taps and the cold-start tap) to the matching screen. Mount once
 *  inside the authed layout. */
export function useNotificationResponder(): void {
  const router = useRouter();
  useEffect(() => {
    notifications.setForegroundHandler();

    let active = true;
    void notifications.getInitialUrl().then((url) => {
      if (!active) return;
      const route = mapUrlToRoute(url);
      if (route) router.push(route as never);
    });

    const unsubscribe = notifications.addResponseListener((url) => {
      const route = mapUrlToRoute(url);
      if (route) router.push(route as never);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);
}
