/** Pictures a presenter can put on a content slide. Served from /media/slides/<id>.webp. */
export const SLIDE_IMAGES: { id: string; label: string }[] = [
  { id: "hall-audience-wide", label: "Conference audience" },
  { id: "lecture-theatre", label: "Lecture theatre" },
  { id: "community-hall", label: "Community hall" },
  { id: "town-hall", label: "Company town hall" },
  { id: "workshop-table", label: "Workshop table" },
  { id: "panel-discussion", label: "Panel on stage" },
  { id: "team-applause", label: "Team applauding" },
  { id: "city-dusk", label: "City at dusk" },
  { id: "warm-texture", label: "Warm texture" },
  { id: "lagoon-texture", label: "Lagoon texture" },
];

export function slideImageUrl(id: string): string {
  return `/media/slides/${id}.webp`;
}

/** 480 px wide, for choosing a picture. */
export function slideThumbUrl(id: string): string {
  return `/media/slides/${id}-small.webp`;
}
