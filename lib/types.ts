export type Platform = "reddit" | "hackernews" | "github" | "devto" | "stackoverflow" | "x";

export type BroadcastPlatform = "x" | "linkedin";

export type AgentId =
  | "discovery_reddit"
  | "discovery_hackernews"
  | "discovery_github"
  | "discovery_devto"
  | "discovery_stackoverflow"
  | "discovery_x"
  | "aggregator"
  | "strategy"
  | "content_replies"
  | "content_x"
  | "content_linkedin"
  | "image"
  | "video";

export type AgentStatus = "idle" | "running" | "done" | "skipped" | "failed";

/**
 * A specific comment within a source thread that we're targeting for reply.
 * If present on a DiscoveredThread, reply drafts will address this commenter
 * directly and the "Open thread" action opens the comment permalink (which
 * scrolls to that comment on Reddit/HN).
 */
export interface TargetComment {
  author: string;
  text: string;        // first ~400 chars of the comment
  score: number;
  permalink: string;   // direct deep-link to the comment, not the thread root
}

export interface DiscoveredThread {
  thread_url: string;
  platform: Platform;
  title: string;
  body_snippet?: string;
  subreddit?: string;
  repo?: string;
  engagement: number;
  created_at: string;
  verbatim_phrases: string[];
  target_comment?: TargetComment;
}

export interface DemandMap {
  total_threads_found: number;
  platforms_with_demand: Array<{
    platform: Platform;
    demand_density_score: number;
    top_thread_url: string;
  }>;
  common_phrases: string[];
  peak_recency: string;
  top_threads: DiscoveredThread[];
}

export interface Strategy {
  channel_ranking: Array<{ platform: string; rationale: string }>;
  tone_per_platform: Record<string, string>;
  timing_recommendation: string[];
  engagement_strategy_per_channel: Array<{
    platform: string;
    action: "reply" | "submission";
    target_url?: string;
    rationale: string;
  }>;
}

export interface ReplyDraft {
  id: string;
  kind: "reply";
  source_platform: Platform;
  source_thread_url: string;
  source_thread_title: string;
  source_subreddit?: string;
  source_repo?: string;
  source_engagement?: number;
  source_created_at?: string;
  // Comment-level targeting — when set, the reply addresses this commenter
  // directly and the primary action opens this permalink instead of the
  // thread root.
  source_comment_permalink?: string;
  source_comment_author?: string;
  source_comment_text?: string;
  source_comment_score?: number;
  reply_body: string;
}

export interface BroadcastDraft {
  id: string;
  kind: "broadcast";
  platform: BroadcastPlatform;
  body: string;
  references_thread_url: string;
  references_thread_title?: string;
}

export type ContentDraft = ReplyDraft | BroadcastDraft;

export type ImageState =
  | { state: "idle" }
  | { state: "running"; startedAt: number }
  | { state: "done"; dataUrl: string }
  | { state: "failed"; error: string };

// Same state machine as ImageState — video card mirrors image card behavior.
export type VideoState =
  | { state: "idle" }
  | { state: "running"; startedAt: number }
  | { state: "done"; dataUrl: string }
  | { state: "failed"; error: string };

export interface AgentCounter {
  current: number;
  total: number;
}

export type SSEEvent =
  | { type: "started"; productDescription: string }
  | {
      type: "agent_status";
      agent: AgentId;
      status: AgentStatus;
      note?: string;
      counter?: AgentCounter;
    }
  | { type: "discovery"; platform: Platform; threads: DiscoveredThread[] }
  | { type: "discovery_failed"; platform: Platform; reason: string }
  | { type: "demand_map"; demandMap: DemandMap }
  | { type: "strategy"; strategy: Strategy }
  | { type: "reply_planned"; total: number }
  | { type: "content"; draft: ContentDraft }
  | { type: "image"; dataUrl: string }
  | { type: "image_failed"; reason: string }
  | { type: "video"; dataUrl: string }
  | { type: "video_failed"; reason: string }
  | { type: "done" }
  | { type: "error"; message: string };

// =====================================================================
// Theme B output types (Sprint 3+)
// =====================================================================

export interface RoadmapFeature {
  title: string;
  priority: "must-have" | "nice-to-have";
  evidence: Array<{ quote: string; source_url: string; platform: string }>;
  existing_competitors_offering_it?: string;
}

export interface RoadmapDoc {
  summary?: string;
  features: RoadmapFeature[];
}

export interface LandingFeatureBlock {
  headline: string;
  body: string;
  evidence_quote: string;
}

export interface LandingCopyDoc {
  hero_headline: string;
  hero_subheadline: string;
  feature_blocks: LandingFeatureBlock[];
  social_proof_quotes: string[];
}

export interface CompetitorMention {
  competitor_name: string;
  mention_count: number;
  sample_quote: string;
  sample_thread_url: string;
  sample_platform: Platform;
}

export interface SeoBriefDoc {
  target_keyword: string;
  secondary_keywords: string[];
  title_options: string[];
  target_audience: string;
  outline: Array<{ heading: string; bullets: string[] }>;
  evidence_pull_quotes: Array<{ quote: string; source_url: string }>;
  internal_link_anchor_texts: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// =====================================================================
// Persistence types (consumed by lib/storage.ts)
// =====================================================================

export interface SavedRun {
  id: string;
  createdAt: number;
  productDescription: string;
  productUrl?: string;
  demandMap: DemandMap | null;
  strategy: Strategy | null;
  drafts: ContentDraft[];
  imageDataUrl: string | null;
  videoDataUrl?: string | null;
  postedDraftIds?: string[];
  postedDraftUrls?: Record<string, string>;
  // Cached Theme B outputs (lazily generated)
  roadmap?: RoadmapDoc;
  landingCopy?: LandingCopyDoc;
  competitorMatrix?: CompetitorMention[];
  seoBrief?: SeoBriefDoc;
}

export interface VoiceProfile {
  samplePosts: string[];
  updatedAt: number;
}
