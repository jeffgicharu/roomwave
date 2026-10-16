import { describe, expect, it } from "vitest";

import { sessionReportEmail } from "../src/email/templates.ts";

describe("the session report email", () => {
  const startedAt = new Date("2026-10-16T08:31:00Z");

  it("says person and answer when there is one of each", () => {
    const email = sessionReportEmail("Wanjiru Kamau", "Town hall", startedAt, 1, 1, "https://roomwave.test/results");
    expect(email.text).toContain("1 person took part and gave 1 answer.");
    expect(email.html).toContain("person took part");
    expect(email.html).toContain("answer given");
  });

  it("writes large numbers with commas", () => {
    const email = sessionReportEmail("Wanjiru Kamau", "Town hall", startedAt, 1240, 5310, "https://roomwave.test/results");
    expect(email.text).toContain("1,240 people took part and gave 5,310 answers.");
    expect(email.html).toContain("1,240</div>");
    expect(email.html).toContain("people took part");
  });
});
