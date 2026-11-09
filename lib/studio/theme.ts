"use client";

import { useCallback, useEffect, useState } from "react";

/** Studio-only theme (dark by default), shared by the Studio and the admin frame around it. Per-browser convenience. */
const KEY = "alphogen.studio.theme";
const EVENT = "alphogen-studio-theme";

function read(): boolean {
  try { return window.localStorage.getItem(KEY) !== "light"; } catch { return true; }
}

export function useStudioDark(): [boolean, () => void] {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    setDark(read());
    const sync = () => setDark(read());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  const toggle = useCallback(() => {
    const next = !read();
    try { window.localStorage.setItem(KEY, next ? "dark" : "light"); } catch { /* keep in memory */ }
    setDark(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [dark, toggle];
}
