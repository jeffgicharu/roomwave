import type { ThemeId } from "@roomwave/shared";

export interface Theme {
  id: ThemeId;
  name: string;
  dark: boolean;
  background: string;
  /** A second layer over the background: projector glow, a soft gradient. */
  glow: string;
  surface: string;
  text: string;
  muted: string;
  line: string;
  accent: string;
  /** Text on the accent colour. */
  onAccent: string;
  track: string;
  correct: string;
  /** Six chart colours in a fixed order, validated for colour-blind separation and contrast on this background. */
  chart: string[];
}

export const THEME_LIST: Theme[] = [
  {
    id: "paper",
    name: "Paper",
    dark: false,
    background: "#fbf7f0",
    glow: "radial-gradient(120% 90% at 85% 0%, rgb(255 194 61 / 0.18), transparent 55%)",
    surface: "#ffffff",
    text: "#1d1430",
    muted: "#6b6079",
    line: "#e6dccd",
    accent: "#ff6a2b",
    onAccent: "#1d1430",
    track: "#f1e9dc",
    correct: "#14a098",
    chart: ["#f25c1f", "#0f9890", "#6b5cff", "#c27f00", "#e0407a", "#2a86d6"],
  },
  {
    id: "ink",
    name: "Stage",
    dark: true,
    background: "#160f24",
    glow: "radial-gradient(90% 70% at 50% -10%, rgb(255 122 61 / 0.22), transparent 60%), radial-gradient(60% 50% at 100% 100%, rgb(107 92 255 / 0.18), transparent 70%)",
    surface: "#221a33",
    text: "#f7f1e8",
    muted: "#b4a9c4",
    line: "#3b3052",
    accent: "#ff7a3d",
    onAccent: "#160f24",
    track: "#2c2340",
    correct: "#2bc4b6",
    chart: ["#e96626", "#0eaa9d", "#8f80f2", "#ba8c00", "#ea5889", "#469bdc"],
  },
  {
    id: "lagoon",
    name: "Lagoon",
    dark: true,
    background: "#0a3533",
    glow: "radial-gradient(100% 80% at 0% 0%, rgb(127 224 212 / 0.16), transparent 60%), radial-gradient(70% 60% at 100% 100%, rgb(255 200 69 / 0.14), transparent 70%)",
    surface: "#0f4744",
    text: "#f2fbf8",
    muted: "#a3cbc5",
    line: "#1d5c58",
    accent: "#ffc845",
    onAccent: "#0a3533",
    track: "#11504c",
    correct: "#7fe0d4",
    chart: ["#ba8c00", "#0eaa9d", "#e96626", "#8f80f2", "#ea5889", "#469bdc"],
  },
  {
    id: "sunrise",
    name: "Sunrise",
    dark: false,
    background: "#ffe6c7",
    glow: "radial-gradient(110% 90% at 100% 0%, rgb(255 138 91 / 0.45), transparent 60%), radial-gradient(80% 70% at 0% 100%, rgb(255 200 69 / 0.4), transparent 65%)",
    surface: "#fff7ec",
    text: "#3a1406",
    muted: "#7d4c33",
    line: "#f2c9a3",
    accent: "#e8452c",
    onAccent: "#ffffff",
    track: "#fbd9b5",
    correct: "#0b6f69",
    chart: ["#d8401f", "#0b8f87", "#6b5cff", "#a86f00", "#c2307a", "#2f74c0"],
  },
];

export const THEMES_BY_ID = Object.fromEntries(THEME_LIST.map((t) => [t.id, t])) as Record<ThemeId, Theme>;

export function themeStyle(theme: Theme): string {
  return [
    `--t-bg:${theme.background}`,
    `--t-glow:${theme.glow}`,
    `--t-surface:${theme.surface}`,
    `--t-text:${theme.text}`,
    `--t-muted:${theme.muted}`,
    `--t-line:${theme.line}`,
    `--t-accent:${theme.accent}`,
    `--t-on-accent:${theme.onAccent}`,
    `--t-track:${theme.track}`,
    `--t-correct:${theme.correct}`,
    ...theme.chart.map((color, i) => `--t-c${i}:${color}`),
  ].join(";");
}

export function chartColor(theme: Theme, index: number): string {
  return theme.chart[index % theme.chart.length]!;
}
