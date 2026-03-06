import { createRoot } from "react-dom/client";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found");
}

const root = createRoot(rootElement);

function renderStartupError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown startup error";

  root.render(
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#020617",
        color: "#e2e8f0",
        padding: "24px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "720px",
          width: "100%",
          background: "rgba(15, 23, 42, 0.92)",
          border: "1px solid rgba(148, 163, 184, 0.25)",
          borderRadius: "16px",
          padding: "24px",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.35)",
        }}
      >
        <h1 style={{ margin: "0 0 12px", fontSize: "1.5rem", lineHeight: 1.2 }}>LoanFlow failed to start</h1>
        <p style={{ margin: "0 0 12px", color: "#cbd5e1" }}>
          The frontend loaded, but a required configuration value is missing or invalid.
        </p>
        <pre
          style={{
            margin: "0 0 12px",
            padding: "12px",
            borderRadius: "12px",
            overflowX: "auto",
            background: "#0f172a",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            color: "#f8fafc",
            whiteSpace: "pre-wrap",
          }}
        >
          {message}
        </pre>
        <p style={{ margin: 0, color: "#94a3b8" }}>
          On Hostinger, verify the build used valid `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and
          `VITE_API_BASE_URL` values, then upload the new `dist` folder.
        </p>
      </div>
    </div>,
  );
}

import("./App.tsx")
  .then(({ default: App }) => {
    root.render(<App />);
  })
  .catch((error) => {
    console.error("Application startup failed", error);
    renderStartupError(error);
  });
