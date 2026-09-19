"use client";
import { useEffect, useState } from "react";

// Reverses the whole site: everything white becomes black and everything black becomes white.
// The choice is remembered per browser; an inline script in the layout applies it before first paint.
export default function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => setLight(document.documentElement.dataset.theme === "light"), []);
  function flip() {
    const next = !light;
    setLight(next);
    if (next) document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem("commons-theme", next ? "light" : "dark"); } catch { /* private window: still switches for this visit */ }
  }
  return (
    <button className="theme-toggle" type="button" onClick={flip} aria-label={light ? "Switch to dark colours" : "Switch to light colours"} title={light ? "Switch to dark colours" : "Switch to light colours"}>
      {light ? "Dark" : "Light"}
    </button>
  );
}
