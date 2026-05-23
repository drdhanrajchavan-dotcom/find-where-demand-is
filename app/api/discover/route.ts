import {
  discoveryAgentCall,
  generateContent,
  generateImage,
  generateVideo,
  extractJson,
} from "../../../lib/gemini";
import { DIRECT_FETCHERS } from "../../../lib/discovery-direct";
import { validateThreadUrls } from "../../../lib/url-validator";
import {
  DISCOVERY_PROMPTS_BY_PLATFORM,
  AGGREGATOR,
  RELEVANCE_FILTER,
  STRATEGY,
  REPLY_BY_PLATFORM,
  BROADCAST_X,
  BROADCAST_LINKEDIN,
  IMAGE_PROMPT,
  VIDEO_PROMPT,
  X_TIGHTEN,
} from "../../../lib/prompts";
import { SSEStream, sseHeaders } from "../../../lib/stream";
import type {
  AgentId,
  BroadcastDraft,
  DemandMap,
  DiscoveredThread,
  Platform,
  ReplyDraft,
  Strategy,
} from "../../../lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DISCOVERY_PLATFORMS: Array<{ platform: Platform; agent: AgentId }> = [
  { platform: "reddit", agent: "discovery_reddit" },
  { platform: "hackernews", agent: "discovery_hackernews" },
  { platform: "github", agent: "discovery_github" },
  { platform: "devto", agent: "discovery_devto" },
  { platform: "stackoverflow", agent: "discovery_stackoverflow" },
];

const REPLY_TARGET_COUNT = 6;
const PRODUCT_URL = "https://your-product.example.com";

export async function POST(request: Request): Promise<Response> {
  let productDescription = "";
  let voiceSamples: string[] = [];
  try {
    const body = await request.json();
    productDescription = (body?.productDescription ?? "").toString().trim();
    if (Array.isArray(body?.voiceSamples)) {
      voiceSamples = (body.voiceSamples as unknown[])
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter((s) => s.length > 0);
    }
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  if (!productDescription) {
    return new Response("productDescription is required", { status: 400 });
  }

  const sse = new SSEStream();
  void runOrchestrator(productDescription, voiceSamples, sse).catch((err) => {
    sse.emit({ type: "error", message: err?.message ?? String(err) });
    sse.close();
  });
  return new Response(sse.readable, { headers: sseHeaders() });
}

function renderVoiceSamples(samples: string[]): string {
  if (samples.length === 0) return "none";
  return samples
    .map((s, i) => `Example ${i + 1}:\n"""\n${s}\n"""`)
    .join("\n\n");
}

async function runOrchestrator(
  productDescription: string,
  voiceSamples: string[],
  sse: SSEStream
): Promise<void> {
  const voiceBlock = renderVoiceSamples(voiceSamples);
  sse.emit({ type: "started", productDescription });

  // ---- Phase 1: parallel discovery (Path A with Path B fallback) -----------
  const rawResults = await runDiscovery(productDescription, sse);

  // ---- Phase 1.5: URL validation + relevance filter pre-aggregation --------
  // Validate every URL in parallel (HEAD checks), drop dead/malformed ones.
  // This is fast (< 4s) and stops bad URLs from ever reaching the user.
  const discoveryResults = await prefilterByUrl(rawResults);

  const allThreads = Object.values(discoveryResults).flat();
  if (allThreads.length === 0) {
    sse.emit({
      type: "error",
      message: "No discovery results — all 5 agents failed or returned empty.",
    });
    sse.close();
    return;
  }

  // ---- Phase 2: aggregator -------------------------------------------------
  const aggregated = await runAggregator(productDescription, discoveryResults, allThreads, sse);

  // ---- Phase 2.5: dedicated relevance filter pass --------------------------
  const demandMap = await runRelevanceFilter(productDescription, aggregated, sse);

  // ---- Phase 3: strategy ---------------------------------------------------
  const strategy = await runStrategy(productDescription, demandMap, sse);

  // ---- Phase 4: per-thread replies + broadcasts + image (parallel) ---------
  const replyTargets = pickReplyTargets(demandMap, REPLY_TARGET_COUNT);
  sse.emit({ type: "reply_planned", total: replyTargets.length });

  const imagePromise = runImage(productDescription, sse);
  const videoPromise = runVideo(productDescription, sse);

  await Promise.all([
    runReplyDrafts(replyTargets, productDescription, voiceBlock, sse),
    runBroadcast("x", BROADCAST_X, productDescription, demandMap, voiceBlock, sse),
    runBroadcast("linkedin", BROADCAST_LINKEDIN, productDescription, demandMap, voiceBlock, sse),
  ]);

  sse.emit({ type: "done" });

  // Image is usually quick (~10s). Video can run 15-60s. Bound the total
  // post-content tail at 120s to be safe.
  await Promise.race([
    Promise.all([imagePromise, videoPromise]),
    new Promise((resolve) => setTimeout(resolve, 120_000)),
  ]);
  sse.close();
}

// =====================================================================
// Phase 1 — discovery
// =====================================================================

async function runDiscovery(
  productDescription: string,
  sse: SSEStream
): Promise<Record<Platform, DiscoveredThread[]>> {
  const DISCOVERY_TIMEOUT_MS = 90_000;
  const results: Record<Platform, DiscoveredThread[]> = {
    reddit: [],
    hackernews: [],
    github: [],
    devto: [],
    stackoverflow: [],
  };

  DISCOVERY_PLATFORMS.forEach(({ agent }) => {
    sse.emit({ type: "agent_status", agent, status: "running" });
  });

  await Promise.all(
    DISCOVERY_PLATFORMS.map(async ({ platform, agent }) => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), DISCOVERY_TIMEOUT_MS);
      let pathANote: string | undefined;

      // Path A — sandbox
      try {
        const result = await discoveryAgentCall({
          agentPrompt: DISCOVERY_PROMPTS_BY_PLATFORM[platform],
          productDescription,
          signal: ac.signal,
        });
        clearTimeout(timer);
        const parsed = extractJson<{ threads?: unknown[]; note?: string }>(result.text);
        const threads = Array.isArray(parsed.threads)
          ? (parsed.threads as DiscoveredThread[]).map((t) => ({ ...t, platform }))
          : [];
        if (threads.length > 0) {
          results[platform] = threads;
          sse.emit({ type: "discovery", platform, threads });
          sse.emit({ type: "agent_status", agent, status: "done", note: parsed.note });
          return;
        }
        pathANote = parsed.note ?? "sandbox returned empty";
      } catch (err) {
        clearTimeout(timer);
        const aborted = ac.signal.aborted;
        pathANote = aborted
          ? `sandbox timed out after ${DISCOVERY_TIMEOUT_MS / 1000}s`
          : err instanceof Error
          ? err.message.slice(0, 120)
          : String(err).slice(0, 120);
      }

      // Path B — direct API fallback
      try {
        const threads = await DIRECT_FETCHERS[platform](productDescription);
        if (threads.length > 0) {
          results[platform] = threads;
          sse.emit({ type: "discovery", platform, threads });
          sse.emit({
            type: "agent_status",
            agent,
            status: "done",
            note: `direct API (fallback: ${pathANote})`,
          });
          return;
        }
        sse.emit({
          type: "agent_status",
          agent,
          status: "skipped",
          note: `no results (Path A: ${pathANote})`,
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        sse.emit({ type: "discovery_failed", platform, reason });
        sse.emit({
          type: "agent_status",
          agent,
          status: "failed",
          note: reason.slice(0, 120),
        });
      }
    })
  );

  return results;
}

// =====================================================================
// Phase 2 — aggregator
// =====================================================================

async function prefilterByUrl(
  rawResults: Record<Platform, DiscoveredThread[]>
): Promise<Record<Platform, DiscoveredThread[]>> {
  const platforms = Object.keys(rawResults) as Platform[];
  const liveByPlatform = await Promise.all(
    platforms.map(async (platform) => {
      const { live } = await validateThreadUrls(rawResults[platform]);
      return [platform, live] as const;
    })
  );
  return Object.fromEntries(liveByPlatform) as Record<Platform, DiscoveredThread[]>;
}

async function runRelevanceFilter(
  productDescription: string,
  demandMap: DemandMap,
  sse: SSEStream
): Promise<DemandMap> {
  const threads = demandMap.top_threads ?? [];
  if (threads.length === 0) return demandMap;

  try {
    const compact = threads.map((t, i) => ({
      index: i,
      platform: t.platform,
      title: t.title,
      snippet: (t.body_snippet ?? "").slice(0, 200),
    }));
    const prompt = RELEVANCE_FILTER.replace(
      "{productDescription}",
      productDescription
    ).replace("{threadsJson}", JSON.stringify(compact));
    const res = await generateContent({
      prompt,
      json: true,
      thinkingLevel: "high",
    });
    const parsed = extractJson<{
      verdicts?: Array<{ index: number; verdict: "ON_TOPIC" | "OFF_TOPIC"; reason?: string }>;
    }>(res.text);
    if (!Array.isArray(parsed.verdicts) || parsed.verdicts.length === 0) {
      return demandMap;
    }
    const onTopicIndices = new Set(
      parsed.verdicts
        .filter((v) => v.verdict === "ON_TOPIC")
        .map((v) => v.index)
    );
    const filtered = threads.filter((_t, i) => onTopicIndices.has(i));

    // Don't strip the demand map down to too few. If the filter was over-
    // aggressive (< 6 survivors out of a substantive input), keep the top
    // engagement-ranked threads as a floor so the orchestrator has enough
    // reply targets and the UI doesn't look empty.
    const minKeep = Math.min(6, threads.length);
    const finalThreads =
      filtered.length >= minKeep
        ? filtered
        : threads.slice(0, Math.max(minKeep, filtered.length));

    const filteredMap: DemandMap = {
      ...demandMap,
      top_threads: finalThreads,
      total_threads_found: finalThreads.length,
    };

    // Re-emit so the UI replaces the demand map with the filtered set.
    sse.emit({ type: "demand_map", demandMap: filteredMap });

    return filteredMap;
  } catch {
    // If filter fails, fall through with the unfiltered demand map.
    return demandMap;
  }
}

async function runAggregator(
  productDescription: string,
  discoveryResults: Record<Platform, DiscoveredThread[]>,
  allThreads: DiscoveredThread[],
  sse: SSEStream
): Promise<DemandMap> {
  sse.emit({ type: "agent_status", agent: "aggregator", status: "running" });
  try {
    const aggPrompt = AGGREGATOR.replace(
      "{productDescription}",
      productDescription
    ).replace("{discoveryResults}", JSON.stringify(discoveryResults));
    const aggRes = await generateContent({
      prompt: aggPrompt,
      json: true,
      thinkingLevel: "high",
    });
    const demandMap = extractJson<DemandMap>(aggRes.text);
    if (!demandMap.top_threads || demandMap.top_threads.length === 0) {
      demandMap.top_threads = allThreads.slice(0, 20);
    }
    sse.emit({ type: "demand_map", demandMap });
    sse.emit({ type: "agent_status", agent: "aggregator", status: "done" });
    return demandMap;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const fallback: DemandMap = {
      total_threads_found: allThreads.length,
      platforms_with_demand: Object.entries(discoveryResults)
        .filter(([, t]) => t.length > 0)
        .map(([p, t]) => ({
          platform: p as Platform,
          demand_density_score: t.length / 10,
          top_thread_url: t[0]?.thread_url ?? "",
        })),
      common_phrases: allThreads.flatMap((t) => t.verbatim_phrases ?? []).slice(0, 10),
      peak_recency: new Date().toISOString().slice(0, 10),
      top_threads: allThreads.slice(0, 20),
    };
    sse.emit({ type: "demand_map", demandMap: fallback });
    sse.emit({
      type: "agent_status",
      agent: "aggregator",
      status: "failed",
      note: reason.slice(0, 120),
    });
    return fallback;
  }
}

// =====================================================================
// Phase 3 — strategy
// =====================================================================

async function runStrategy(
  productDescription: string,
  demandMap: DemandMap,
  sse: SSEStream
): Promise<Strategy> {
  sse.emit({ type: "agent_status", agent: "strategy", status: "running" });
  try {
    const stratPrompt = STRATEGY.replace("{productDescription}", productDescription).replace(
      "{demandMap}",
      JSON.stringify(demandMap)
    );
    const stratRes = await generateContent({
      prompt: stratPrompt,
      json: true,
      thinkingLevel: "high",
    });
    const strategy = extractJson<Strategy>(stratRes.text);
    sse.emit({ type: "strategy", strategy });
    sse.emit({ type: "agent_status", agent: "strategy", status: "done" });
    return strategy;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const fallback: Strategy = {
      channel_ranking: demandMap.platforms_with_demand.map((p) => ({
        platform: p.platform,
        rationale: `Fallback ranking by demand density (${p.demand_density_score.toFixed(2)})`,
      })),
      tone_per_platform: {
        reddit: "no marketing language, lead with technical detail",
        hackernews: "concise, technical, link to source",
        x: "specific and direct, no hashtags",
        linkedin: "founder voice, problem-first",
      },
      timing_recommendation: ["reddit", "hackernews", "x"],
      engagement_strategy_per_channel: [],
    };
    sse.emit({ type: "strategy", strategy: fallback });
    sse.emit({
      type: "agent_status",
      agent: "strategy",
      status: "failed",
      note: reason.slice(0, 120),
    });
    return fallback;
  }
}

// =====================================================================
// Phase 4 — pick reply targets + drafts + broadcasts + image
// =====================================================================

/**
 * Pick up to `count` source threads to reply to. Diversify across platforms
 * so we don't draft 6 Reddit replies and ignore HN/GitHub. Prefers threads
 * that engagement-ranked highly in the demand map.
 */
function pickReplyTargets(demandMap: DemandMap, count: number): DiscoveredThread[] {
  const seen = new Set<string>();
  const out: DiscoveredThread[] = [];
  const perPlatformCap = Math.ceil(count / 2); // at most ~half from any one platform
  const perPlatformCount: Record<Platform, number> = {
    reddit: 0,
    hackernews: 0,
    github: 0,
    devto: 0,
    stackoverflow: 0,
  };
  for (const thread of demandMap.top_threads ?? []) {
    if (out.length >= count) break;
    if (!thread.thread_url || seen.has(thread.thread_url)) continue;
    if (perPlatformCount[thread.platform] >= perPlatformCap) continue;
    seen.add(thread.thread_url);
    perPlatformCount[thread.platform]++;
    out.push(thread);
  }
  // If we couldn't fill via per-platform cap, fill the rest unconstrained.
  if (out.length < count) {
    for (const thread of demandMap.top_threads ?? []) {
      if (out.length >= count) break;
      if (!thread.thread_url || seen.has(thread.thread_url)) continue;
      seen.add(thread.thread_url);
      out.push(thread);
    }
  }
  return out;
}

async function runReplyDrafts(
  targets: DiscoveredThread[],
  productDescription: string,
  voiceBlock: string,
  sse: SSEStream
): Promise<void> {
  const total = targets.length;
  if (total === 0) {
    sse.emit({
      type: "agent_status",
      agent: "content_replies",
      status: "skipped",
      note: "no reply targets",
    });
    return;
  }

  let completed = 0;
  sse.emit({
    type: "agent_status",
    agent: "content_replies",
    status: "running",
    counter: { current: 0, total },
  });

  await Promise.all(
    targets.map(async (thread) => {
      try {
        const promptTemplate = REPLY_BY_PLATFORM[thread.platform];
        const sourceThreadJson = JSON.stringify({
          platform: thread.platform,
          title: thread.title,
          body_snippet: thread.body_snippet ?? "",
          subreddit: thread.subreddit,
          repo: thread.repo,
          engagement: thread.engagement,
          created_at: thread.created_at,
          url: thread.thread_url,
          verbatim_phrases: thread.verbatim_phrases ?? [],
        });
        const targetCommentJson = thread.target_comment
          ? JSON.stringify({
              author: thread.target_comment.author,
              text: thread.target_comment.text,
              score: thread.target_comment.score,
              permalink: thread.target_comment.permalink,
            })
          : "none";
        const filled = promptTemplate
          .replace("{sourceThread}", sourceThreadJson)
          .replace("{targetComment}", targetCommentJson)
          .replace("{productDescription}", productDescription)
          .replace("{productUrl}", PRODUCT_URL)
          .replace("{voiceSamples}", voiceBlock);
        const res = await generateContent({
          prompt: filled,
          json: true,
          thinkingLevel: "high",
        });
        const parsed = extractJson<{ reply_body: string; reply_title?: string | null }>(
          res.text
        );
        if (!parsed.reply_body || typeof parsed.reply_body !== "string") {
          throw new Error("reply_body missing or empty");
        }
        const draft: ReplyDraft = {
          id: crypto.randomUUID(),
          kind: "reply",
          source_platform: thread.platform,
          source_thread_url: thread.thread_url,
          source_thread_title: thread.title,
          source_subreddit: thread.subreddit,
          source_repo: thread.repo,
          source_engagement: thread.engagement,
          source_created_at: thread.created_at,
          source_comment_permalink: thread.target_comment?.permalink,
          source_comment_author: thread.target_comment?.author,
          source_comment_text: thread.target_comment?.text,
          source_comment_score: thread.target_comment?.score,
          reply_body: parsed.reply_body.trim(),
        };
        sse.emit({ type: "content", draft });
      } catch (err) {
        // Don't break the whole batch on a single failure; just log via note.
        const reason = err instanceof Error ? err.message : String(err);
        sse.emit({
          type: "agent_status",
          agent: "content_replies",
          status: "running",
          counter: { current: completed, total },
          note: `skipped one (${reason.slice(0, 60)})`,
        });
      } finally {
        completed++;
        sse.emit({
          type: "agent_status",
          agent: "content_replies",
          status: completed < total ? "running" : "done",
          counter: { current: completed, total },
        });
      }
    })
  );
}

async function runBroadcast(
  platform: "x" | "linkedin",
  promptTemplate: string,
  productDescription: string,
  demandMap: DemandMap,
  voiceBlock: string,
  sse: SSEStream
): Promise<void> {
  const agentId: AgentId = platform === "x" ? "content_x" : "content_linkedin";
  sse.emit({ type: "agent_status", agent: agentId, status: "running" });

  const topThread = demandMap.top_threads?.[0];
  const topThreadUrl = topThread?.thread_url ?? PRODUCT_URL;
  const topThreadTitle = topThread?.title ?? productDescription;
  const userPhrases = (demandMap.common_phrases ?? []).slice(0, 6).join(" | ");

  try {
    const filled = promptTemplate
      .replace("{productDescription}", productDescription)
      .replace("{productUrl}", PRODUCT_URL)
      .replace("{topThreadUrl}", topThreadUrl)
      .replace("{topThreadTitle}", topThreadTitle)
      .replace("{userPhrases}", userPhrases)
      .replace("{voiceSamples}", voiceBlock);
    const res = await generateContent({
      prompt: filled,
      json: true,
      thinkingLevel: "high",
    });
    const parsed = extractJson<{ body: string; references_thread_url: string }>(res.text);
    if (!parsed.body || typeof parsed.body !== "string") {
      throw new Error("body missing or empty");
    }
    let body = parsed.body.trim();

    // X char auto-trim: model sometimes overshoots 280. Re-ask once.
    if (platform === "x" && body.length > 280) {
      try {
        const tightenRes = await generateContent({
          prompt: X_TIGHTEN.replace("{body}", body),
          json: true,
          thinkingLevel: "low",
        });
        const tightened = extractJson<{ body: string }>(tightenRes.text);
        if (typeof tightened.body === "string" && tightened.body.trim().length > 0) {
          body = tightened.body.trim();
        }
      } catch {
        // keep original — UI's red over-budget badge will flag it
      }
    }

    const draft: BroadcastDraft = {
      id: crypto.randomUUID(),
      kind: "broadcast",
      platform,
      body,
      references_thread_url:
        typeof parsed.references_thread_url === "string" && parsed.references_thread_url.length > 0
          ? parsed.references_thread_url
          : topThreadUrl,
      references_thread_title: topThreadTitle,
    };
    sse.emit({ type: "content", draft });
    sse.emit({ type: "agent_status", agent: agentId, status: "done" });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    sse.emit({
      type: "agent_status",
      agent: agentId,
      status: "failed",
      note: reason.slice(0, 120),
    });
  }
}

async function runImage(productDescription: string, sse: SSEStream): Promise<void> {
  sse.emit({ type: "agent_status", agent: "image", status: "running" });
  try {
    const imagePrompt = IMAGE_PROMPT.replace("{productDescription}", productDescription);
    const dataUrl = await generateImage(imagePrompt);
    sse.emit({ type: "image", dataUrl });
    sse.emit({ type: "agent_status", agent: "image", status: "done" });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    sse.emit({ type: "image_failed", reason });
    sse.emit({
      type: "agent_status",
      agent: "image",
      status: "failed",
      note: reason.slice(0, 120),
    });
  }
}

async function runVideo(productDescription: string, sse: SSEStream): Promise<void> {
  sse.emit({ type: "agent_status", agent: "video", status: "running" });
  try {
    const videoPrompt = VIDEO_PROMPT.replace("{productDescription}", productDescription);
    const dataUrl = await generateVideo(videoPrompt);
    sse.emit({ type: "video", dataUrl });
    sse.emit({ type: "agent_status", agent: "video", status: "done" });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    sse.emit({ type: "video_failed", reason });
    sse.emit({
      type: "agent_status",
      agent: "video",
      status: "failed",
      note: reason.slice(0, 120),
    });
  }
}
