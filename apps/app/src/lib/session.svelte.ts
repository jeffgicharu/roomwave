import type { User } from "@roomwave/shared";

import { get } from "./api.ts";

/** The signed-in person, shared by every screen of the app. */
class Session {
  user = $state<User | null>(null);
  loaded = $state(false);

  async load(): Promise<User | null> {
    try {
      const { user } = await get<{ user: User | null }>("/api/auth/me");
      this.user = user;
    } finally {
      this.loaded = true;
    }
    return this.user;
  }

  set(user: User | null): void {
    this.user = user;
    this.loaded = true;
  }
}

export const session = new Session();

/** Where to go after signing in: only paths inside the app, never another site. */
export function safeNext(next: string | null, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}
