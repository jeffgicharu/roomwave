import { z } from "zod";

import type { PlanId, PlanStatus } from "./plans.ts";
import type { LeaderboardEntry, Results } from "./session.ts";
import { presentationDocSchema, type Slide, type ThemeId } from "./slides.ts";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Enter a valid email address"));

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200, "Use at most 200 characters");

export const personNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name")
  .max(80, "Use at most 80 characters");

export const signUpSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(200),
});

export const forgotSchema = z.object({ email: emailSchema });

export const passwordResetSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/, "This link is not valid"),
  password: passwordSchema,
});

export const accountUpdateSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
});

export const passwordChangeSchema = z.object({
  current: z.string().min(1, "Enter your current password").max(200),
  next: passwordSchema,
});

export const deleteAccountSchema = z.object({
  password: z.string().max(200),
});

export const savePresentationSchema = z.object({
  doc: presentationDocSchema,
  version: z.number().int().min(1),
});

export const newPresentationSchema = z.object({
  template: z.string().max(40),
});

export const CONTACT_TOPICS = ["organisation", "invoice", "event", "support", "other"] as const;
export const CONTACT_TOPIC_LABELS: Record<(typeof CONTACT_TOPICS)[number], string> = {
  organisation: "Organisation plan",
  invoice: "Paying for Pro by invoice",
  event: "A conference or large event",
  support: "Help with my account",
  other: "Something else",
};

export const contactSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  organisation: z.string().trim().max(120, "Use at most 120 characters"),
  topic: z.enum(CONTACT_TOPICS),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more (at least 10 characters)")
    .max(3000, "Use at most 3,000 characters"),
});

export interface User {
  id: string;
  name: string;
  email: string | null;
  role: "customer" | "staff";
  isGuest: boolean;
  guestExpiresAt: string | null;
  plan: PlanStatus;
  presentationCount: number;
  createdAt: string;
}

export interface PresentationSummary {
  id: string;
  title: string;
  theme: ThemeId;
  slideCount: number;
  firstQuestion: string;
  updatedAt: string;
  live: { sessionId: string; code: string } | null;
  sessionCount: number;
}

export interface PresentationDetail {
  id: string;
  title: string;
  theme: ThemeId;
  slides: Slide[];
  version: number;
  updatedAt: string;
  live: { sessionId: string; code: string } | null;
}

export interface SessionSummary {
  id: string;
  code: string;
  startedAt: string;
  endedAt: string | null;
  participants: number;
  responses: number;
}

export interface SessionResults {
  session: SessionSummary & { presentationId: string; title: string; theme: ThemeId };
  slides: Slide[];
  results: Record<string, Results>;
  leaderboard: LeaderboardEntry[];
  canPdf: boolean;
  canEmail: boolean;
}

export interface ApiError {
  error: string;
  message: string;
  fields?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Staff

export interface StaffOverview {
  liveSessions: number;
  connectedNow: number;
  accounts: number;
  signupsToday: number;
  onTrial: number;
  paying: number;
  openRequests: number;
  responsesToday: number;
  signupsByDay: { day: string; count: number }[];
}

export interface StaffCustomer {
  id: string;
  name: string;
  email: string | null;
  organisation: string | null;
  plan: PlanId;
  onTrial: boolean;
  trialEndsAt: string | null;
  isGuest: boolean;
  suspended: boolean;
  presentations: number;
  sessions: number;
  lastActiveAt: string | null;
  createdAt: string;
}

export interface StaffLiveSession {
  id: string;
  code: string;
  title: string;
  owner: string;
  ownerId: string;
  startedAt: string;
  participants: number;
  online: number;
  responses: number;
}

export interface StaffRequest {
  id: string;
  name: string;
  email: string;
  organisation: string;
  topic: (typeof CONTACT_TOPICS)[number];
  message: string;
  createdAt: string;
  handledAt: string | null;
  handledBy: string | null;
}

export interface ProcessHealth {
  name: string;
  release: string;
  uptimeSeconds: number;
  /** Memory counted against limitMb: the service's own share under systemd, otherwise the resident size. */
  memoryMb: number;
  heapUsedMb: number;
  limitMb: number;
  eventLoopDelayMs: number;
  connections: number | null;
  reportedAt: string;
}

export interface StaffHealth {
  processes: ProcessHealth[];
  queue: { waiting: number; active: number; failed: number; delayed: number };
  emailsToday: number;
  emailsPerDay: number;
  database: { sizeMb: number; connections: number };
}
