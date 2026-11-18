"use client";
import { supabase } from "@/utils/supabaseClient";

let installed = false;

/**
 * Every call the app makes to its own /api routes carries the signed-in user's session, so the
 * server can tell which workspace it is for instead of trusting an id in the request. Installed
 * once when the workspace opens; calls that already set Authorization are left alone.
 */
export function installAuthFetch() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const u = new URL(url, window.location.origin);
      const ours = u.origin === window.location.origin && u.pathname.startsWith("/api/") && !u.pathname.startsWith("/api/public/");
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      if (ours && !headers.has("Authorization")) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);
        return original(input, { ...init, headers });
      }
    } catch { /* fall through to a plain fetch */ }
    return original(input, init);
  };
}
