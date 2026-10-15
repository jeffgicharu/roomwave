// Everyone gets a friendly name on joining, so a quiz leaderboard never shows
// "Anonymous" five times. People can change it to their own.

const ADJECTIVES = [
  "Swift",
  "Bright",
  "Brave",
  "Calm",
  "Clever",
  "Bold",
  "Quick",
  "Lucky",
  "Sunny",
  "Keen",
  "Gentle",
  "Happy",
  "Steady",
  "Curious",
  "Mighty",
  "Nimble",
];

const ANIMALS = [
  "Impala",
  "Heron",
  "Gazelle",
  "Cheetah",
  "Zebra",
  "Giraffe",
  "Hornbill",
  "Kudu",
  "Oryx",
  "Weaver",
  "Flamingo",
  "Buffalo",
  "Leopard",
  "Eland",
  "Pelican",
  "Sunbird",
  "Elephant",
  "Rhino",
  "Hippo",
  "Kingfisher",
];

export function randomName(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]!;
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]!;
  return `${adjective} ${animal}`;
}
