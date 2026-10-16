import type { ImageMetadata } from "astro";

import { PLANS } from "@roomwave/shared";

import communityHall from "../assets/photos/community-hall.jpg";
import lectureTheatre from "../assets/photos/lecture-theatre.jpg";
import panel from "../assets/photos/panel-discussion.jpg";
import townHall from "../assets/photos/town-hall.jpg";

export interface UseCase {
  slug: string;
  name: string;
  title: string;
  description: string;
  lead: string;
  image: ImageMetadata;
  alt: string;
  problem: string;
  moments: { title: string; body: string; example: string }[];
  template: { id: string; name: string };
}

export const USE_CASES: UseCase[] = [
  {
    slug: "conferences",
    name: "Conferences and panels",
    title: "Let the whole hall ask the panel.",
    description: `Moderated Q&A with upvotes, live polls between talks and session feedback for conferences and panels of up to ${PLANS.organisation.participants.toLocaleString("en-KE")} people.`,
    lead: "In a hall of four hundred, the same three people take the microphone. With Roomwave, everyone sends questions from their seat and the room decides which ones matter.",
    image: panel,
    alt: "A panel of four speakers with microphones on a conference stage",
    problem:
      "A panel ends, the host asks for questions, and the first hand up belongs to someone with a speech rather than a question. The good questions stay in people's heads, or go to the person in the next seat.",
    moments: [
      {
        title: "Questions with upvotes",
        body: "People send questions from their phones while the panel talks. The room upvotes the ones it wants answered, and the host sees them in order.",
        example: "Questions for the panel",
      },
      {
        title: "Moderation before the screen",
        body: "Turn on approval and nothing appears on the big screen until you have read it. The word filter stops the worst before you even see it.",
        example: "Approve each question before it shows",
      },
      {
        title: "Feedback before people leave",
        body: "A rating at the end of each session tells the organisers which talks worked, while the room is still full.",
        example: "How useful was this session? 1 to 10",
      },
    ],
    template: { id: "panel", name: "Panel discussion" },
  },
  {
    slug: "education",
    name: "Lecture halls and classrooms",
    title: "Find out what they understood before they leave.",
    description: "Anonymous understanding checks, quick quizzes and an open question box for lecture halls and classrooms. Students join with their phones.",
    lead: "In a lecture theatre of a hundred, \"any questions?\" is met with silence. An anonymous check from every phone tells you which part to teach again.",
    image: lectureTheatre,
    alt: "Students on tiered wooden benches in a university lecture theatre",
    problem:
      "Nobody wants to be the one who did not understand. So nobody says so, and the gap shows up three weeks later in the exam.",
    moments: [
      {
        title: "Understanding checks",
        body: "A rating at the end of a topic, answered anonymously, shows how many students followed it and how many were lost.",
        example: "How well did you follow today's lecture?",
      },
      {
        title: "Quick quizzes",
        body: "Five timed questions to start the next class, with a leaderboard that makes revision something to compete in.",
        example: "Quiz with points for speed",
      },
      {
        title: "The question box",
        body: "Students ask what they did not dare to ask out loud. You answer the most upvoted at the start of the next lecture.",
        example: "What is still unclear?",
      },
    ],
    template: { id: "lecture-feedback", name: "Lecture feedback" },
  },
  {
    slug: "faith-and-community",
    name: "Churches and community halls",
    title: "Hear from the people at the back of the hall.",
    description: "Quizzes, word clouds and anonymous feedback for churches, youth groups and community meetings. Everyone joins on their phone, no app needed.",
    lead: "Youth nights, fellowship meetings, community forums: the loudest voices are rarely the only ones worth hearing. Roomwave gives the quiet majority a way in.",
    image: communityHall,
    alt: "People of all ages in a community hall, laughing at something at the front",
    problem:
      "Community meetings run on the voices that are comfortable at a microphone. The young, the shy and the newest members leave without having said a word.",
    moments: [
      {
        title: "Quiz nights",
        body: "A timed quiz with a leaderboard turns a youth evening into a competition the whole hall follows.",
        example: "Quiz night: five questions",
      },
      {
        title: "Word clouds",
        body: "One word from everyone shows the mood of the room in a single picture, and offensive words never reach the screen.",
        example: "One word for this year",
      },
      {
        title: "Anonymous feedback",
        body: "Plan the next term on what people actually want, not on what was said loudest at the last meeting.",
        example: "Which topic should we cover next?",
      },
    ],
    template: { id: "quiz-night", name: "Quiz night" },
  },
  {
    slug: "workplace",
    name: "Company town halls",
    title: "Honest answers, without anyone standing up.",
    description: "Pulse checks, priorities and anonymous questions for leadership at company town halls and team meetings, in person or hybrid.",
    lead: "A town hall is only useful if people say what they think. Anonymous questions and live pulse checks get you the real answers while everyone is in the room.",
    image: townHall,
    alt: "Employees gathered for a town hall in a bright open-plan office",
    problem:
      "Leadership asks if there are any questions, and the room looks at its shoes. The real questions get asked afterwards, in the corridor, where nobody can answer them.",
    moments: [
      {
        title: "Pulse checks",
        body: "Two minutes at the start tells leadership how the quarter felt from the floor, not just from the dashboard.",
        example: "How did this quarter go for your team?",
      },
      {
        title: "Questions for leadership",
        body: "Anonymous, upvoted, moderated if you prefer. The questions that matter to most people rise to the top.",
        example: "Your questions for the leadership team",
      },
      {
        title: "Priorities, ranked by the room",
        body: "Ask people to pick what matters most next quarter and show the result straight away.",
        example: "How clear are our priorities?",
      },
    ],
    template: { id: "town-hall", name: "Company town hall" },
  },
];
