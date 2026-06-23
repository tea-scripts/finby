import { fetch as expoFetch } from 'expo/fetch';

/** expo/fetch returns a Response whose body is a real ReadableStream
 *  (getReader), which @finby/core's chat streamMessage needs. RN's global
 *  fetch buffers and lacks getReader. Verified on device. */
export const streamFetch = expoFetch as unknown as typeof fetch;
