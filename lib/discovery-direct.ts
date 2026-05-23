// Path B discovery — direct platform API calls in JS, used as fallback when
// the Managed Agents sandbox is rate-limited or times out. Each function
// returns DiscoveredThread[] in the same shape the sandbox agents produce.

import type { DiscoveredThread, Platform, TargetComment } from "./types";

const COMMON_TIMEOUT_MS = 12_000;

function abortAfter(ms: number): { signal: AbortSignal; cancel: () => void } {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return { signal: ac.signal, cancel: () => clearTimeout(t) };
}

function snippet(text: string | undefined | null, max = 300): string {
  return (text ?? "").replace(/\s+/g, " ").slice(0, max).trim();
}

function uniqByUrl(threads: DiscoveredThread[]): DiscoveredThread[] {
  const seen = new Set<string>();
  return threads.filter((t) => {
    if (seen.has(t.thread_url)) return false;
    seen.add(t.thread_url);
    return true;
  });
}

// Pull 3-4 distinct queries from a product description. Cheap heuristic.
function deriveQueries(productDescription: string): string[] {
  const desc = productDescription.toLowerCase();
  const noiseWords = new Set([
    "an", "a", "the", "tool", "that", "with", "for", "of", "and", "or",
    "open-source", "open", "source", "alternative", "to",
  ]);
  const tokens = desc
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !noiseWords.has(w));
  const phrase = tokens.slice(0, 4).join(" ");
  return Array.from(
    new Set(
      [
        phrase,
        tokens.slice(0, 3).join(" "),
        `${tokens[0] ?? ""} ${tokens[tokens.length - 1] ?? ""}`.trim(),
        `looking for ${tokens.slice(0, 2).join(" ")}`,
      ].filter((q) => q.length > 0)
    )
  ).slice(0, 4);
}

export async function fetchHackerNewsDirect(
  productDescription: string
): Promise<DiscoveredThread[]> {
  const queries = deriveQueries(productDescription);
  const all: DiscoveredThread[] = [];
  for (const q of queries) {
    const { signal, cancel } = abortAfter(COMMON_TIMEOUT_MS);
    try {
      const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=10`;
      const res = await fetch(url, { signal });
      if (!res.ok) continue;
      const data = await res.json();
      for (const hit of data.hits ?? []) {
        if (!hit.objectID) continue;
        all.push({
          thread_url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
          platform: "hackernews",
          title: hit.title ?? hit.story_text?.slice(0, 80) ?? "",
          body_snippet: snippet(hit.story_text),
          engagement: (hit.points ?? 0) + (hit.num_comments ?? 0),
          created_at: hit.created_at ?? "",
          verbatim_phrases: extractPhrases(hit.title, hit.story_text),
        });
      }
    } catch {
      // swallow per-query errors
    } finally {
      cancel();
    }
  }
  const deduped = uniqByUrl(all).slice(0, 10);

  // Enrich top engagement stories with a target_comment when possible.
  // Bounded to top 5 to keep latency reasonable (5 × ~300ms ≈ 1.5s parallel).
  const enrichTargets = [...deduped]
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 5);
  const itemIds = new Set(
    enrichTargets
      .map((t) => t.thread_url.match(/item\?id=(\d+)/)?.[1])
      .filter((id): id is string => Boolean(id))
  );
  const commentByItemId = new Map<string, TargetComment>();
  await Promise.all(
    Array.from(itemIds).map(async (id) => {
      const c = await pickHNCommentTarget(id);
      if (c) commentByItemId.set(id, c);
    })
  );
  return deduped.map((t) => {
    const id = t.thread_url.match(/item\?id=(\d+)/)?.[1];
    if (id && commentByItemId.has(id)) {
      return { ...t, target_comment: commentByItemId.get(id) };
    }
    return t;
  });
}

async function pickHNCommentTarget(storyId: string): Promise<TargetComment | null> {
  const { signal, cancel } = abortAfter(6_000);
  try {
    const res = await fetch(`https://hn.algolia.com/api/v1/items/${storyId}`, {
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const children: Array<{
      id?: number;
      author?: string;
      text?: string;
      points?: number;
    }> = Array.isArray(data?.children) ? data.children : [];
    // Pick highest-scoring direct child comment with substantive text.
    const candidates = children
      .filter(
        (c) =>
          c &&
          typeof c.author === "string" &&
          typeof c.text === "string" &&
          c.text.length >= 60
      )
      .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
    const top = candidates[0];
    if (!top || !top.id) return null;
    return {
      author: top.author ?? "anonymous",
      text: stripHtml(top.text ?? "").slice(0, 400),
      score: typeof top.points === "number" ? top.points : 0,
      permalink: `https://news.ycombinator.com/item?id=${top.id}`,
    };
  } catch {
    return null;
  } finally {
    cancel();
  }
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchGitHubDirect(
  productDescription: string
): Promise<DiscoveredThread[]> {
  const queries = deriveQueries(productDescription);
  const all: DiscoveredThread[] = [];
  const token = process.env.GITHUB_TOKEN;
  for (const q of queries) {
    const { signal, cancel } = abortAfter(COMMON_TIMEOUT_MS);
    try {
      const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}+is:issue+is:open&sort=reactions&order=desc&per_page=10`;
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "LaunchAgent/0.1",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(url, { headers, signal });
      if (!res.ok) continue;
      const data = await res.json();
      for (const item of data.items ?? []) {
        all.push({
          thread_url: item.html_url,
          platform: "github",
          repo: item.repository_url
            ?.replace("https://api.github.com/repos/", "") ?? "",
          title: item.title,
          body_snippet: snippet(item.body),
          engagement: (item.reactions?.total_count ?? 0) + (item.comments ?? 0),
          created_at: item.created_at,
          verbatim_phrases: extractPhrases(item.title, item.body),
        });
      }
    } catch {
      // swallow
    } finally {
      cancel();
    }
  }
  return uniqByUrl(all).slice(0, 10);
}

export async function fetchStackOverflowDirect(
  productDescription: string
): Promise<DiscoveredThread[]> {
  const queries = deriveQueries(productDescription);
  const all: DiscoveredThread[] = [];
  for (const q of queries) {
    const { signal, cancel } = abortAfter(COMMON_TIMEOUT_MS);
    try {
      const url = `https://api.stackexchange.com/2.3/search/advanced?q=${encodeURIComponent(q)}&site=stackoverflow&sort=relevance&order=desc&pagesize=10`;
      const res = await fetch(url, { signal });
      if (!res.ok) continue;
      const data = await res.json();
      for (const q2 of data.items ?? []) {
        all.push({
          thread_url: q2.link,
          platform: "stackoverflow",
          title: q2.title,
          body_snippet: snippet(q2.title),
          engagement:
            (q2.score ?? 0) + (q2.answer_count ?? 0) + (q2.view_count ?? 0) / 100,
          created_at: new Date(q2.creation_date * 1000).toISOString(),
          verbatim_phrases: extractPhrases(q2.title),
        });
      }
    } catch {
      // swallow
    } finally {
      cancel();
    }
  }
  return uniqByUrl(all).slice(0, 10);
}

export async function fetchDevToDirect(
  productDescription: string
): Promise<DiscoveredThread[]> {
  const tokens = deriveQueries(productDescription)[0]?.split(" ") ?? [];
  const tagGuess = tokens[0] ?? "tooling";
  const { signal, cancel } = abortAfter(COMMON_TIMEOUT_MS);
  try {
    const url = `https://dev.to/api/articles?tag=${encodeURIComponent(tagGuess)}&top=30`;
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const items = await res.json();
    const desc = productDescription.toLowerCase();
    const matches = (items as Array<{
      url: string;
      title: string;
      description?: string;
      public_reactions_count?: number;
      comments_count?: number;
      published_at: string;
    }>)
      .filter((a) => {
        const blob = `${a.title} ${a.description ?? ""}`.toLowerCase();
        return tokens.some((t) => t.length > 3 && blob.includes(t));
      })
      .slice(0, 10);
    return matches.map((a) => ({
      thread_url: a.url,
      platform: "devto" as Platform,
      title: a.title,
      body_snippet: snippet(a.description),
      engagement: (a.public_reactions_count ?? 0) + (a.comments_count ?? 0),
      created_at: a.published_at,
      verbatim_phrases: extractPhrases(a.title, a.description),
    }));
  } catch {
    return [];
  } finally {
    cancel();
  }
}

// Reddit's public JSON endpoint blocks many server IPs but works often
// enough to be useful. Path B has two stages:
//   1. Gemini Flash + googleSearch surfaces candidate Reddit URLs.
//   2. For each candidate URL, fetch reddit.com/<path>.json to get the REAL
//      title, subreddit, score, body. If verification fails (404/403/timeout),
//      drop the URL entirely — Gemini frequently fabricates titles for
//      real-looking URLs, so an unverifiable URL is untrustworthy.
export async function fetchRedditDirect(
  productDescription: string
): Promise<DiscoveredThread[]> {
  const { generateContent, extractJson } = await import("./gemini");
  const prompt = `Use Google Search to find 5-10 Reddit threads where developers describe needing this product: "${productDescription}".

For each thread, return ONLY the thread_url field — the full https://www.reddit.com/r/... permalink. Do not paraphrase titles or invent details; we will verify each URL ourselves.

Prefer results from the last 12 months. Exclude promotional posts, AMAs, and product launch announcements.

Return JSON only (no preamble, no fences):
{"threads": [{"thread_url": "https://www.reddit.com/r/..."}]}`;

  let urls: string[] = [];
  try {
    const { signal, cancel } = abortAfter(20_000);
    try {
      const result = await generateContent({
        prompt,
        tools: [{ googleSearch: {} }],
        thinkingLevel: "minimal",
        signal,
      });
      const parsed = extractJson<{ threads?: Array<{ thread_url?: string }> }>(result.text);
      if (Array.isArray(parsed.threads)) {
        urls = parsed.threads
          .map((t) => (typeof t?.thread_url === "string" ? t.thread_url : ""))
          .filter((u) => u && /reddit\.com\/r\/[^/]+\/comments\/[^/]+/i.test(u));
      }
    } finally {
      cancel();
    }
  } catch {
    return [];
  }

  if (urls.length === 0) return [];

  // Stage 2 — verify each URL by fetching reddit.com/<path>.json. Drops URLs
  // where Gemini hallucinated a real-looking-but-wrong link or where Reddit
  // simply blocks us (we can't trust unverifiable URLs).
  const verified = await Promise.all(urls.map((u) => verifyRedditThread(u)));
  return verified.filter((t): t is DiscoveredThread => t !== null).slice(0, 10);
}

async function verifyRedditThread(url: string): Promise<DiscoveredThread | null> {
  // Append .json with a comment sort hint to get top comments in one call.
  const jsonUrl = url.replace(/\/?$/, "/").concat(".json?limit=15&sort=top");
  const { signal, cancel } = abortAfter(6_000);
  try {
    const res = await fetch(jsonUrl, {
      signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LaunchAgent/0.2)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const post = data?.[0]?.data?.children?.[0]?.data;
    if (!post || typeof post.title !== "string") return null;
    const phrases = extractRedditPhrases(post.title, post.selftext ?? "");
    const targetComment = pickRedditCommentTarget(data?.[1]?.data?.children);
    return {
      thread_url: url,
      platform: "reddit",
      title: post.title,
      body_snippet: snippet(typeof post.selftext === "string" ? post.selftext : ""),
      subreddit: typeof post.subreddit === "string" ? post.subreddit : undefined,
      engagement:
        (typeof post.score === "number" ? post.score : 0) +
        (typeof post.num_comments === "number" ? post.num_comments : 0),
      created_at:
        typeof post.created_utc === "number"
          ? new Date(post.created_utc * 1000).toISOString()
          : "",
      verbatim_phrases: phrases,
      target_comment: targetComment,
    };
  } catch {
    return null;
  } finally {
    cancel();
  }
}

function pickRedditCommentTarget(children: unknown): TargetComment | undefined {
  if (!Array.isArray(children)) return undefined;
  const candidates = children
    .filter(
      (
        c
      ): c is {
        kind: string;
        data: { author?: string; body?: string; score?: number; permalink?: string };
      } => Boolean(c) && typeof c === "object" && (c as { kind?: string }).kind === "t1"
    )
    .map((c) => c.data)
    .filter(
      (d) =>
        d &&
        typeof d.author === "string" &&
        d.author !== "[deleted]" &&
        d.author !== "AutoModerator" &&
        typeof d.body === "string" &&
        d.body.length >= 60 &&
        d.body !== "[deleted]" &&
        d.body !== "[removed]"
    )
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const top = candidates[0];
  if (!top || !top.permalink) return undefined;
  return {
    author: top.author ?? "anonymous",
    text: (top.body ?? "").replace(/\s+/g, " ").slice(0, 400).trim(),
    score: typeof top.score === "number" ? top.score : 0,
    permalink: `https://www.reddit.com${top.permalink}`,
  };
}

// X (Twitter) Path B — also Gemini Flash + googleSearch. No verification step
// because X has no public JSON endpoint to cross-check titles. We trust the
// googleSearch grounding metadata.
export async function fetchXDirect(
  productDescription: string
): Promise<DiscoveredThread[]> {
  const { generateContent, extractJson } = await import("./gemini");
  const prompt = `Use Google Search to find 5-10 X (Twitter) posts where developers describe needing this product: "${productDescription}".

For each post, return:
- thread_url: full https://x.com/{user}/status/{id} or twitter.com equivalent
- handle: the poster's @ handle without the @
- text: the tweet text (first 280 chars)
- engagement: best-effort estimate of likes + replies (number, 0 if unknown)

Only include real, accessible tweets. Exclude promotional tweets and tweets that are pure product announcements. Prefer the last 12 months.

Return JSON only (no preamble, no fences):
{"threads": [{"thread_url": "...", "handle": "...", "text": "...", "engagement": 0}]}`;

  try {
    const { signal, cancel } = abortAfter(20_000);
    try {
      const result = await generateContent({
        prompt,
        tools: [{ googleSearch: {} }],
        thinkingLevel: "minimal",
        signal,
      });
      const parsed = extractJson<{
        threads?: Array<{
          thread_url?: string;
          handle?: string;
          text?: string;
          engagement?: number;
        }>;
      }>(result.text);
      if (!Array.isArray(parsed.threads)) return [];
      return parsed.threads
        .filter(
          (t) =>
            typeof t?.thread_url === "string" &&
            /(?:x\.com|twitter\.com)\/[^/]+\/status\/\d+/i.test(t.thread_url)
        )
        .map((t) => {
          const text = (t.text ?? "").replace(/\s+/g, " ").trim();
          const title = text.slice(0, 80);
          return {
            thread_url: t.thread_url as string,
            platform: "x" as Platform,
            title,
            body_snippet: snippet(text),
            engagement: typeof t.engagement === "number" ? t.engagement : 0,
            created_at: "",
            verbatim_phrases: extractPhrases(text),
          };
        })
        .slice(0, 10);
    } finally {
      cancel();
    }
  } catch {
    return [];
  }
}

function extractRedditPhrases(title: string, selftext: string): string[] {
  const out: string[] = [];
  if (title) out.push(title.slice(0, 120));
  if (selftext) {
    const sentences = selftext
      .replace(/\s+/g, " ")
      .split(/[.?!]\s+/)
      .filter((s) => s.length >= 20 && s.length <= 160)
      .slice(0, 2);
    out.push(...sentences);
  }
  return out.slice(0, 3);
}

function extractPhrases(...inputs: Array<string | undefined | null>): string[] {
  const text = inputs.filter(Boolean).join(" ");
  if (!text) return [];
  // Pick 1-3 short noun-phrase-ish snippets — sentences split on punctuation.
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/[.?!]\s+/)
    .filter((s) => s.length >= 20 && s.length <= 140)
    .slice(0, 3);
  if (sentences.length > 0) return sentences;
  // Fallback: first short phrase up to 100 chars
  return [text.slice(0, 100).trim()];
}

export const DIRECT_FETCHERS: Record<
  Platform,
  (productDescription: string) => Promise<DiscoveredThread[]>
> = {
  hackernews: fetchHackerNewsDirect,
  github: fetchGitHubDirect,
  stackoverflow: fetchStackOverflowDirect,
  devto: fetchDevToDirect,
  reddit: fetchRedditDirect,
  x: fetchXDirect,
};
