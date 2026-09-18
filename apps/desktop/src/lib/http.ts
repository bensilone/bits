/**
 * HTTP helper for Sparks desktop.
 *
 * Tauri 2 WKWebView blocks browser fetch() to localhost (tauri:// origin,
 * CORS, private-network). Prefer the Tauri HTTP plugin (Rust) when available,
 * with a normal fetch() fallback for Vite browser/dev.
 */

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    // Tauri 2 injects internals; also accept legacy marker
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

let tauriFetchPromise: Promise<FetchLike | null> | null = null;

async function getTauriFetch(): Promise<FetchLike | null> {
  if (!isTauriRuntime()) return null;
  if (!tauriFetchPromise) {
    tauriFetchPromise = import("@tauri-apps/plugin-http")
      .then((m) => m.fetch as FetchLike)
      .catch(() => null);
  }
  return tauriFetchPromise;
}

/** Fetch via Tauri HTTP plugin when in the desktop app; else browser fetch. */
export async function apiFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const tauriFetch = await getTauriFetch();
  if (tauriFetch) {
    try {
      return await tauriFetch(input, init);
    } catch (err) {
      // Plugin missing/misconfigured — fall back so Vite browser still works
      console.warn("Tauri HTTP plugin fetch failed; falling back to window.fetch", err);
    }
  }
  return fetch(input, init);
}
