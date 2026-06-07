// TUHH degree programs (Studiengänge) the catalog knows about.
// `seeded` = we have the module handbook imported; others fall back to manual
// entry (paste a syllabus / add courses by hand). Full Bachelor list per
// tuhh.de/tuhh/studium/studienangebot.
export type Program = {
  code: string;
  name: string;
  seeded: boolean;
};

export const PROGRAMS: Program[] = [
  { code: "IIW", name: "Informatik-Ingenieurwesen", seeded: true },
  { code: "AIW", name: "Allgemeine Ingenieurwissenschaften", seeded: false },
  { code: "BUI", name: "Bau- und Umweltingenieurwesen", seeded: false },
  { code: "GTW", name: "Berufsschullehramt Gewerblich-Technische Wissenschaften", seeded: false },
  { code: "CBI", name: "Chemie- und Bioingenieurwesen", seeded: false },
  { code: "CS", name: "Computer Science", seeded: true },
  { code: "DS", name: "Data Science", seeded: false },
  { code: "ET", name: "Elektrotechnik und Informationstechnik", seeded: false },
  { code: "ES", name: "Engineering Science", seeded: false },
  { code: "GT", name: "Green Technologies: Energie, Wasser, Klima", seeded: false },
  { code: "LAT", name: "Lehramt Arbeitslehre/Technik", seeded: false },
  { code: "MB", name: "Maschinenbau", seeded: false },
  { code: "MEC", name: "Mechatronik", seeded: false },
  { code: "SB", name: "Schiffbau", seeded: false },
  { code: "TM", name: "Technomathematik", seeded: false },
  { code: "WING", name: "Wirtschaftsingenieurwesen – Logistik und Mobilität", seeded: false },
];

export function programByCode(code: string): Program | undefined {
  return PROGRAMS.find((p) => p.code === code);
}
