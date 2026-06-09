/**
 * StudyFlow's lightweight, typed i18n dictionary.
 *
 * Why a hand-rolled dictionary instead of next-intl: this app is mostly server
 * components with a handful of client islands and no localized routing. A typed
 * dictionary keeps the bundle tiny, needs no middleware or route restructuring,
 * and is imported directly on both the server and the client — so only the
 * resolved locale string ever crosses the RSC boundary, never the messages.
 *
 * `en` is the source of truth for the shape; `de` must match it (TypeScript
 * enforces this via the `Messages` type). Add new strings to both. Interpolate
 * with `{name}` placeholders, filled from the `vars` arg of the translator.
 */

export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
/** Cookie that persists the user's explicit choice (read server-side). */
export const LOCALE_COOKIE = "sf-locale";

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/**
 * Pick a sensible default from an `Accept-Language` header — German if the user
 * prefers any German variant, English otherwise. Used only when no explicit
 * choice has been persisted yet.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase();
    if (!tag) continue;
    if (tag.startsWith("de")) return "de";
    if (tag.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}

const en = {
  common: {
    appName: "StudyFlow",
    skipToContent: "Skip to content",
    save: "Save",
    cancel: "Cancel",
    saving: "Saving…",
    loading: "Loading…",
    dismiss: "Dismiss",
    of: "of",
    min: "min",
    minPerDay: "min/day",
  },
  nav: {
    today: "Today",
    courses: "My Courses",
    modules: "Modules",
    insights: "Insights",
    search: "Search",
    settings: "Settings",
    menu: "Menu",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    mainMenu: "Main menu",
    appearance: "Appearance",
    allSettings: "All settings",
    theme: "Theme",
    language: "Language",
  },
  theme: {
    light: "Light",
    dark: "Dark",
    system: "System",
  },
  language: {
    de: "Deutsch",
    en: "English",
    label: "Language",
    description: "Choose the language StudyFlow is shown in.",
  },
  today: {
    title: "Today",
    courseCount: { one: "{count} course", other: "{count} courses" },
    minDone: "{done}/{total} min done",
    nextExam: "Next exam:",
    focusModeExamWeek: "🎯 Focus mode — exam week.",
    focusModeTail: "Prioritise its sessions today; tap to open the course →",
    classes: "🎓 Today's classes",
    deadlines: "📝 Deadlines",
    goalAchievable: "✅ Today's goal looks achievable",
    goalAtRisk: "⚠️ Today's goal is at risk",
    leftStudying: "{remaining} of studying left",
    focusTimeTail: "about {available} of realistic focus time before 22:00.",
    overBy:
      "You're ~{over} over. Recommendation: start now with the top blocks, run the 🍅 timer, and let the 🔁 reviews slide to tomorrow if you run out of time — StudyFlow will re-plan them around you.",
    emptyNoPlanTitle: "Let's build your study plan",
    emptyNoPlanDesc:
      "Add your first course and StudyFlow lays out exactly what to study each day — working backward from your exams.",
    emptyRestTitle: "Nothing scheduled today",
    emptyRestDesc:
      "It's not a study day — enjoy the break. Review your courses or get ahead whenever you like.",
    nextUp: "Next up",
    browseModules: "🎓 Browse TUHH modules",
    importSyllabus: "✨ Import a syllabus",
    addCourse: "✍️ Add a course",
    myCourses: "📚 My courses",
    insights: "📊 Insights",
  },
  pomodoro: {
    title: "🍅 Focus Timer",
    intro:
      "Study in focused sprints, then take a short break. Press Start when you sit down; it counts down and rolls into a break automatically.",
    focus: "🍅 Focus",
    break: "☕ Break",
    sessionsDone: { one: "{count} focus session done", other: "{count} focus sessions done" },
    start: "Start",
    pause: "Pause",
    reset: "Reset",
    timerSettings: "Timer settings",
    focusMin: "Focus (min)",
    breakMin: "Break (min)",
    savedHint: "Saved on this device. Changes apply when the timer is idle.",
    sprintDone: "Focus sprint done 🍅",
    sprintDesc:
      "Nice work. Log this {minutes}-minute sprint to a study block so your plan stays accurate — or skip it.",
    studyBlock: "Study block",
    notNow: "Not now",
    log: "Log {minutes} min",
    logging: "Logging…",
    logged: "Logged a {minutes}-min focus session. 🍅",
    logError: "Couldn't log that focus session — please try again.",
    logTitle: "Log a {minutes}-min focus session",
  },
  onboarding: {
    step: "Step {step} of {total}",
    skip: "Skip",
    back: "Back",
    next: "Next",
    takes: "Takes 30 seconds",
    addFirst: "Add my first course",
    s1Title: "Add your first course",
    s1Body:
      "Pick a TUHH module, import a syllabus, or add one by hand. StudyFlow reads it and works backward from your exam into a realistic day-by-day plan.",
    s2Title: "Check off sessions on Today",
    s2Body:
      "Each morning, open Today for exactly what to study — in order, for how long. Tap a session to mark it done; slip a day and StudyFlow re-plans around you.",
    s3Title: "Watch it work on Insights",
    s3Body:
      "Your streak, weekly consistency, GPA and credit points climb on Insights — the momentum that keeps you going all semester.",
  },
  block: {
    review: "🔁 Review",
    markDone: "Mark done",
    markNotDone: "Mark not done",
    done: "Done",
    reopen: "Reopen",
    sessionDone: "Nice — session done! ✓",
    sessionNotDone: "Session marked not done.",
    sessionError: "Couldn't update that session — please try again.",
  },
  courses: {
    title: "My Courses",
    newCourse: "+ New course",
    emptyTitle: "No courses yet",
    emptyDesc: "Pick how you want to start — StudyFlow builds the plan for you.",
    browseModules: "🎓 Browse TUHH modules",
    importSyllabus: "✨ Import a syllabus",
    addManually: "✍️ Add manually",
    topicsDone: "{done}/{total} topics done",
    updateProgress: "Update progress →",
    openCard: "{name} — open to update progress",
    priorityTitle: "{label} priority",
    howTitle: "ℹ️ How StudyFlow plans your studying",
    how1Pre: "Add your modules (manually, from the",
    how1Catalog: "TUHH catalog",
    how1Mid: ", or by",
    how1Upload: "uploading a syllabus/script",
    how1Post: ").",
    how2: "AI reads the content → topics, difficulty, and how long each takes.",
    how3Pre: "It works backward from your exam dates and spreads the work across all your courses within a realistic",
    how3Strong: "~3 h/day",
    how3Post: "— never cramming one day.",
    how4Pre: "It adds",
    how4Spaced: "spaced reviews",
    how4Mid: "and",
    how4SelfTest: "self-test questions",
    how4Post: "for active recall — the proven ways to remember.",
    how5Pre: "Each day, open",
    how5Today: "Today",
    how5Post: "for exactly what to study; tell it your progress and it re-plans around you.",
    appleTitle: "🍎 Apple priority:",
    appleBody:
      "each course is rated by urgency (exam soon) and workload —",
    appleOnTrack: "🍏 On track",
    appleMedium: "🟡 Medium",
    appleHigh: "🍎 High",
    appleTail: ". Red = focus here first.",
    menuLabel: "Course settings",
    menuOpen: "Course settings for {name}",
    export: "Export",
    delete: "Delete course",
    deleting: "Deleting…",
    swipeDelete: "Delete",
    cancel: "Cancel",
    deleteTitle: "Delete this course?",
    deleteDescPre: "This permanently removes",
    deleteDescPost: "— its topics, deadlines, and study plan. This can't be undone.",
  },
  courseDetail: {
    back: "My Courses",
    aiOptimized: "✨ AI-optimized",
    optimizeWithAI: "✨ Optimize with AI",
    optimizing: "Optimizing…",
    fellBehind: "😵‍💫 I fell behind — replan",
    replanning: "Replanning…",
    settingsSummary: "⚙️ Course settings (exam date, study time)",
    examDate: "Exam date",
    dailyPaceHint: "Daily pace is computed automatically (~{minutes} min/day).",
    studyDays: "Study days",
    saveRebuild: "Save & rebuild plan",
    finalGrade: "Final grade (1.0–5.0)",
    gradePlaceholder: "e.g. 1.7",
    saveGrade: "Save grade",
    gradeHint: "Leave empty to clear. Counts toward your Notenschnitt in Insights.",
    deleteCourse: "🗑 Delete this course",
    deleteTitle: "Delete this course?",
    deleteConfirm: "Delete course",
    deleteError: "Couldn't delete that course — please try again.",
    deleteMsgPre: "Deleting",
    deleteMsgPost: "also removes its topics, deadlines, files, and study plan. This can't be undone.",
    overloaded:
      "⏰ Even at a realistic ~3 h/day across all your courses, there isn't quite enough time to finish this one before the exam. Starting earlier, adding study days, or easing your other modules will help.",
    planned:
      "📅 Planned at about {minutes} min/day for this course — balanced within your ~3 h/day total across all modules.",
    updateProgressHeading: "📣 Update your progress",
    moduleFiles: "📎 Module files",
    analyzeFile: "✨ Analyze file & rebuild plan from its content",
    analyzing: "Analyzing…",
    apiKeyProgress:
      "Set OPENAI_API_KEY or ANTHROPIC_API_KEY to update progress in plain language. For now, tick topics below.",
    apiKeyFiles:
      "Set OPENAI_API_KEY or ANTHROPIC_API_KEY to analyze uploaded materials.",
    concepts: "Concepts: {list}",
    prerequisites: "Prerequisites: {list}",
    deadlinesHeading: "📝 Deadlines",
    deadlinesHint: "Homework, lab reports, hand-ins — anything due before the exam.",
    noDeadlines: "No deadlines yet.",
    due: "due {date}",
    deadlineDone: "Deadline done. ✓",
    deadlineNotDone: "Deadline marked not done.",
    deadlineUpdateError: "Couldn't update that deadline — please try again.",
    deadlineRemoved: "Deadline removed.",
    deadlineRemoveError: "Couldn't remove that deadline — please try again.",
    deleteDeadlineTitle: "Delete this deadline?",
    deleteDeadlineConfirm: "Delete deadline",
    deleteDeadlineAria: "Delete deadline: {title}",
    deleteDeadlineMsgPre: "Remove",
    deleteDeadlineMsgPost: "from this course? This can't be undone.",
    removing: "Removing…",
    topics: "Topics",
    noTopics: "No topics added.",
    selfTest: "🧠 Self-test ({count})",
    blockCount: { one: "{count} block · {min} min", other: "{count} blocks · {min} min" },
    studyPlan: "Study plan",
    nothingScheduled: "Nothing scheduled — all topics done, or no study days before the exam. 🎉",
    examOn: "Exam {date} · ~{minutes} min/day · {done}/{total} topics done",
    addDeadline: "Add deadline",
    deadlineTitlePlaceholder: "e.g. Problem set 5",
    add: "Add",
    adding: "Adding…",
    deadlineAdded: "Deadline added.",
    deadlineAddError: "Couldn't add that deadline — check the fields and try again.",
    titleLabel: "Title",
    dueLabelField: "Due",
    progressError: "Couldn't apply that update — please try again.",
    progressQuestion: "Where are you at?",
    progressPlaceholder:
      "In your own words — e.g. 'done with sorting and graphs, still shaky on dynamic programming'",
    applying: "Applying…",
    applyRebuild: "✨ Apply & rebuild plan",
    topicDone: "Topic done — plan updated. ✓",
    topicReopened: "Topic reopened — plan updated.",
    topicError: "Couldn't update that topic — please try again.",
    note: "Note",
    noteAria: "Note for {title}",
    notePlaceholder: "e.g. Prof stressed the proof on slide 23; revisit eigenvalues.",
    noteHasNote: "has a note",
    noteHasNoteTitle: "This topic has a note",
    noteStatusIdle: "Jot down anything worth remembering for this topic.",
    noteStatusDirty: "Unsaved changes…",
    noteStatusSaving: "Saving…",
    noteStatusSaved: "Saved ✓",
    noteStatusError: "Couldn't save — keep typing to retry.",
    clearNote: "Clear note",
    noteCleared: "Note cleared.",
    noteClearError: "Couldn't clear that note — please try again.",
    filePrompt: "Tap to choose a file from Files — PDF, TXT, or MD",
    fileChooseDifferent: "Choose a different file",
    fileChoose: "Choose file",
    banners: {
      healed: "✓ Plan rebuilt around the days you have left.",
      "healed-over":
        "✓ Plan rebuilt — it's tight, though. Adding study days or starting earlier will help it all fit.",
      saved: "✓ Course updated and plan rebuilt.",
      progress: "✓ Progress applied — your plan adjusted.",
      "progress-none":
        "No matching topics found in that update — try naming them as they appear below.",
      "progress-error": "Couldn't reach the AI to read that. Check your API key, then try again.",
      optimized: "✨ AI re-optimized your plan — difficulty, order, and review sessions updated.",
      "optimize-failed":
        "Couldn't optimize with AI (no key, or the call failed). Plan is unchanged.",
      analyzed: "✨ Analyzed your file and rebuilt the topics + plan from its actual content.",
      "analyze-error": "Couldn't analyze that file (unreadable, or AI error). Try another file.",
      "analyze-unsupported": "PPTX isn't supported yet — export the slides to PDF and upload that.",
      "analyze-nofile": "Choose a file first.",
      graded: "✓ Grade saved.",
      "past-exam": "Exam date can't be in the past — not saved.",
      "rate-limited": "You're doing that a lot — give it a minute and try again.",
    },
  },
  insights: {
    title: "📊 Insights",
    subtitle: "How your studying is actually going.",
    emptyTitle: "No study data yet",
    emptyDesc:
      "Add a course and check off some sessions — your streak, progress, and grades will all appear here.",
    doneWhenDue: "✅ Done when due",
    focusLogged: "⏱️ Focus logged",
    next7days: "📚 Next 7 days",
    studyPlanned: "study planned",
    modulesDone: "🎓 Modules done",
    ofN: "of {count}",
    needsAttention: "Needs attention",
    topicsLabel: "{done}/{total} topics",
    grades: "🎓 Grades",
    graded: "{count} graded",
    notenschnitt: "Notenschnitt",
    lpEarned: "LP earned",
    gradeTrend: "Grade trend",
    thisWeek: "This week",
    nothingThisWeek: "Nothing scheduled this week.",
    onTopWeek: "You're on top of this week. 🎉",
    weekPctDone: "{pct}% of this week's plan done.",
    last7days: "Last 7 days",
    completedStudyTime: "completed study time",
    consistency: "Consistency",
    consistencyHint: "How often you showed up over the last 14 days.",
    rockSolid:
      "Rock solid — active on {days} of the last 14 days. This rhythm is what makes exam prep stick.",
    steadyHabit:
      "A steady habit is forming: {days} of the last 14 days active. A few more sessions and it'll feel automatic.",
    smallSessions:
      "Studied on {days} of the last 14 days. Small daily sessions beat rare marathons — even 20 minutes keeps the streak alive.",
    byCourse: "By course",
    noCourses: "No courses yet.",
    browseModules: "🎓 Browse TUHH modules",
    myCourses: "📚 My courses",
  },
  streak: {
    label: "{count}-day streak",
    badgeTitle: { one: "You've studied {count} day in a row — keep it going!", other: "You've studied {count} days in a row — keep it going!" },
    streakAria: "Study streak",
    noActive: "No active streak",
    startOne: "Check off a session today to start one.",
    legendary: "Legendary — a 30-day-plus streak. 🎉",
    toNext: { one: "{count} day to your next 🔥 milestone.", other: "{count} days to your next 🔥 milestone." },
    personalBest: "Personal best",
    best: "Best",
    dayShort: "d",
  },
  fab: {
    quickAdd: "Quick add",
    addCourse: "Add a course",
    importSyllabus: "Import a syllabus",
    browseModules: "Browse modules",
    addDeadline: "Add a deadline",
  },
  settings: {
    title: "⚙️ Settings",
    subtitle: "Set up your timetable, calendar sync and reminders — and choose how StudyFlow looks.",
    rateLimited: "That was a bit too quick — please wait a moment, then try again.",
    studySetup: "Study setup",
    timetableTitle: "My timetable",
    timetableDesc: "Add your weekly lectures so your real week shows up on Today.",
    calendarTitle: "Calendar sync",
    calendarDesc:
      "Subscribe to your study plan in Apple or Google Calendar. Unlike a one-time export, this feed updates itself whenever your plan changes.",
    remindersTitle: "Reminders",
    remindersDesc: "Get a nudge for the day's plan and any exams coming up.",
    preferences: "Preferences",
    languageTitle: "Language",
    languageDesc: "Choose the language StudyFlow is shown in.",
    appearanceTitle: "Appearance",
    appearanceDesc: "Choose how StudyFlow looks. “System” follows your device's light or dark setting.",
    accountTitle: "Account",
    accountDesc:
      "You're on a shared local profile for now. Personal login — so each student gets their own private courses and study plans — is coming soon.",
    loginSoon: "🔒 Login coming soon",
  },
  apple: {
    green: "On track",
    yellow: "Medium",
    red: "High",
  },
  charts: {
    weekdays: {
      Su: "Sunday",
      Mo: "Monday",
      Tu: "Tuesday",
      We: "Wednesday",
      Th: "Thursday",
      Fr: "Friday",
      Sa: "Saturday",
    },
    weekdaysShort: {
      Su: "Sun",
      Mo: "Mon",
      Tu: "Tue",
      We: "Wed",
      Th: "Thu",
      Fr: "Fri",
      Sa: "Sat",
    },
  },
  dates: {
    examPassed: "exam passed",
    examToday: "exam today",
    examTomorrow: "exam tomorrow",
    examDays: "{days} days to exam",
    examWeeks: "{weeks} weeks to exam",
    overdue: "overdue",
    dueToday: "due today",
    dueTomorrow: "due tomorrow",
    daysLeft: "{days} days left",
    weeksLeft: "{weeks} weeks left",
  },
};

export type Messages = typeof en;

const de: Messages = {
  common: {
    appName: "StudyFlow",
    skipToContent: "Zum Inhalt springen",
    save: "Speichern",
    cancel: "Abbrechen",
    saving: "Speichern…",
    loading: "Lädt…",
    dismiss: "Schließen",
    of: "von",
    min: "Min",
    minPerDay: "Min/Tag",
  },
  nav: {
    today: "Heute",
    courses: "Meine Kurse",
    modules: "Module",
    insights: "Statistiken",
    search: "Suche",
    settings: "Einstellungen",
    menu: "Menü",
    openMenu: "Menü öffnen",
    closeMenu: "Menü schließen",
    mainMenu: "Hauptmenü",
    appearance: "Darstellung",
    allSettings: "Alle Einstellungen",
    theme: "Design",
    language: "Sprache",
  },
  theme: {
    light: "Hell",
    dark: "Dunkel",
    system: "System",
  },
  language: {
    de: "Deutsch",
    en: "English",
    label: "Sprache",
    description: "Wähle die Sprache, in der StudyFlow angezeigt wird.",
  },
  today: {
    title: "Heute",
    courseCount: { one: "{count} Kurs", other: "{count} Kurse" },
    minDone: "{done}/{total} Min erledigt",
    nextExam: "Nächste Prüfung:",
    focusModeExamWeek: "🎯 Fokusmodus — Prüfungswoche.",
    focusModeTail: "Heute haben ihre Einheiten Vorrang; tippen, um den Kurs zu öffnen →",
    classes: "🎓 Heutige Veranstaltungen",
    deadlines: "📝 Fristen",
    goalAchievable: "✅ Das heutige Ziel ist machbar",
    goalAtRisk: "⚠️ Das heutige Ziel ist in Gefahr",
    leftStudying: "noch {remaining} Lernzeit übrig",
    focusTimeTail: "etwa {available} realistische Fokuszeit bis 22:00 Uhr.",
    overBy:
      "Du liegst ~{over} darüber. Empfehlung: Fang jetzt mit den obersten Blöcken an, nutze den 🍅 Timer und lass die 🔁 Wiederholungen notfalls auf morgen rutschen — StudyFlow plant sie für dich neu ein.",
    emptyNoPlanTitle: "Lass uns deinen Lernplan erstellen",
    emptyNoPlanDesc:
      "Füge deinen ersten Kurs hinzu und StudyFlow legt genau fest, was du jeden Tag lernst — rückwärts von deinen Prüfungen geplant.",
    emptyRestTitle: "Heute nichts geplant",
    emptyRestDesc:
      "Heute ist kein Lerntag — genieß die Pause. Schau dir deine Kurse an oder arbeite vor, wann immer du magst.",
    nextUp: "Als Nächstes",
    browseModules: "🎓 TUHH-Module durchsuchen",
    importSyllabus: "✨ Lehrplan importieren",
    addCourse: "✍️ Kurs hinzufügen",
    myCourses: "📚 Meine Kurse",
    insights: "📊 Statistiken",
  },
  pomodoro: {
    title: "🍅 Fokus-Timer",
    intro:
      "Lerne in fokussierten Sprints und mach dann eine kurze Pause. Drück auf Start, wenn du dich hinsetzt; er zählt herunter und geht automatisch in eine Pause über.",
    focus: "🍅 Fokus",
    break: "☕ Pause",
    sessionsDone: { one: "{count} Fokus-Einheit erledigt", other: "{count} Fokus-Einheiten erledigt" },
    start: "Start",
    pause: "Pause",
    reset: "Zurücksetzen",
    timerSettings: "Timer-Einstellungen",
    focusMin: "Fokus (Min)",
    breakMin: "Pause (Min)",
    savedHint: "Auf diesem Gerät gespeichert. Änderungen gelten, wenn der Timer pausiert.",
    sprintDone: "Fokus-Sprint geschafft 🍅",
    sprintDesc:
      "Gut gemacht. Trag diesen {minutes}-minütigen Sprint auf einen Lernblock ein, damit dein Plan aktuell bleibt — oder überspring es.",
    studyBlock: "Lernblock",
    notNow: "Jetzt nicht",
    log: "{minutes} Min eintragen",
    logging: "Wird eingetragen…",
    logged: "{minutes}-minütige Fokus-Einheit eingetragen. 🍅",
    logError: "Diese Fokus-Einheit konnte nicht eingetragen werden — bitte erneut versuchen.",
    logTitle: "{minutes}-minütige Fokus-Einheit eintragen",
  },
  onboarding: {
    step: "Schritt {step} von {total}",
    skip: "Überspringen",
    back: "Zurück",
    next: "Weiter",
    takes: "Dauert 30 Sekunden",
    addFirst: "Ersten Kurs hinzufügen",
    s1Title: "Füge deinen ersten Kurs hinzu",
    s1Body:
      "Wähle ein TUHH-Modul, importiere einen Lehrplan oder füge einen Kurs von Hand hinzu. StudyFlow liest ihn ein und plant rückwärts von deiner Prüfung einen realistischen Tagesplan.",
    s2Title: "Hak Einheiten unter Heute ab",
    s2Body:
      "Öffne jeden Morgen Heute für genau das, was du lernen sollst — der Reihe nach, für wie lange. Tippe eine Einheit an, um sie als erledigt zu markieren; verpasst du einen Tag, plant StudyFlow um dich herum neu.",
    s3Title: "Sieh den Fortschritt unter Statistiken",
    s3Body:
      "Deine Serie, wöchentliche Beständigkeit, dein Notenschnitt und deine Leistungspunkte steigen unter Statistiken — der Schwung, der dich das ganze Semester trägt.",
  },
  block: {
    review: "🔁 Wiederholung",
    markDone: "Als erledigt markieren",
    markNotDone: "Als offen markieren",
    done: "Erledigt",
    reopen: "Wieder öffnen",
    sessionDone: "Stark — Einheit erledigt! ✓",
    sessionNotDone: "Einheit als offen markiert.",
    sessionError: "Diese Einheit konnte nicht aktualisiert werden — bitte erneut versuchen.",
  },
  courses: {
    title: "Meine Kurse",
    newCourse: "+ Neuer Kurs",
    emptyTitle: "Noch keine Kurse",
    emptyDesc: "Wähle, wie du starten möchtest — StudyFlow erstellt den Plan für dich.",
    browseModules: "🎓 TUHH-Module durchsuchen",
    importSyllabus: "✨ Lehrplan importieren",
    addManually: "✍️ Manuell hinzufügen",
    topicsDone: "{done}/{total} Themen erledigt",
    updateProgress: "Fortschritt aktualisieren →",
    openCard: "{name} — öffnen, um den Fortschritt zu aktualisieren",
    priorityTitle: "Priorität {label}",
    howTitle: "ℹ️ So plant StudyFlow dein Lernen",
    how1Pre: "Füge deine Module hinzu (manuell, aus dem",
    how1Catalog: "TUHH-Katalog",
    how1Mid: ", oder per",
    how1Upload: "Hochladen eines Lehrplans/Skripts",
    how1Post: ").",
    how2: "Die KI liest den Inhalt → Themen, Schwierigkeit und wie lange jedes dauert.",
    how3Pre: "Sie plant rückwärts von deinen Prüfungsterminen und verteilt die Arbeit über all deine Kurse innerhalb realistischer",
    how3Strong: "~3 Std./Tag",
    how3Post: "— ohne an einem Tag zu pauken.",
    how4Pre: "Sie ergänzt",
    how4Spaced: "verteilte Wiederholungen",
    how4Mid: "und",
    how4SelfTest: "Selbsttest-Fragen",
    how4Post: "für aktives Erinnern — die bewährten Wege, sich Dinge zu merken.",
    how5Pre: "Öffne jeden Tag",
    how5Today: "Heute",
    how5Post: "für genau das, was zu lernen ist; sag ihr deinen Fortschritt und sie plant um dich herum neu.",
    appleTitle: "🍎 Apfel-Priorität:",
    appleBody:
      "jeder Kurs wird nach Dringlichkeit (Prüfung bald) und Arbeitslast bewertet —",
    appleOnTrack: "🍏 Im Plan",
    appleMedium: "🟡 Mittel",
    appleHigh: "🍎 Hoch",
    appleTail: ". Rot = hier zuerst ansetzen.",
    menuLabel: "Kurseinstellungen",
    menuOpen: "Kurseinstellungen für {name}",
    export: "Exportieren",
    delete: "Kurs löschen",
    deleting: "Löschen…",
    swipeDelete: "Löschen",
    cancel: "Abbrechen",
    deleteTitle: "Diesen Kurs löschen?",
    deleteDescPre: "Dies entfernt dauerhaft",
    deleteDescPost: "— mit Themen, Fristen und Lernplan. Das kann nicht rückgängig gemacht werden.",
  },
  courseDetail: {
    back: "Meine Kurse",
    aiOptimized: "✨ KI-optimiert",
    optimizeWithAI: "✨ Mit KI optimieren",
    optimizing: "Optimieren…",
    fellBehind: "😵‍💫 Ich bin im Rückstand — neu planen",
    replanning: "Neu planen…",
    settingsSummary: "⚙️ Kurseinstellungen (Prüfungstermin, Lernzeit)",
    examDate: "Prüfungstermin",
    dailyPaceHint: "Das Tagespensum wird automatisch berechnet (~{minutes} Min/Tag).",
    studyDays: "Lerntage",
    saveRebuild: "Speichern & Plan neu erstellen",
    finalGrade: "Endnote (1,0–5,0)",
    gradePlaceholder: "z. B. 1,7",
    saveGrade: "Note speichern",
    gradeHint: "Leer lassen zum Entfernen. Zählt zu deinem Notenschnitt unter Statistiken.",
    deleteCourse: "🗑 Diesen Kurs löschen",
    deleteTitle: "Diesen Kurs löschen?",
    deleteConfirm: "Kurs löschen",
    deleteError: "Dieser Kurs konnte nicht gelöscht werden — bitte erneut versuchen.",
    deleteMsgPre: "Das Löschen von",
    deleteMsgPost: "entfernt auch dessen Themen, Fristen, Dateien und Lernplan. Das kann nicht rückgängig gemacht werden.",
    overloaded:
      "⏰ Selbst bei realistischen ~3 Std./Tag über all deine Kurse reicht die Zeit nicht ganz, um diesen vor der Prüfung abzuschließen. Früher anfangen, Lerntage ergänzen oder andere Module entlasten hilft.",
    planned:
      "📅 Geplant mit etwa {minutes} Min/Tag für diesen Kurs — ausgewogen innerhalb deiner ~3 Std./Tag über alle Module.",
    updateProgressHeading: "📣 Aktualisiere deinen Fortschritt",
    moduleFiles: "📎 Moduldateien",
    analyzeFile: "✨ Datei analysieren & Plan aus dem Inhalt neu erstellen",
    analyzing: "Analysieren…",
    apiKeyProgress:
      "Setze OPENAI_API_KEY oder ANTHROPIC_API_KEY, um den Fortschritt in normaler Sprache zu aktualisieren. Hak vorerst Themen unten ab.",
    apiKeyFiles:
      "Setze OPENAI_API_KEY oder ANTHROPIC_API_KEY, um hochgeladene Materialien zu analysieren.",
    concepts: "Konzepte: {list}",
    prerequisites: "Voraussetzungen: {list}",
    deadlinesHeading: "📝 Fristen",
    deadlinesHint: "Hausaufgaben, Laborberichte, Abgaben — alles, was vor der Prüfung fällig ist.",
    noDeadlines: "Noch keine Fristen.",
    due: "fällig {date}",
    deadlineDone: "Frist erledigt. ✓",
    deadlineNotDone: "Frist als offen markiert.",
    deadlineUpdateError: "Diese Frist konnte nicht aktualisiert werden — bitte erneut versuchen.",
    deadlineRemoved: "Frist entfernt.",
    deadlineRemoveError: "Diese Frist konnte nicht entfernt werden — bitte erneut versuchen.",
    deleteDeadlineTitle: "Diese Frist löschen?",
    deleteDeadlineConfirm: "Frist löschen",
    deleteDeadlineAria: "Frist löschen: {title}",
    deleteDeadlineMsgPre: "",
    deleteDeadlineMsgPost: "aus diesem Kurs entfernen? Das kann nicht rückgängig gemacht werden.",
    removing: "Entfernen…",
    topics: "Themen",
    noTopics: "Keine Themen hinzugefügt.",
    selfTest: "🧠 Selbsttest ({count})",
    blockCount: { one: "{count} Block · {min} Min", other: "{count} Blöcke · {min} Min" },
    studyPlan: "Lernplan",
    nothingScheduled: "Nichts geplant — alle Themen erledigt oder keine Lerntage vor der Prüfung. 🎉",
    examOn: "Prüfung {date} · ~{minutes} Min/Tag · {done}/{total} Themen erledigt",
    addDeadline: "Frist hinzufügen",
    deadlineTitlePlaceholder: "z. B. Übungsblatt 5",
    add: "Hinzufügen",
    adding: "Hinzufügen…",
    deadlineAdded: "Frist hinzugefügt.",
    deadlineAddError: "Diese Frist konnte nicht hinzugefügt werden — prüf die Felder und versuch es erneut.",
    titleLabel: "Titel",
    dueLabelField: "Fällig",
    progressError: "Dieses Update konnte nicht angewendet werden — bitte erneut versuchen.",
    progressQuestion: "Wo stehst du gerade?",
    progressPlaceholder:
      "In eigenen Worten — z. B. „Sortieren und Graphen sind durch, dynamische Programmierung wackelt noch“",
    applying: "Anwenden…",
    applyRebuild: "✨ Anwenden & Plan neu erstellen",
    topicDone: "Thema erledigt — Plan aktualisiert. ✓",
    topicReopened: "Thema wieder geöffnet — Plan aktualisiert.",
    topicError: "Dieses Thema konnte nicht aktualisiert werden — bitte erneut versuchen.",
    note: "Notiz",
    noteAria: "Notiz zu {title}",
    notePlaceholder: "z. B. Prof betonte den Beweis auf Folie 23; Eigenwerte nochmal ansehen.",
    noteHasNote: "hat eine Notiz",
    noteHasNoteTitle: "Dieses Thema hat eine Notiz",
    noteStatusIdle: "Notiere alles, was zu diesem Thema wichtig ist.",
    noteStatusDirty: "Ungespeicherte Änderungen…",
    noteStatusSaving: "Speichern…",
    noteStatusSaved: "Gespeichert ✓",
    noteStatusError: "Speichern fehlgeschlagen — tipp weiter, um es erneut zu versuchen.",
    clearNote: "Notiz löschen",
    noteCleared: "Notiz gelöscht.",
    noteClearError: "Diese Notiz konnte nicht gelöscht werden — bitte erneut versuchen.",
    filePrompt: "Tippen, um eine Datei aus „Dateien“ zu wählen — PDF, TXT oder MD",
    fileChooseDifferent: "Andere Datei wählen",
    fileChoose: "Datei wählen",
    banners: {
      healed: "✓ Plan rund um deine verbleibenden Tage neu erstellt.",
      "healed-over":
        "✓ Plan neu erstellt — es ist allerdings knapp. Mehr Lerntage oder ein früherer Start helfen, dass alles passt.",
      saved: "✓ Kurs aktualisiert und Plan neu erstellt.",
      progress: "✓ Fortschritt übernommen — dein Plan wurde angepasst.",
      "progress-none":
        "Keine passenden Themen in diesem Update gefunden — versuch, sie wie unten angezeigt zu benennen.",
      "progress-error": "Die KI war nicht erreichbar. Prüf deinen API-Schlüssel und versuch es erneut.",
      optimized: "✨ KI hat deinen Plan neu optimiert — Schwierigkeit, Reihenfolge und Wiederholungen aktualisiert.",
      "optimize-failed":
        "Optimierung mit KI fehlgeschlagen (kein Schlüssel oder Aufruf gescheitert). Plan unverändert.",
      analyzed: "✨ Deine Datei analysiert und Themen + Plan aus ihrem tatsächlichen Inhalt neu erstellt.",
      "analyze-error": "Diese Datei konnte nicht analysiert werden (unlesbar oder KI-Fehler). Versuch eine andere Datei.",
      "analyze-unsupported": "PPTX wird noch nicht unterstützt — exportiere die Folien als PDF und lade das hoch.",
      "analyze-nofile": "Wähle zuerst eine Datei.",
      graded: "✓ Note gespeichert.",
      "past-exam": "Der Prüfungstermin darf nicht in der Vergangenheit liegen — nicht gespeichert.",
      "rate-limited": "Das machst du ziemlich oft — warte eine Minute und versuch es erneut.",
    },
  },
  insights: {
    title: "📊 Statistiken",
    subtitle: "Wie dein Lernen wirklich läuft.",
    emptyTitle: "Noch keine Lerndaten",
    emptyDesc:
      "Füge einen Kurs hinzu und hak ein paar Einheiten ab — deine Serie, dein Fortschritt und deine Noten erscheinen dann hier.",
    doneWhenDue: "✅ Pünktlich erledigt",
    focusLogged: "⏱️ Fokuszeit erfasst",
    next7days: "📚 Nächste 7 Tage",
    studyPlanned: "Lernzeit geplant",
    modulesDone: "🎓 Module abgeschlossen",
    ofN: "von {count}",
    needsAttention: "Braucht Aufmerksamkeit",
    topicsLabel: "{done}/{total} Themen",
    grades: "🎓 Noten",
    graded: "{count} benotet",
    notenschnitt: "Notenschnitt",
    lpEarned: "LP erworben",
    gradeTrend: "Notenverlauf",
    thisWeek: "Diese Woche",
    nothingThisWeek: "Diese Woche nichts geplant.",
    onTopWeek: "Du hast diese Woche im Griff. 🎉",
    weekPctDone: "{pct}% des Wochenplans erledigt.",
    last7days: "Letzte 7 Tage",
    completedStudyTime: "abgeschlossene Lernzeit",
    consistency: "Beständigkeit",
    consistencyHint: "Wie oft du in den letzten 14 Tagen dabei warst.",
    rockSolid:
      "Bombenfest — an {days} der letzten 14 Tage aktiv. Dieser Rhythmus macht die Prüfungsvorbereitung nachhaltig.",
    steadyHabit:
      "Eine feste Gewohnheit entsteht: an {days} der letzten 14 Tage aktiv. Ein paar Einheiten mehr und es läuft automatisch.",
    smallSessions:
      "An {days} der letzten 14 Tage gelernt. Kleine tägliche Einheiten schlagen seltene Marathons — schon 20 Minuten halten die Serie am Leben.",
    byCourse: "Nach Kurs",
    noCourses: "Noch keine Kurse.",
    browseModules: "🎓 TUHH-Module durchsuchen",
    myCourses: "📚 Meine Kurse",
  },
  streak: {
    label: "{count}-Tage-Serie",
    badgeTitle: { one: "Du hast {count} Tag am Stück gelernt — weiter so!", other: "Du hast {count} Tage am Stück gelernt — weiter so!" },
    streakAria: "Lern-Serie",
    noActive: "Keine aktive Serie",
    startOne: "Hak heute eine Einheit ab, um eine zu starten.",
    legendary: "Legendär — eine Serie von über 30 Tagen. 🎉",
    toNext: { one: "noch {count} Tag bis zum nächsten 🔥 Meilenstein.", other: "noch {count} Tage bis zum nächsten 🔥 Meilenstein." },
    personalBest: "Persönlicher Rekord",
    best: "Bestwert",
    dayShort: "T",
  },
  fab: {
    quickAdd: "Schnell hinzufügen",
    addCourse: "Kurs hinzufügen",
    importSyllabus: "Lehrplan importieren",
    browseModules: "Module durchsuchen",
    addDeadline: "Frist hinzufügen",
  },
  settings: {
    title: "⚙️ Einstellungen",
    subtitle: "Richte deinen Stundenplan, die Kalendersynchronisierung und Erinnerungen ein — und wähle, wie StudyFlow aussieht.",
    rateLimited: "Das ging etwas zu schnell — warte einen Moment und versuch es erneut.",
    studySetup: "Lern-Setup",
    timetableTitle: "Mein Stundenplan",
    timetableDesc: "Füge deine wöchentlichen Vorlesungen hinzu, damit deine echte Woche unter Heute erscheint.",
    calendarTitle: "Kalendersynchronisierung",
    calendarDesc:
      "Abonniere deinen Lernplan in Apple oder Google Kalender. Anders als ein einmaliger Export aktualisiert sich dieser Feed selbst, sobald sich dein Plan ändert.",
    remindersTitle: "Erinnerungen",
    remindersDesc: "Erhalte einen Anstoß für den Tagesplan und anstehende Prüfungen.",
    preferences: "Einstellungen",
    languageTitle: "Sprache",
    languageDesc: "Wähle die Sprache, in der StudyFlow angezeigt wird.",
    appearanceTitle: "Darstellung",
    appearanceDesc: "Wähle, wie StudyFlow aussieht. „System“ folgt der Hell-/Dunkel-Einstellung deines Geräts.",
    accountTitle: "Konto",
    accountDesc:
      "Du nutzt vorerst ein gemeinsames lokales Profil. Ein persönlicher Login — damit jede:r Studierende eigene private Kurse und Lernpläne erhält — kommt bald.",
    loginSoon: "🔒 Login kommt bald",
  },
  apple: {
    green: "Im Plan",
    yellow: "Mittel",
    red: "Hoch",
  },
  charts: {
    weekdays: {
      Su: "Sonntag",
      Mo: "Montag",
      Tu: "Dienstag",
      We: "Mittwoch",
      Th: "Donnerstag",
      Fr: "Freitag",
      Sa: "Samstag",
    },
    weekdaysShort: {
      Su: "So",
      Mo: "Mo",
      Tu: "Di",
      We: "Mi",
      Th: "Do",
      Fr: "Fr",
      Sa: "Sa",
    },
  },
  dates: {
    examPassed: "Prüfung vorbei",
    examToday: "Prüfung heute",
    examTomorrow: "Prüfung morgen",
    examDays: "{days} Tage bis zur Prüfung",
    examWeeks: "{weeks} Wochen bis zur Prüfung",
    overdue: "überfällig",
    dueToday: "heute fällig",
    dueTomorrow: "morgen fällig",
    daysLeft: "noch {days} Tage",
    weeksLeft: "noch {weeks} Wochen",
  },
};
export const MESSAGES: Record<Locale, Messages> = { en, de };

/** Dotted leaf-key paths into the message tree (e.g. "nav.today"). */
type Leaf<T> = T extends string
  ? ""
  : {
      [K in keyof T & string]: Leaf<T[K]> extends "" ? K : `${K}.${Leaf<T[K]>}`;
    }[keyof T & string];
export type MessageKey = Leaf<Messages>;

type Vars = Record<string, string | number>;

function lookup(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

function fill(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

export type Translator = {
  /** Translate a leaf key, filling `{placeholders}` from `vars`. */
  (key: MessageKey, vars?: Vars): string;
  /** Pluralized translate: picks `<key>.one` / `<key>.other` by `count`. */
  n: (key: string, count: number, vars?: Vars) => string;
  locale: Locale;
};

/** Build a translator for a locale. Falls back to English, then the raw key. */
export function createTranslator(locale: Locale): Translator {
  const primary = MESSAGES[locale];
  const fallback = MESSAGES.en;

  const t = ((key: MessageKey, vars?: Vars): string => {
    const raw = lookup(primary, key) ?? lookup(fallback, key);
    return typeof raw === "string" ? fill(raw, vars) : key;
  }) as Translator;

  t.n = (key, count, vars) => {
    const variant = count === 1 ? "one" : "other";
    const raw = lookup(primary, `${key}.${variant}`) ?? lookup(fallback, `${key}.${variant}`);
    return typeof raw === "string" ? fill(raw, { count, ...vars }) : key;
  };

  t.locale = locale;
  return t;
}

/** Localized exam countdown — mirrors lib/dates.examCountdownLabel per locale. */
export function examCountdownLabel(t: Translator, days: number): string {
  if (days < 0) return t("dates.examPassed");
  if (days === 0) return t("dates.examToday");
  if (days === 1) return t("dates.examTomorrow");
  if (days <= 30) return t("dates.examDays", { days });
  return t("dates.examWeeks", { weeks: Math.round(days / 7) });
}

/** Localized deadline countdown — mirrors lib/dates.dueLabel per locale. */
export function dueLabel(t: Translator, days: number): string {
  if (days < 0) return t("dates.overdue");
  if (days === 0) return t("dates.dueToday");
  if (days === 1) return t("dates.dueTomorrow");
  if (days <= 14) return t("dates.daysLeft", { days });
  return t("dates.weeksLeft", { weeks: Math.round(days / 7) });
}
