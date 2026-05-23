// Parallel HEAD-check for discovered thread URLs. Drops 404/410 (definitely
// gone). Keeps everything else (gives benefit of doubt to 403/429 from
// anti-bot rules like Reddit's). Per-URL timeout is short to keep this off
// the critical path.

import type { DiscoveredThread } from "./types";

const PER_URL_TIMEOUT_MS = 3500;

const REDDIT_PATTERN = /reddit\.com\/r\/[^/]+\/comments\/[^/]+/i;
const HN_PATTERN = /news\.ycombinator\.com\/item\?id=\d+/i;
const GITHUB_ISSUE_PATTERN = /github\.com\/[^/]+\/[^/]+\/issues\/\d+/i;
const SO_PATTERN = /stackoverflow\.com\/questions\/\d+/i;
const DEVTO_PATTERN = /dev\.to\/[^/]+\/[^/]+/i;
const X_PATTERN = /(?:x\.com|twitter\.com)\/[^/]+\/status\/\d+/i;

function urlMatchesPlatform(url: string, platform: string): boolean {
  switch (platform) {
    case "reddit":
      return REDDIT_PATTERN.test(url);
    case "hackernews":
      return HN_PATTERN.test(url);
    case "github":
      return GITHUB_ISSUE_PATTERN.test(url);
    case "stackoverflow":
      return SO_PATTERN.test(url);
    case "devto":
      return DEVTO_PATTERN.test(url);
    case "x":
      return X_PATTERN.test(url);
    default:
      return true;
  }
}

async function probeUrl(url: string): Promise<"live" | "gone" | "unknown"> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PER_URL_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: ac.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LaunchAgent/0.2)" },
    });
    if (res.status === 404 || res.status === 410) return "gone";
    if (res.status >= 200 && res.status < 400) return "live";
    return "unknown";
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Drops threads with malformed platform URLs or URLs that explicitly 404.
 * Runs all checks in parallel.
 */
export async function validateThreadUrls(
  threads: DiscoveredThread[]
): Promise<{ live: DiscoveredThread[]; dropped: number }> {
  // First pass — pattern check (no network).
  const wellFormed = threads.filter((t) => urlMatchesPlatform(t.thread_url, t.platform));
  const malformedDropped = threads.length - wellFormed.length;

  // Second pass — parallel HEAD probes.
  const probes = await Promise.all(wellFormed.map((t) => probeUrl(t.thread_url)));
  const live = wellFormed.filter((_t, i) => probes[i] !== "gone");
  const liveDropped = wellFormed.length - live.length;

  return { live, dropped: malformedDropped + liveDropped };
}
