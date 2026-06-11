"use client";

/**
 * Last-resort boundary for errors in the root layout itself — it replaces the
 * whole document, so it ships its own <html>/<body> + inline styles (the app's
 * CSS/layout aren't available here).
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#0b0f17",
          color: "#e5e7eb",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <div style={{ fontSize: "2.5rem" }}>😵</div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0.5rem 0" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#9ca3af", margin: 0 }}>StudyFlow hit an unexpected error.</p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              background: "#00808f",
              color: "#fff",
              border: "none",
              borderRadius: "9999px",
              padding: "0.5rem 1.25rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
