// Pure client-side competitor extraction. Scans demand-map threads for
// product-like proper nouns and brand names. No LLM call — fast, deterministic.

import type { CompetitorMention, DemandMap, DiscoveredThread } from "./types";

// Words that LOOK like product names by capitalization but aren't.
const STOPWORDS = new Set([
  "I", "I'm", "I've", "I'll", "I'd", "You", "We", "They", "He", "She", "It",
  "This", "That", "These", "Those", "What", "When", "Where", "Why", "How",
  "But", "And", "Or", "So", "Also", "Just", "Like", "Some", "Any", "Many",
  "Most", "All", "Every", "Each", "Few", "Several", "Other", "Another",
  "Show", "Ask", "TIL", "ELI5", "AMA", "TL;DR", "TLDR", "PSA", "EDIT",
  "HN", "API", "CLI", "GUI", "SDK", "JSON", "YAML", "TOML", "HTML", "CSS",
  "JS", "TS", "AI", "ML", "LLM", "GPT", "URL", "URI", "HTTP", "HTTPS", "SSH",
  "VPN", "SaaS", "PaaS", "IaaS", "MVP", "POC", "QA", "UX", "UI", "PM", "CEO",
  "CTO", "CFO", "VP", "SF", "NYC", "USA", "UK", "EU", "EST", "PST", "UTC",
  "PR", "PRs", "MR", "MRs", "CI", "CD", "DB", "OS", "VM", "VMs", "DM", "DMs",
  "OP", "ELI", "TBH", "IMO", "IMHO", "AFAIK", "IIRC", "IDK", "PSA",
  "Reddit", "Hacker", "News", "GitHub", "Stack", "Overflow", "Dev",
  "Google", "Microsoft", "Apple", "Meta", "Amazon", "AWS", "GCP", "Azure",
]);

// Tokens that look like product names: TitleCase, optional digits, length 3-30.
const TOKEN_RE = /\b[A-Z][a-zA-Z][a-zA-Z0-9]{1,28}\b/g;

// Domain-style names too: foo.com, bar.io, baz.dev
const DOMAIN_RE = /\b([a-zA-Z][a-zA-Z0-9-]{1,40})\.(?:com|io|dev|app|ai|so|co|net|org|sh)\b/gi;

interface Bucket {
  count: number;
  quotes: Array<{ text: string; thread: DiscoveredThread }>;
}

export function extractCompetitors(demandMap: DemandMap | null): CompetitorMention[] {
  if (!demandMap) return [];
  const buckets = new Map<string, Bucket>();

  for (const thread of demandMap.top_threads ?? []) {
    const fullText = `${thread.title ?? ""}\n${thread.body_snippet ?? ""}\n${(
      thread.verbatim_phrases ?? []
    ).join(" ")}`;
    const found = new Set<string>();

    // Pass 1 — proper-noun tokens
    for (const match of fullText.matchAll(TOKEN_RE)) {
      const tok = match[0];
      if (STOPWORDS.has(tok)) continue;
      if (tok.length < 3) continue;
      found.add(tok);
    }

    // Pass 2 — domain-style names (use the prefix as the canonical name)
    for (const match of fullText.matchAll(DOMAIN_RE)) {
      const prefix = match[1];
      if (prefix.length < 2) continue;
      const canonical = titleCase(prefix);
      if (STOPWORDS.has(canonical)) continue;
      found.add(canonical);
    }

    for (const name of found) {
      let bucket = buckets.get(name);
      if (!bucket) {
        bucket = { count: 0, quotes: [] };
        buckets.set(name, bucket);
      }
      bucket.count++;
      if (bucket.quotes.length < 3) {
        const sentence = pickSentenceContaining(fullText, name) ?? thread.title ?? "";
        if (sentence) bucket.quotes.push({ text: sentence, thread });
      }
    }
  }

  // Convert to sorted CompetitorMention[]. Require >= 2 mentions to count;
  // single mentions are noise.
  const out: CompetitorMention[] = [];
  for (const [name, bucket] of buckets) {
    if (bucket.count < 2) continue;
    const sample = bucket.quotes[0];
    out.push({
      competitor_name: name,
      mention_count: bucket.count,
      sample_quote: (sample?.text ?? "").slice(0, 240),
      sample_thread_url: sample?.thread?.thread_url ?? "",
      sample_platform: sample?.thread?.platform ?? "reddit",
    });
  }
  return out.sort((a, b) => b.mention_count - a.mention_count).slice(0, 12);
}

function pickSentenceContaining(text: string, term: string): string | null {
  const sentences = text.replace(/\s+/g, " ").split(/[.?!]\s+/);
  for (const s of sentences) {
    if (s.includes(term) && s.length >= 20 && s.length <= 300) return s.trim();
  }
  return null;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
