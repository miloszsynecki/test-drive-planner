"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <Button variant="outline" size="sm" onClick={() => setDark((prev) => !prev)}>
      {dark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
      {dark ? "Light" : "Dark"}
    </Button>
  );
}
