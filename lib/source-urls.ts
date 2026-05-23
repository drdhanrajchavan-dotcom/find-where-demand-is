// Parsers for source-thread URLs. Used by reply cards to display canonical
// platform-specific badges and (where possible) to construct deeper links.

export function parseRedditUrl(
  url: string
): { subreddit: string; threadId: string } | null {
  const m = url.match(/reddit\.com\/r\/([^/]+)\/comments\/([^/?#]+)/i);
  if (!m) return null;
  return { subreddit: m[1], threadId: m[2] };
}

export function parseHNUrl(url: string): { itemId: string } | null {
  const m = url.match(/news\.ycombinator\.com\/item\?id=(\d+)/);
  if (!m) return null;
  return { itemId: m[1] };
}

export function parseGitHubUrl(
  url: string
): { owner: string; repo: string; issueNumber: string } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], issueNumber: m[3] };
}

export function parseSOUrl(
  url: string
): { questionId: string; slug?: string } | null {
  const m = url.match(/stackoverflow\.com\/questions\/(\d+)(?:\/([^/?#]+))?/);
  if (!m) return null;
  return { questionId: m[1], slug: m[2] };
}

export function parseDevtoUrl(
  url: string
): { username: string; slug: string } | null {
  const m = url.match(/dev\.to\/([^/]+)\/([^/?#]+)/);
  if (!m) return null;
  return { username: m[1], slug: m[2] };
}

export function parseXUrl(
  url: string
): { handle: string; statusId: string } | null {
  const m = url.match(/(?:x\.com|twitter\.com)\/([^/]+)\/status\/(\d+)/i);
  if (!m) return null;
  return { handle: m[1], statusId: m[2] };
}

/**
 * Short human-readable label for a source thread.
 * Example: "r/python", "HN 47819584", "owner/repo #123", "SO 12345", "@user".
 */
export function sourceLabel(opts: {
  platform: string;
  url: string;
  subreddit?: string;
  repo?: string;
}): string {
  switch (opts.platform) {
    case "reddit": {
      const p = parseRedditUrl(opts.url);
      return p ? `r/${p.subreddit}` : opts.subreddit ? `r/${opts.subreddit.replace(/^r\//, "")}` : "Reddit";
    }
    case "hackernews": {
      const p = parseHNUrl(opts.url);
      return p ? `HN ${p.itemId}` : "Hacker News";
    }
    case "github": {
      const p = parseGitHubUrl(opts.url);
      return p ? `${p.owner}/${p.repo} #${p.issueNumber}` : opts.repo ?? "GitHub";
    }
    case "stackoverflow": {
      const p = parseSOUrl(opts.url);
      return p ? `SO ${p.questionId}` : "Stack Overflow";
    }
    case "devto": {
      const p = parseDevtoUrl(opts.url);
      return p ? `@${p.username}` : "Dev.to";
    }
    case "x": {
      const p = parseXUrl(opts.url);
      return p ? `@${p.handle}` : "X / Twitter";
    }
    default:
      return opts.platform;
  }
}
