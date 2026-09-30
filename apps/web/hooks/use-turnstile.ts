"use client";

import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** Cloudflare Turnstile (free). No site key = disabled (dev). Returns a ref to attach and the current token. */
export function useTurnstile() {
  const ref = useRef<HTMLDivElement | null>(null);
  const idRef = useRef<string | undefined>(undefined);
  const [token, setToken] = useState<string | undefined>();

  useEffect(() => {
    if (!SITE_KEY || !ref.current) return;
    const mount = () => {
      if (!window.turnstile || !ref.current || idRef.current) return;
      idRef.current = window.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        size: "flexible",
        callback: (t: string) => setToken(t),
        "expired-callback": () => setToken(undefined),
      });
    };
    if (window.turnstile) return mount();
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = mount;
    document.head.appendChild(s);
  }, []);

  const reset = useCallback(() => {
    setToken(undefined);
    if (idRef.current) window.turnstile?.reset(idRef.current);
  }, []);

  return { ref, token, reset, enabled: Boolean(SITE_KEY) };
}
