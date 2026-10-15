import { join } from "node:path";

import PDFDocument from "pdfkit";

import {
  SLIDE_TYPE_LABELS,
  formatJoinCode,
  type LeaderboardEntry,
  type Results,
  type Slide,
} from "@roomwave/shared";

import { ASSET_DIR } from "../paths.ts";

const fonts = {
  text: join(ASSET_DIR, "fonts/instrument-sans-latin-400-normal.woff"),
  strong: join(ASSET_DIR, "fonts/instrument-sans-latin-600-normal.woff"),
  display: join(ASSET_DIR, "fonts/bricolage-grotesque-latin-700-normal.woff"),
};

const INK = "#1D1430";
const MUTED = "#6B6079";
const LINE = "#E6DCCD";
const TRACK = "#F3ECE0";
const SIGNAL = "#FF6A2B";
const LAGOON = "#14A098";

const MARGIN = 48;
const PAGE_WIDTH = 595.28;
const CONTENT = PAGE_WIDTH - MARGIN * 2;

export interface ReportInput {
  title: string;
  code: string;
  startedAt: Date;
  endedAt: Date | null;
  participants: number;
  responses: number;
  slides: Slide[];
  results: Record<string, Results>;
  leaderboard: LeaderboardEntry[];
}

function when(date: Date): string {
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Nairobi",
  });
}

function share(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "0%";
}

export function renderReport(input: ReportInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN + 16, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: { Title: `${input.title}: results`, Author: "Roomwave", Creator: "Roomwave" },
  });
  doc.registerFont("text", fonts.text);
  doc.registerFont("strong", fonts.strong);
  doc.registerFont("display", fonts.display);

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const bottom = () => doc.page.height - MARGIN - 24;
  const ensure = (height: number) => {
    if (doc.y + height > bottom()) doc.addPage();
  };

  // The mark and the name.
  const markY = doc.y;
  [8, 14, 20, 14, 22].forEach((h, i) => {
    doc.roundedRect(MARGIN + i * 7, markY + 22 - h, 4.5, h, 2).fill(SIGNAL);
  });
  doc.font("display").fontSize(17).fillColor(INK).text("roomwave", MARGIN + 42, markY + 2);
  doc.moveDown(2.2);

  doc.font("strong").fontSize(10).fillColor(MUTED).text("SESSION RESULTS", MARGIN, doc.y, { characterSpacing: 1.2 });
  doc.moveDown(0.3);
  doc.font("display").fontSize(26).fillColor(INK).text(input.title, { width: CONTENT });
  doc.moveDown(0.4);
  doc
    .font("text")
    .fontSize(11)
    .fillColor(MUTED)
    .text(
      `${when(input.startedAt)}  ·  Code ${formatJoinCode(input.code)}${input.endedAt ? "" : "  ·  Still running when this report was made"}`,
    );
  doc.moveDown(1);

  // Headline numbers.
  const statsY = doc.y;
  const stat = (x: number, value: string, label: string) => {
    doc.font("display").fontSize(24).fillColor(INK).text(value, x, statsY, { width: 160 });
    doc.font("text").fontSize(10).fillColor(MUTED).text(label, x, statsY + 30, { width: 160 });
  };
  const interactive = input.slides.filter((s) => s.type !== "content").length;
  stat(MARGIN, String(input.participants), "people took part");
  stat(MARGIN + 170, String(input.responses), "answers given");
  stat(MARGIN + 340, String(interactive), "questions asked");
  doc.y = statsY + 58;
  doc.moveTo(MARGIN, doc.y).lineTo(PAGE_WIDTH - MARGIN, doc.y).lineWidth(1).strokeColor(LINE).stroke();
  doc.moveDown(1.2);

  const bar = (label: string, count: number, total: number, highlight: boolean, note = "") => {
    ensure(34);
    const y = doc.y;
    const labelWidth = 190;
    doc.font(highlight ? "strong" : "text").fontSize(10.5).fillColor(INK);
    doc.text(label + note, MARGIN, y, { width: labelWidth, ellipsis: true, lineBreak: false, height: 14 });
    const trackX = MARGIN + labelWidth + 12;
    const trackWidth = CONTENT - labelWidth - 12 - 70;
    doc.roundedRect(trackX, y + 1, trackWidth, 11, 5.5).fill(TRACK);
    const width = total ? Math.max((count / total) * trackWidth, count ? 6 : 0) : 0;
    if (width) doc.roundedRect(trackX, y + 1, width, 11, 5.5).fill(highlight ? LAGOON : SIGNAL);
    doc
      .font("strong")
      .fontSize(10.5)
      .fillColor(INK)
      .text(`${count}  ·  ${share(count, total)}`, trackX + trackWidth + 8, y, { width: 62, align: "right" });
    doc.y = y + 22;
  };

  let number = 0;
  for (const slide of input.slides) {
    number += 1;
    const result = input.results[slide.id];
    if (slide.type === "content" || !result) continue;

    ensure(90);
    doc
      .font("strong")
      .fontSize(9)
      .fillColor(MUTED)
      .text(`SLIDE ${number}  ·  ${SLIDE_TYPE_LABELS[slide.type].toUpperCase()}`, MARGIN, doc.y, { characterSpacing: 1 });
    doc.moveDown(0.25);
    doc.font("display").fontSize(15).fillColor(INK).text(slide.config.question, { width: CONTENT });
    doc.moveDown(0.6);

    if ((result.type === "poll" || result.type === "quiz") && (slide.type === "poll" || slide.type === "quiz")) {
      const correct = slide.type === "quiz" ? slide.config.correctOptionId : null;
      for (const option of slide.config.options) {
        bar(option.label, result.counts[option.id] ?? 0, result.respondents, option.id === correct, option.id === correct ? "  (correct)" : "");
      }
      doc.font("text").fontSize(9.5).fillColor(MUTED).text(`${result.respondents} answered`, MARGIN);
    } else if (result.type === "scale" && slide.type === "scale") {
      for (let value = 1; value <= slide.config.max; value++) {
        const label = value === 1 ? `1  ${slide.config.minLabel}` : value === slide.config.max ? `${value}  ${slide.config.maxLabel}` : String(value);
        bar(label, result.counts[String(value)] ?? 0, result.respondents, false);
      }
      doc
        .font("text")
        .fontSize(9.5)
        .fillColor(MUTED)
        .text(`Average ${result.average ?? "–"} out of ${slide.config.max}  ·  ${result.respondents} answered`, MARGIN);
    } else if (result.type === "wordcloud") {
      const top = result.words.slice(0, 15);
      const most = top[0]?.count ?? 0;
      if (!top.length) doc.font("text").fontSize(10.5).fillColor(MUTED).text("No words were sent.");
      for (const word of top) bar(word.text, word.count, most, false);
      doc
        .font("text")
        .fontSize(9.5)
        .fillColor(MUTED)
        .text(`${result.entries} words from ${result.respondents} people${result.words.length > 15 ? "  ·  the 15 most common shown" : ""}`, MARGIN);
    } else if (result.type === "qna") {
      const questions = result.questions.filter((q) => q.status === "live" || q.status === "answered");
      if (!questions.length) doc.font("text").fontSize(10.5).fillColor(MUTED).text("No questions were asked.");
      for (const question of questions) {
        const height = doc.font("text").fontSize(10.5).heightOfString(question.text, { width: CONTENT - 70 }) + 22;
        ensure(height);
        const y = doc.y;
        doc.font("display").fontSize(14).fillColor(SIGNAL).text(String(question.upvotes), MARGIN, y, { width: 40, align: "right" });
        doc.font("text").fontSize(10.5).fillColor(INK).text(question.text, MARGIN + 56, y, { width: CONTENT - 70 });
        const meta = [question.name ?? "Anonymous", question.status === "answered" ? "Answered" : null].filter(Boolean).join("  ·  ");
        doc.font("text").fontSize(9).fillColor(MUTED).text(meta, MARGIN + 56);
        doc.y += 8;
      }
    }
    doc.moveDown(1.4);
  }

  if (input.leaderboard.length) {
    ensure(80);
    doc.font("strong").fontSize(9).fillColor(MUTED).text("QUIZ", MARGIN, doc.y, { characterSpacing: 1 });
    doc.moveDown(0.25);
    doc.font("display").fontSize(15).fillColor(INK).text("Leaderboard");
    doc.moveDown(0.6);
    for (const entry of input.leaderboard) {
      ensure(22);
      const y = doc.y;
      doc.font("display").fontSize(12).fillColor(entry.rank <= 3 ? SIGNAL : MUTED).text(String(entry.rank), MARGIN, y, { width: 28 });
      doc.font("text").fontSize(11).fillColor(INK).text(entry.name, MARGIN + 34, y, { width: CONTENT - 140 });
      doc.font("strong").fontSize(11).fillColor(INK).text(entry.score.toLocaleString("en-KE"), PAGE_WIDTH - MARGIN - 100, y, { width: 100, align: "right" });
      doc.y = y + 20;
    }
  }

  // Footer on every page.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing inside the bottom margin would otherwise start a new page.
    const margin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - MARGIN + 4;
    doc
      .font("text")
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(`Roomwave  ·  ${input.title}`, MARGIN, y, { width: CONTENT - 80, lineBreak: false, ellipsis: true, height: 12 });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, PAGE_WIDTH - MARGIN - 80, y, {
      width: 80,
      align: "right",
      lineBreak: false,
    });
    doc.page.margins.bottom = margin;
  }

  doc.end();
  return done;
}
