// The sample customers and requests that make the staff screens look like a
// business in use. Their addresses are made up; sample accounts are never sent
// email. The seed creates them once, and a nightly job moves their dates
// forward and undoes what the staff training account changed.

export interface SampleCustomer {
  name: string;
  email: string;
  organisation: string;
  plan: "free" | "pro" | "organisation";
  trialDays?: number;
  daysAgo: number;
  session?: { template: string; title?: string; people: number; daysAgo: number };
  /** More presentations of their own; with people, it has been run once. */
  decks?: { template: string; title: string; daysAgo: number; people?: number }[];
}

// Customers that make the staff screens look like a business in use. Their
// addresses are made up; sample accounts are never sent email.
export const SAMPLE_CUSTOMERS: SampleCustomer[] = [
  { name: "Wanjiku Kamau", email: "wanjiku.kamau@gmail.com", organisation: "Kilele Leadership Academy", plan: "pro", daysAgo: 58, session: { template: "workshop", title: "Leading teams: day one", people: 34, daysAgo: 6 }, decks: [{ template: "workshop", title: "Leading teams: day two", daysAgo: 5, people: 31 }, { template: "workshop", title: "Coaching conversations", daysAgo: 1 }] },
  { name: "Otieno Ouma", email: "otieno.ouma@yahoo.com", organisation: "Lakeside Teachers' College", plan: "pro", daysAgo: 51, session: { template: "lecture-feedback", title: "Statistics 201, week 6", people: 87, daysAgo: 2 }, decks: [{ template: "lecture-feedback", title: "Statistics 201, week 5", daysAgo: 9, people: 79 }, { template: "lecture-feedback", title: "Statistics 201, week 7", daysAgo: 0 }] },
  { name: "Fatuma Hassan", email: "fatuma.hassan@outlook.com", organisation: "Coastline Hospitality Group", plan: "organisation", daysAgo: 47, session: { template: "town-hall", title: "Q3 town hall", people: 146, daysAgo: 9 }, decks: [{ template: "town-hall", title: "Front office briefing", daysAgo: 3 }] },
  { name: "Kiprono Langat", email: "kiprono.langat@gmail.com", organisation: "Rift Valley Tech Summit", plan: "organisation", daysAgo: 40, session: { template: "panel", title: "Funding the next 100 startups", people: 182, daysAgo: 12 }, decks: [{ template: "panel", title: "Opening keynote Q&A", daysAgo: 13, people: 240 }] },
  { name: "Njeri Mwangi", email: "njeri.mwangi@gmail.com", organisation: "Northgate Fellowship", plan: "free", trialDays: 9, daysAgo: 13, session: { template: "quiz-night", title: "Youth Friday quiz", people: 41, daysAgo: 4 }, decks: [{ template: "workshop", title: "Youth camp check-in", daysAgo: 1 }] },
  { name: "Mutua Musyoka", email: "mutua.musyoka@gmail.com", organisation: "Brightpath Training", plan: "pro", daysAgo: 36, session: { template: "welcome", title: "Customer service refresher", people: 22, daysAgo: 1 }, decks: [{ template: "workshop", title: "Sales basics, module 1", daysAgo: 8, people: 19 }] },
  { name: "Chebet Koech", email: "chebet.koech@outlook.com", organisation: "Highland Medical Society", plan: "free", daysAgo: 30, decks: [{ template: "lecture-feedback", title: "CPD evening: antibiotic stewardship", daysAgo: 6 }] },
  { name: "Barasa Wekesa", email: "barasa.wekesa@yahoo.com", organisation: "Greenfield Secondary School", plan: "free", trialDays: 3, daysAgo: 11, decks: [{ template: "quiz-night", title: "Form 3 chemistry quiz", daysAgo: 3, people: 38 }] },
  { name: "Akinyi Odera", email: "akinyi.odera@gmail.com", organisation: "Juniper Credit Cooperative", plan: "pro", daysAgo: 27, decks: [{ template: "town-hall", title: "Annual members' meeting", daysAgo: 10, people: 212 }, { template: "workshop", title: "Loan officers' training", daysAgo: 2 }] },
  { name: "Halima Abdi", email: "halima.abdi@yahoo.com", organisation: "Tana River Water Trust", plan: "free", daysAgo: 24, decks: [{ template: "town-hall", title: "Water committee meeting", daysAgo: 4 }] },
  { name: "Kamau Njoroge", email: "kamau.njoroge@gmail.com", organisation: "Savanna Logistics", plan: "free", trialDays: 12, daysAgo: 2, decks: [{ template: "quiz-night", title: "Drivers' safety briefing", daysAgo: 1 }] },
  { name: "Nyambura Gitau", email: "nyambura.gitau@gmail.com", organisation: "Independent trainer", plan: "free", daysAgo: 19, decks: [{ template: "workshop", title: "Personal finance workshop", daysAgo: 7, people: 18 }] },
  { name: "Wafula Simiyu", email: "wafula.simiyu@gmail.com", organisation: "Westlands Rotary Club", plan: "free", daysAgo: 16, decks: [{ template: "town-hall", title: "Club assembly", daysAgo: 5 }] },
  { name: "Auma Owino", email: "auma.owino@outlook.com", organisation: "Kisumu Innovation Hub", plan: "pro", daysAgo: 21, decks: [{ template: "panel", title: "Demo day voting", daysAgo: 3, people: 96 }, { template: "welcome", title: "Founders' breakfast", daysAgo: 1 }] },
  { name: "Muthoni Ndungu", email: "muthoni.ndungu@gmail.com", organisation: "Summit Advocates", plan: "free", daysAgo: 8, decks: [{ template: "workshop", title: "Partners' retreat", daysAgo: 2 }] },
  { name: "Omondi Okoth", email: "omondi.okoth@outlook.com", organisation: "Riverside Community Church", plan: "free", trialDays: 6, daysAgo: 6, decks: [{ template: "quiz-night", title: "Sunday youth quiz", daysAgo: 2, people: 44 }] },
  { name: "Jeptoo Kirui", email: "jeptoo.kirui@yahoo.com", organisation: "Eldoret Polytechnic", plan: "free", daysAgo: 4, decks: [{ template: "welcome", title: "Orientation week", daysAgo: 1 }] },
  { name: "Mohamed Farah", email: "mohamed.farah@outlook.com", organisation: "Meridian Savings Society", plan: "organisation", daysAgo: 33, decks: [{ template: "town-hall", title: "AGM 2026", daysAgo: 15, people: 318 }, { template: "panel", title: "Board strategy session", daysAgo: 4 }] },
  { name: "Wairimu Karanja", email: "wairimu.karanja@gmail.com", organisation: "Mentorship circle", plan: "free", daysAgo: 1, decks: [{ template: "workshop", title: "Mentee check-in", daysAgo: 0 }] },
  { name: "Juma Mwakio", email: "juma.mwakio@gmail.com", organisation: "Voi Safari Tours", plan: "free", daysAgo: 0, decks: [{ template: "quiz-night", title: "Guide training quiz", daysAgo: 0 }] },
];

export interface SampleRequest {
  name: string;
  email: string;
  organisation: string;
  topic: "organisation" | "invoice" | "event" | "support" | "other";
  message: string;
  hoursAgo: number;
  handledHoursAgo?: number;
}

export const SAMPLE_REQUESTS: SampleRequest[] = [
  { name: "Grace Muriuki", email: "grace.muriuki@gmail.com", organisation: "Shoreline Events", topic: "event", message: "We are running a two-day conference in Mombasa in November with about 900 delegates. Can Roomwave handle Q&A for three rooms at once, and can we pay by invoice?", hoursAgo: 5 },
  { name: "Daniel Kiplagat", email: "daniel.kiplagat@yahoo.com", organisation: "Hillcrest Boys High School", topic: "organisation", message: "We would like accounts for 12 teachers. Is there a school price?", hoursAgo: 48 },
  { name: "Akinyi Odera", email: "akinyi.odera@gmail.com", organisation: "Juniper Credit Cooperative", topic: "invoice", message: "Please send an invoice for a year of Pro so our finance team can pay by bank transfer.", hoursAgo: 144, handledHoursAgo: 120 },
];

/** A staff account that sees and changes sample customers only, opened without a password from /try/staff. */
export const TRAINING_STAFF = { name: "Staff training", email: "training@roomwave.jeffgicharu.com" };
