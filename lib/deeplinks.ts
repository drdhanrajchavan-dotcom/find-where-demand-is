// Platform deep links — only Reddit submissions and X intents truly pre-fill
// the body. HN supports title+URL only; LinkedIn supports URL only.

export function buildRedditSubmitLink(opts: { subreddit: string; title: string; body: string }): string {
  const sub = opts.subreddit.replace(/^r\//i, "");
  const params = new URLSearchParams({
    title: opts.title,
    text: opts.body,
    selftext: "true",
  });
  return `https://www.reddit.com/r/${encodeURIComponent(sub)}/submit?${params.toString()}`;
}

export function buildXIntentLink(text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

export function buildHNSubmitLink(opts: { title: string; url?: string }): string {
  const params = new URLSearchParams();
  params.set("t", opts.title);
  if (opts.url) params.set("u", opts.url);
  return `https://news.ycombinator.com/submitlink?${params.toString()}`;
}

export function buildLinkedInShareLink(url: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
}

/**
 * Real Dev.to publish — server-side only, uses DEVTO_API_KEY.
 * Returns the published article URL.
 */
export async function publishDevtoArticle(opts: {
  title: string;
  bodyMarkdown: string;
  published?: boolean;
  tags?: string[];
}): Promise<{ url: string; id: number }> {
  const apiKey = process.env.DEVTO_API_KEY;
  if (!apiKey) throw new Error("DEVTO_API_KEY is not set");

  const res = await fetch("https://dev.to/api/articles", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      article: {
        title: opts.title,
        body_markdown: opts.bodyMarkdown,
        published: opts.published ?? true,
        tags: opts.tags ?? [],
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Dev.to publish ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  return { url: data.url, id: data.id };
}
