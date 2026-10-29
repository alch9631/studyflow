import type { Metadata } from "next";
import { getCurrentUserId } from "@/lib/devUser";
import { getRemainingExams } from "@/lib/examSync";
import ExamsList from "./ExamsList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Exams", description: "Your remaining exams and current TUHH exam dates." };

export default async function ExamsPage() {
  const userId = await getCurrentUserId();
  return <main className="mx-auto max-w-3xl p-4 sm:p-8"><ExamsList data={await getRemainingExams(userId)} /></main>;
}
