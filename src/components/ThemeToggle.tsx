"use client";

import { useEffect, useState } from "react";

/** Night-mode toggle: flips `.dark` on <html> and remembers the choice. */
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
    setDark(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle night mode"
      title="Toggle night mode"
      className="rounded-full border border-gray-300 px-2.5 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
