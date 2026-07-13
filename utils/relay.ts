/**
 * All browser → relay traffic goes through the Vite dev server's same-origin
 * proxy (`/relay-ws` and `/relay-http/*`), which pipes to the relay on
 * localhost:4000. Same-origin means it works identically on http:// and
 * https:// pages — no mixed-content blocking (the reason streams silently
 * failed from the HTTPS phone-camera mode).
 */

export const relayWsUrl = (): string =>
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/relay-ws`;

export const relayHttpUrl = (path: string): string => `/relay-http${path}`;
