import { prisma } from "./db";
import { parsePrefs, serializePrefs } from "./timePlacer";
import { ValidationError } from "./validate";

export async function currentDailyBudget(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { preferences: true } });
  return user.preferences ? parsePrefs(user.preferences).dailyBudgetMin ?? 60 : 60;
}

export async function confirmDailyBudget(userId: string, data: FormData) {
  // Older/offline forms can omit this field; they keep their existing preference.
  if (!data.has("dailyBudgetMin")) return;
  const minutes = Number(data.get("dailyBudgetMin"));
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 360) throw new ValidationError("Choose 15 to 360 minutes per day.");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { preferences: true } });
  await prisma.user.update({ where: { id: userId }, data: { preferences: serializePrefs({ ...parsePrefs(user.preferences), dailyBudgetMin: minutes }) } });
}
