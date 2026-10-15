import { io, type Socket } from "socket.io-client";

import {
  NAMESPACES,
  SOCKET_PATH,
  type AudienceClientEvents,
  type AudienceServerEvents,
  type HostClientEvents,
  type HostServerEvents,
} from "@roomwave/shared";

// WebSocket first. Where a venue's network blocks it, Socket.IO falls back to
// long-polling over ordinary requests. Reconnects back off with jitter, so a
// hall of phones does not hammer the server at the same instant.
const options = {
  path: SOCKET_PATH,
  transports: ["websocket", "polling"],
  tryAllTransports: true,
  reconnectionDelay: 800,
  reconnectionDelayMax: 6_000,
  randomizationFactor: 0.6,
  timeout: 10_000,
};

export type AudienceSocket = Socket<AudienceServerEvents, AudienceClientEvents>;
export type HostSocket = Socket<HostServerEvents, HostClientEvents>;

export function audienceSocket(): AudienceSocket {
  return io(NAMESPACES.audience, options);
}

export function hostSocket(): HostSocket {
  return io(NAMESPACES.host, { ...options, withCredentials: true });
}

/** The server's clock, as seen from here: phones and screens count down together. */
export class ServerClock {
  private offset = 0;

  sync(serverNow: number): void {
    this.offset = serverNow - Date.now();
  }

  now(): number {
    return Date.now() + this.offset;
  }
}
