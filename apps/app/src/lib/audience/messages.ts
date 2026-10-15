import type { RespondError } from "@roomwave/shared";

/** What to tell someone on their phone when an answer is not taken. */
export function respondMessage(error: RespondError | string): string {
  switch (error) {
    case "locked":
      return "Answers are closed for this question.";
    case "not_current":
      return "The presenter has moved on to another slide.";
    case "not_open":
      return "Wait for the question to open.";
    case "too_late":
      return "Time ran out before your answer arrived.";
    case "blocked_word":
      return "That word is not allowed here. Try another.";
    case "limit":
      return "You have sent as many as this question allows.";
    case "invalid":
      return "That answer could not be sent. Check it and try again.";
    case "not_joined":
    case "busy":
    default:
      return "Your answer did not go through. Try again in a moment.";
  }
}
