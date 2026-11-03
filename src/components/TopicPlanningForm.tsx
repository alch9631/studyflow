import { saveTopicPlanning } from "@/app/courses/planningActions";
import { readTopicPlanning } from "@/lib/topicPlanning";
import ValidatedForm from "./ValidatedForm";
import SubmitButton from "./SubmitButton";

export default function TopicPlanningForm({ topicId, planning, topics, assignments, de }: {
  topicId: string; planning: string | null; topics: { id: string; title: string }[];
  assignments: { id: string; title: string; done: boolean }[]; de: boolean;
}) {
  const value = readTopicPlanning(planning);
  const fieldClass = "mt-1 block min-h-11 w-full rounded-lg border border-border bg-surface p-2";
  return <details className="mt-3 rounded-xl border border-border p-3">
    <summary className="min-h-11 cursor-pointer text-sm font-medium">{de ? "Reihenfolge & Frist" : "Prerequisites & deadline"}</summary>
    <ValidatedForm action={saveTopicPlanning} successMessage={de ? "Lernplan aktualisiert." : "Study plan updated."}
      errorMessage={de ? "Prüfe die Voraussetzungen und die Aufgabe. Kreisverweise sind nicht möglich." : "Check the prerequisites and assignment. Circular dependencies are not allowed."} className="space-y-3 text-sm">
      <input type="hidden" name="topicId" value={topicId} />
      <label className="block">{de ? "Zuerst abschließen (Mehrfachauswahl)" : "Finish these first (select any that apply)"}
        <select name="prerequisites" multiple defaultValue={value.prerequisites} className={fieldClass}>
          {topics.filter(topic => topic.id !== topicId).map(topic => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
        </select>
      </label>
      <p className="text-muted-foreground">{de ? "Diese Arbeit wartet, bis die Voraussetzungen als erledigt bestätigt sind." : "This work waits until its prerequisites are confirmed complete."}</p>
      <label className="block">{de ? "Wichtigkeit" : "Importance"}
        <select name="importance" defaultValue={value.importance} className={fieldClass}>
          {[1, 2, 3, 4, 5].map(number => <option key={number} value={number}>{number}{number === 3 ? de ? " · normal" : " · normal" : ""}</option>)}
        </select>
      </label>
      <label className="block">{de ? "Frühere Frist (optional)" : "Earlier deadline (optional)"}
        <input name="dueDate" type="date" defaultValue={value.dueDate ?? ""} className={fieldClass} />
      </label>
      <label className="block">{de ? "Gehört zu einer Abgabe" : "Work toward an assignment"}
        <select name="assignmentId" defaultValue={value.assignmentId ?? ""} className={fieldClass}>
          <option value="">{de ? "Keine Abgabe" : "No assignment"}</option>
          {assignments.filter(assignment => !assignment.done).map(assignment => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}
        </select>
      </label>
      <SubmitButton variant="primary">{de ? "Speichern" : "Save"}</SubmitButton>
    </ValidatedForm>
  </details>;
}
