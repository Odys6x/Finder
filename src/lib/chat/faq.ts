/**
 * Small S1 Posting FAQ, written in our own words (spec §3 rule 5). The AI may answer
 * from these entries plus our school database only. Keep entries factual and hedged
 * where rules can change; point to MOE for the authoritative version.
 */
export interface FaqEntry {
  id: string;
  q: string;
  a: string;
}

export const FAQ: FaqEntry[] = [
  {
    id: "cop-year",
    q: "Which year's COPs should I look at?",
    a: "COPs (cut-off points) always come from the previous year's posting. Families choosing schools after PSLE 2026 use the PSLE score ranges from the 2025 posting (released in Dec 2025). New COPs are published alongside S1 posting results (around mid to late December) and are meant for the next cohort.",
  },
  {
    id: "score",
    q: "How does the PSLE score work?",
    a: "Each of the four subjects gets an Achievement Level from AL1 (best) to AL8. The PSLE score is the sum, from 4 (best) to 30. A lower score is better.",
  },
  {
    id: "posting-groups",
    q: "What are Posting Groups?",
    a: "Under Full Subject-Based Banding, students are posted in Posting Group 3, 2 or 1 based on their PSLE score, and schools publish COPs for each posting group. Your child's results slip states which posting group(s) they can use. Some students may choose between two posting groups.",
  },
  {
    id: "how-posting-works",
    q: "How are students posted?",
    a: "Students are posted in order of PSLE score (merit), and then by the order of their school choices. If students tie at the last place in a school, tie-breakers apply in this order: citizenship, then choice order, then computerised balloting.",
  },
  {
    id: "no-guarantee",
    q: "If my child's score meets last year's COP, is a place guaranteed?",
    a: "No. COPs move every year depending on how that year's cohort chooses. Meeting last year's COP is only a reference point, and tie-breakers can apply at the cut-off.",
  },
  {
    id: "choices",
    q: "How many schools can we choose, and does order matter?",
    a: "You submit up to 6 choices, and order matters because choices are considered in the order you list them. MOE suggests including 2–3 schools whose previous year's COPs are less stringent than your child's score, so there are realistic options.",
  },
  {
    id: "vacancy",
    q: "What does a COP of 30* mean?",
    a: "An asterisk on a PG1 COP of 30 means the school still had places left after all PG1 students who chose it were posted.",
  },
  {
    id: "affiliation",
    q: "How does affiliation work?",
    a: "Some secondary schools are affiliated to certain primary schools and may publish separate (often less stringent) COPs for affiliated students. Affiliation priority has conditions, for example on how the school is ranked in your choices — confirm the current rules in MOE's S1 posting materials.",
  },
  {
    id: "ip",
    q: "What is the Integrated Programme (IP)?",
    a: "IP schools let students go to A-Levels or IB without taking O-Levels. Some schools run both an IP track and an O-Level track with separate COPs, and some offer IP only.",
  },
  {
    id: "sap-hcl",
    q: "How do SAP schools and Higher Chinese work?",
    a: "Special Assistance Plan (SAP) schools emphasise both English and Chinese. Some SAP schools take Higher Chinese results into account in posting, so check the notes on the school's SchoolFinder page.",
  },
  {
    id: "dsa",
    q: "What about DSA-Sec?",
    a: "Students who accepted a confirmed Direct School Admission (DSA-Sec) offer are already committed to that school and do not choose schools in S1 posting.",
  },
  {
    id: "submit",
    q: "When and how do we submit choices?",
    a: "Choices are submitted online during a short window (about a week) after PSLE results are released. Check MOE's announcements for exact dates and the submission portal.",
  },
  {
    id: "specialised",
    q: "Are specialised schools in S1 posting?",
    a: "Specialised and specialised independent schools (for example schools for the arts, sports or maths and science, or for students who need a more practical curriculum) usually admit through their own processes rather than S1 posting choices. Check each school's admissions page.",
  },
  {
    id: "about-app",
    q: "Where does SchoolPath's data come from?",
    a: "School facts (address, CCAs, subjects, programmes) come from MOE's School Directory and Information datasets on data.gov.sg, under the Singapore Open Data Licence. SchoolPath is not affiliated with or endorsed by MOE. COPs, DSA talent areas and the latest details should be checked on MOE SchoolFinder.",
  },
];

export function faqText(): string {
  return FAQ.map((f) => `[faq:${f.id}] Q: ${f.q}\nA: ${f.a}`).join("\n\n");
}
