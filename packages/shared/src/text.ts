import { LIMITS } from "./slides.ts";

/**
 * Words that are hidden from word clouds and audience questions when the
 * presenter keeps the filter on. Matched as whole words after undoing common
 * disguises (sh1t, f*ck, a$$), so ordinary words that merely contain one of
 * these, like "class" or "scunthorpe", are not caught.
 */
const BLOCKED = [
  "arse",
  "arsehole",
  "ass",
  "asshole",
  "bastard",
  "bitch",
  "bollocks",
  "bullshit",
  "cock",
  "crap",
  "cunt",
  "damn",
  "dick",
  "dickhead",
  "dumbass",
  "fag",
  "faggot",
  "fuck",
  "fucked",
  "fucker",
  "fucking",
  "fuckoff",
  "jackass",
  "motherfucker",
  "nigga",
  "nigger",
  "piss",
  "pissed",
  "prick",
  "pussy",
  "retard",
  "shit",
  "shite",
  "shitty",
  "slut",
  "twat",
  "wank",
  "wanker",
  "whore",
  // Common insults in the region's slang.
  "fala",
  "kuma",
  "malaya",
  "msenge",
  "mkundu",
];

const BLOCKED_SET = new Set(BLOCKED);

const DISGUISES: Record<string, string> = {
  "0": "o",
  "1": "i",
  "!": "i",
  "3": "e",
  "4": "a",
  "@": "a",
  "5": "s",
  $: "s",
  "7": "t",
  "8": "b",
};

function undisguise(word: string): string {
  let out = "";
  for (const ch of word.toLowerCase()) out += DISGUISES[ch] ?? ch;
  // "fuuuck" and "shiiit" are the same word.
  return out.replace(/(.)\1{2,}/g, "$1$1");
}

/** "f*ck" and "sh**" hide one or two letters behind each star. */
function matchesMasked(word: string): boolean {
  if (!/[a-z]/.test(word.replace(/\*/g, ""))) return false;
  const pattern = new RegExp(
    `^${word.split("*").map((part) => part.replace(/[^a-z0-9]/g, "")).join("[a-z]{0,2}")}$`,
  );
  return BLOCKED.some((blocked) => blocked.length >= 3 && pattern.test(blocked));
}

export function containsBlockedWord(text: string): boolean {
  const words = text.split(/[^\p{L}\p{N}@$!*]+/u).filter(Boolean);
  for (const raw of words) {
    const word = undisguise(raw);
    if (BLOCKED_SET.has(word)) return true;
    const squeezed = word.replace(/(.)\1+/g, "$1");
    if (BLOCKED_SET.has(squeezed)) return true;
    if (word.includes("*") && matchesMasked(word)) return true;
  }
  // Spaced out letters: "f u c k".
  const joined = undisguise(text.replace(/[\s._-]+/g, ""));
  return joined.length <= 12 && BLOCKED_SET.has(joined);
}

/** Collapses spaces and trims; returns null when nothing usable is left. */
export function cleanLine(text: string, maxLength: number): string | null {
  const cleaned = text
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

export type WordEntryProblem = "empty" | "too_long" | "too_many_words";

/**
 * A word cloud entry: one to three words. Entries are grouped by their
 * lowercase form, so "Teamwork" and "teamwork " count as the same answer.
 */
export function normaliseWordEntry(
  text: string,
): { ok: true; display: string; key: string } | { ok: false; problem: WordEntryProblem } {
  const cleaned = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (!cleaned) return { ok: false, problem: "empty" };
  if (cleaned.length > LIMITS.wordLength) return { ok: false, problem: "too_long" };
  if (cleaned.split(" ").length > 3) return { ok: false, problem: "too_many_words" };
  const key = cleaned.toLowerCase();
  return { ok: true, display: key, key };
}
