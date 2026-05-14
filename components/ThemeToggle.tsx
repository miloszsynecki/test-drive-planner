"use client";

import { useEffect, useState } from "react";

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="10" cy="10" r="3.5" />
      <line x1="10" y1="1.5" x2="10" y2="3.5" />
      <line x1="10" y1="16.5" x2="10" y2="18.5" />
      <line x1="1.5" y1="10" x2="3.5" y2="10" />
      <line x1="16.5" y1="10" x2="18.5" y2="10" />
      <line x1="4.1" y1="4.1" x2="5.5" y2="5.5" />
      <line x1="14.5" y1="14.5" x2="15.9" y2="15.9" />
      <line x1="15.9" y1="4.1" x2="14.5" y2="5.5" />
      <line x1="5.5" y1="14.5" x2="4.1" y2="15.9" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 14A8 8 0 0 1 6 3a8 8 0 1 0 11 11Z" />
    </svg>
  );
}

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  window.localStorage.setItem("tdp-theme", dark ? "dark" : "light");
}

export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem("tdp-theme");
    const initialDark = saved ? saved === "dark" : true;
    Promise.resolve().then(() => setDark(initialDark));
    applyTheme(initialDark);
  }, []);

  useEffect(() => {
    applyTheme(dark);
  }, [dark]);

  return (
    <button
      className="tdp-btn-icon"
      onClick={() => setDark((prev) => !prev)}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
