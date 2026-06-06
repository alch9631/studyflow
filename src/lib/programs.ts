// TUHH degree programs (Studiengänge) the catalog knows about.
// `seeded` = we have the module handbook imported; others fall back to manual entry.
export type Program = {
  code: string;
  name: string;
  seeded: boolean;
};

export const PROGRAMS: Program[] = [
  { code: "IIW", name: "Informatik-Ingenieurwesen", seeded: true },
  { code: "MB", name: "Maschinenbau", seeded: false },
  { code: "AIW", name: "Allgemeine Ingenieurwissenschaften", seeded: false },
];

export function programByCode(code: string): Program | undefined {
  return PROGRAMS.find((p) => p.code === code);
}
