export const PLAN_IDS = ["free", "pro", "organisation"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface Plan {
  id: PlanId;
  name: string;
  /** Kenyan shillings a month, billed monthly. Null when priced by quotation. */
  monthly: number | null;
  /** Kenyan shillings a month, billed yearly. */
  yearly: number | null;
  participants: number;
  presentations: number | null;
  pdfReports: boolean;
  emailReports: boolean;
  summary: string;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    monthly: 0,
    yearly: 0,
    participants: 50,
    presentations: 5,
    pdfReports: false,
    emailReports: false,
    summary: "For small meetings and trying things out.",
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthly: 1800,
    yearly: 1500,
    participants: 500,
    presentations: null,
    pdfReports: true,
    emailReports: true,
    summary: "For trainers, lecturers and anyone who presents every week.",
  },
  organisation: {
    id: "organisation",
    name: "Organisation",
    monthly: null,
    yearly: null,
    participants: 2000,
    presentations: null,
    pdfReports: true,
    emailReports: true,
    summary: "For conferences, churches and companies with large rooms.",
  },
};

export const TRIAL_DAYS = 14;

export interface PlanStatus {
  plan: PlanId;
  /** The plan the account pays for, before any trial. */
  basePlan: PlanId;
  trialEndsAt: string | null;
  onTrial: boolean;
  trialUsed: boolean;
}

export function effectivePlan(
  basePlan: PlanId,
  trialEndsAt: Date | null,
  now: Date = new Date(),
): PlanStatus {
  const onTrial = basePlan === "free" && trialEndsAt !== null && trialEndsAt > now;
  return {
    plan: onTrial ? "pro" : basePlan,
    basePlan,
    trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
    onTrial,
    trialUsed: trialEndsAt !== null,
  };
}

export function formatShillings(amount: number): string {
  return `KSh ${amount.toLocaleString("en-KE")}`;
}
