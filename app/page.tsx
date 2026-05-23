"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AgentRail, type AgentStatusEntry } from "../components/AgentRail";
import { ProgressStrip, type Phase } from "../components/ProgressStrip";
import { DemandMap } from "../components/DemandMap";
import { StrategyView } from "../components/StrategyView";
import { Launchpad } from "../components/Launchpad";
import { RunHistory } from "../components/RunHistory";
import { VoiceProfile } from "../components/VoiceProfile";
import { RoadmapView } from "../components/RoadmapView";
import { LandingCopyView } from "../components/LandingCopyView";
import { CompetitorMatrix } from "../components/CompetitorMatrix";
import { SeoBriefView } from "../components/SeoBriefView";
import { DemandChat } from "../components/DemandChat";
import { extractCompetitors } from "../lib/competitors";
import { getStorage } from "../lib/storage";
import type {
  AgentId,
  CompetitorMention,
  ContentDraft,
  DemandMap as DemandMapT,
  DiscoveredThread,
  ImageState,
  LandingCopyDoc,
  Platform,
  RoadmapDoc,
  SavedRun,
  SeoBriefDoc,
  SSEEvent,
  Strategy,
  VideoState,
  VoiceProfile as VoiceProfileT,
} from "../lib/types";

type Tab =
  | "demand"
  | "strategy"
  | "launchpad"
  | "roadmap"
  | "landing"
  | "competitors"
  | "seo"
  | "chat";

const SAMPLE_PROMPTS = [
  "An open-source tool that converts Figma designs to production React code",
  "A CLI that auto-generates database migrations from Pydantic models",
  "A self-hosted alternative to Calendly with custom availability rules",
];

const ALL_AGENT_IDS: AgentId[] = [
  "discovery_reddit",
  "discovery_hackernews",
  "discovery_github",
  "discovery_devto",
  "discovery_stackoverflow",
  "discovery_x",
  "aggregator",
  "strategy",
  "content_replies",
  "content_x",
  "content_linkedin",
  "image",
  "video",
];

export default function Home() {
  const [productDescription, setProductDescription] = useState("");
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [tab, setTab] = useState<Tab>("demand");
  const [statuses, setStatuses] = useState<Partial<Record<AgentId, AgentStatusEntry>>>({});
  const [threads, setThreads] = useState<DiscoveredThread[]>([]);
  const [counts, setCounts] = useState<Partial<Record<Platform, number>>>({});
  const [demandMap, setDemandMap] = useState<DemandMapT | null>(null);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [drafts, setDrafts] = useState<ContentDraft[]>([]);
  const [draftTotal, setDraftTotal] = useState<number>(0);
  const [imageState, setImageState] = useState<ImageState>({ state: "idle" });
  const [videoState, setVideoState] = useState<VideoState>({ state: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfileT | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [postedDraftIds, setPostedDraftIds] = useState<string[]>([]);
  const [postedDraftUrls, setPostedDraftUrls] = useState<Record<string, string>>({});
  // Theme B (Sprint 3) outputs — generated on demand from the demand map.
  const [roadmap, setRoadmap] = useState<RoadmapDoc | null>(null);
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  const [roadmapError, setRoadmapError] = useState<string | null>(null);
  const [landingCopy, setLandingCopy] = useState<LandingCopyDoc | null>(null);
  const [landingLoading, setLandingLoading] = useState(false);
  const [landingError, setLandingError] = useState<string | null>(null);
  const [seoBrief, setSeoBrief] = useState<SeoBriefDoc | null>(null);
  const [seoLoading, setSeoLoading] = useState(false);
  const [seoError, setSeoError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasAutoSwitchedRef = useRef(false);
  // Snapshot the in-flight run so handleEvent('done') can persist it without
  // depending on the latest state of every individual field.
  const inFlightRef = useRef<{
    id: string;
    productDescription: string;
    drafts: ContentDraft[];
    demandMap: DemandMapT | null;
    strategy: Strategy | null;
    imageDataUrl: string | null;
    videoDataUrl: string | null;
  } | null>(null);

  // Load saved runs + voice profile on mount.
  useEffect(() => {
    const storage = getStorage();
    storage.loadRuns().then(setRuns).catch(() => {});
    storage
      .loadVoiceProfile()
      .then((p) => {
        // Treat empty arrays as "no profile" for UI badge purposes.
        if (p && p.samplePosts && p.samplePosts.length > 0) setVoiceProfile(p);
      })
      .catch(() => {});
  }, []);

  const refreshRuns = useCallback(() => {
    getStorage().loadRuns().then(setRuns).catch(() => {});
  }, []);

  function reset() {
    setStatuses({});
    setThreads([]);
    setCounts({});
    setDemandMap(null);
    setStrategy(null);
    setDrafts([]);
    setDraftTotal(0);
    setImageState({ state: "idle" });
    setVideoState({ state: "idle" });
    setError(null);
    setPhase("idle");
    setActiveRunId(null);
    setPostedDraftIds([]);
    setPostedDraftUrls({});
    setRoadmap(null);
    setRoadmapError(null);
    setLandingCopy(null);
    setLandingError(null);
    setSeoBrief(null);
    setSeoError(null);
    hasAutoSwitchedRef.current = false;
    inFlightRef.current = null;
  }

  async function run() {
    if (running || !productDescription.trim()) return;
    reset();
    setRunning(true);
    setPhase("discovering");
    setTab("demand");

    const runId = crypto.randomUUID();
    inFlightRef.current = {
      id: runId,
      productDescription,
      drafts: [],
      demandMap: null,
      strategy: null,
      imageDataUrl: null,
      videoDataUrl: null,
    };
    setActiveRunId(runId);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productDescription,
          voiceSamples: voiceProfile?.samplePosts ?? [],
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          try {
            const evt = JSON.parse(json) as SSEEvent;
            handleEvent(evt);
          } catch {
            // ignore malformed event
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setRunning(false);
    }
  }

  function updateStatus(id: AgentId, mutator: (prev?: AgentStatusEntry) => AgentStatusEntry) {
    setStatuses((prev) => ({ ...prev, [id]: mutator(prev[id]) }));
  }

  function handleEvent(evt: SSEEvent) {
    switch (evt.type) {
      case "agent_status": {
        const now = Date.now();
        updateStatus(evt.agent, (prev) => {
          const startedAt =
            evt.status === "running" ? prev?.startedAt ?? now : prev?.startedAt;
          const endedAt =
            evt.status === "done" ||
            evt.status === "failed" ||
            evt.status === "skipped"
              ? now
              : prev?.endedAt;
          return {
            status: evt.status,
            note: evt.note,
            counter: evt.counter ?? prev?.counter,
            startedAt,
            endedAt,
          };
        });
        if (evt.agent === "image") {
          if (evt.status === "running") {
            setImageState({ state: "running", startedAt: Date.now() });
          } else if (evt.status === "failed") {
            setImageState({ state: "failed", error: evt.note ?? "Image generation failed" });
          }
        }
        if (evt.agent === "video") {
          if (evt.status === "running") {
            setVideoState({ state: "running", startedAt: Date.now() });
          } else if (evt.status === "failed") {
            setVideoState({ state: "failed", error: evt.note ?? "Video generation failed" });
          }
        }
        if (evt.agent === "aggregator" && evt.status === "running") setPhase("synthesizing");
        if (
          (evt.agent === "content_replies" ||
            evt.agent === "content_x" ||
            evt.agent === "content_linkedin") &&
          evt.status === "running"
        ) {
          setPhase("drafting");
        }
        break;
      }
      case "discovery":
        setThreads((prev) => [...prev, ...evt.threads]);
        setCounts((prev) => ({ ...prev, [evt.platform]: evt.threads.length }));
        break;
      case "discovery_failed":
        setCounts((prev) => ({ ...prev, [evt.platform]: 0 }));
        break;
      case "demand_map":
        setDemandMap(evt.demandMap);
        if (inFlightRef.current) inFlightRef.current.demandMap = evt.demandMap;
        if (evt.demandMap.top_threads?.length) setThreads(evt.demandMap.top_threads);
        break;
      case "strategy":
        setStrategy(evt.strategy);
        if (inFlightRef.current) inFlightRef.current.strategy = evt.strategy;
        setTab("strategy");
        break;
      case "reply_planned":
        setDraftTotal((prev) => prev + evt.total);
        break;
      case "content":
        setDrafts((prev) => [...prev, evt.draft]);
        if (inFlightRef.current) inFlightRef.current.drafts = [...inFlightRef.current.drafts, evt.draft];
        if (evt.draft.kind === "broadcast") setDraftTotal((prev) => prev + 1);
        if (!hasAutoSwitchedRef.current) {
          hasAutoSwitchedRef.current = true;
          setTab("launchpad");
        }
        break;
      case "image":
        setImageState({ state: "done", dataUrl: evt.dataUrl });
        if (inFlightRef.current) inFlightRef.current.imageDataUrl = evt.dataUrl;
        break;
      case "image_failed":
        setImageState({ state: "failed", error: evt.reason });
        break;
      case "video":
        setVideoState({ state: "done", dataUrl: evt.dataUrl });
        if (inFlightRef.current) inFlightRef.current.videoDataUrl = evt.dataUrl;
        break;
      case "video_failed":
        setVideoState({ state: "failed", error: evt.reason });
        break;
      case "done":
        setPhase("done");
        persistInFlightRun();
        break;
      case "error":
        setError(evt.message);
        break;
    }
  }

  function persistInFlightRun() {
    const snap = inFlightRef.current;
    if (!snap || !snap.productDescription || snap.drafts.length === 0) return;
    const saved: SavedRun = {
      id: snap.id,
      createdAt: Date.now(),
      productDescription: snap.productDescription,
      demandMap: snap.demandMap,
      strategy: snap.strategy,
      drafts: snap.drafts,
      imageDataUrl: snap.imageDataUrl,
      videoDataUrl: snap.videoDataUrl,
      postedDraftIds: [],
      postedDraftUrls: {},
    };
    getStorage()
      .saveRun(saved)
      .then(refreshRuns)
      .catch(() => {});
  }

  function loadSavedRun(saved: SavedRun) {
    // Re-hydrate the page from a previously saved run.
    setRunning(false);
    setActiveRunId(saved.id);
    setProductDescription(saved.productDescription);
    setDemandMap(saved.demandMap);
    setStrategy(saved.strategy);
    setDrafts(saved.drafts);
    setDraftTotal(saved.drafts.length);
    setThreads(saved.demandMap?.top_threads ?? []);
    setCounts(() => {
      const counts: Partial<Record<Platform, number>> = {};
      for (const t of saved.demandMap?.top_threads ?? []) {
        counts[t.platform] = (counts[t.platform] ?? 0) + 1;
      }
      return counts;
    });
    setImageState(
      saved.imageDataUrl
        ? { state: "done", dataUrl: saved.imageDataUrl }
        : { state: "idle" }
    );
    setVideoState(
      saved.videoDataUrl
        ? { state: "done", dataUrl: saved.videoDataUrl }
        : { state: "idle" }
    );
    setPostedDraftIds(saved.postedDraftIds ?? []);
    setPostedDraftUrls(saved.postedDraftUrls ?? {});
    setRoadmap(saved.roadmap ?? null);
    setRoadmapError(null);
    setLandingCopy(saved.landingCopy ?? null);
    setLandingError(null);
    setSeoBrief(saved.seoBrief ?? null);
    setSeoError(null);
    setError(null);
    setPhase("done");
    setTab("launchpad");
    // Mark all agents as done so the rail looks complete.
    const allDone: Partial<Record<AgentId, AgentStatusEntry>> = {};
    for (const id of ALL_AGENT_IDS) {
      allDone[id] = { status: "done" };
    }
    setStatuses(allDone);
    hasAutoSwitchedRef.current = true;
    inFlightRef.current = null;
  }

  async function markPosted(draftId: string, url: string) {
    if (!activeRunId) return;
    setPostedDraftIds((prev) => (prev.includes(draftId) ? prev : [...prev, draftId]));
    setPostedDraftUrls((prev) => ({ ...prev, [draftId]: url }));
    try {
      await getStorage().markPosted(activeRunId, draftId, url);
      refreshRuns();
    } catch {
      /* ignore */
    }
  }

  async function unmarkPosted(draftId: string) {
    if (!activeRunId) return;
    setPostedDraftIds((prev) => prev.filter((id) => id !== draftId));
    setPostedDraftUrls((prev) => {
      const next = { ...prev };
      delete next[draftId];
      return next;
    });
    try {
      await getStorage().unmarkPosted(activeRunId, draftId);
      refreshRuns();
    } catch {
      /* ignore */
    }
  }

  // Re-save the active run with whatever theme-B outputs have been generated.
  async function persistThemeBPatch(
    patch: Partial<Pick<SavedRun, "roadmap" | "landingCopy" | "competitorMatrix" | "seoBrief">>
  ) {
    if (!activeRunId) return;
    try {
      const existing = await getStorage().loadRun(activeRunId);
      if (!existing) return;
      const merged: SavedRun = { ...existing, ...patch };
      await getStorage().saveRun(merged);
      refreshRuns();
    } catch {
      /* ignore */
    }
  }

  async function generateRoadmap() {
    if (!demandMap || roadmapLoading) return;
    setRoadmapLoading(true);
    setRoadmapError(null);
    try {
      const res = await fetch("/api/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productDescription, demandMap }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setRoadmap(data as RoadmapDoc);
      void persistThemeBPatch({ roadmap: data as RoadmapDoc });
    } catch (err) {
      setRoadmapError(err instanceof Error ? err.message : String(err));
    } finally {
      setRoadmapLoading(false);
    }
  }

  async function generateLandingCopy() {
    if (!demandMap || landingLoading) return;
    setLandingLoading(true);
    setLandingError(null);
    try {
      const res = await fetch("/api/landing-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productDescription, demandMap }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setLandingCopy(data as LandingCopyDoc);
      void persistThemeBPatch({ landingCopy: data as LandingCopyDoc });
    } catch (err) {
      setLandingError(err instanceof Error ? err.message : String(err));
    } finally {
      setLandingLoading(false);
    }
  }

  async function generateSeoBrief() {
    if (!demandMap || seoLoading) return;
    setSeoLoading(true);
    setSeoError(null);
    try {
      const res = await fetch("/api/seo-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productDescription, demandMap }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setSeoBrief(data as SeoBriefDoc);
      void persistThemeBPatch({ seoBrief: data as SeoBriefDoc });
    } catch (err) {
      setSeoError(err instanceof Error ? err.message : String(err));
    } finally {
      setSeoLoading(false);
    }
  }

  // Competitor matrix is pure client-side derivation from the demand map.
  const competitorMentions: CompetitorMention[] = demandMap
    ? extractCompetitors(demandMap)
    : [];

  function deleteRun(id: string) {
    getStorage()
      .deleteRun(id)
      .then(() => {
        refreshRuns();
        if (activeRunId === id) {
          reset();
          setProductDescription("");
        }
      })
      .catch(() => {});
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function retryImage() {
    if (!productDescription.trim()) return;
    setImageState({ state: "running", startedAt: Date.now() });
    updateStatus("image", (prev) => ({
      ...(prev ?? { status: "running" }),
      status: "running",
      startedAt: Date.now(),
      endedAt: undefined,
    }));
    try {
      const res = await fetch("/api/regenerate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productDescription }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setImageState({ state: "done", dataUrl: data.dataUrl });
      updateStatus("image", () => ({
        status: "done",
        startedAt: Date.now(),
        endedAt: Date.now(),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setImageState({ state: "failed", error: message });
      updateStatus("image", () => ({
        status: "failed",
        note: message,
        startedAt: Date.now(),
        endedAt: Date.now(),
      }));
    }
  }

  async function retryVideo() {
    if (!productDescription.trim()) return;
    setVideoState({ state: "running", startedAt: Date.now() });
    updateStatus("video", (prev) => ({
      ...(prev ?? { status: "running" }),
      status: "running",
      startedAt: Date.now(),
      endedAt: undefined,
    }));
    try {
      const res = await fetch("/api/regenerate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productDescription }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setVideoState({ state: "done", dataUrl: data.dataUrl });
      updateStatus("video", () => ({
        status: "done",
        startedAt: Date.now(),
        endedAt: Date.now(),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setVideoState({ state: "failed", error: message });
      updateStatus("video", () => ({
        status: "failed",
        note: message,
        startedAt: Date.now(),
        endedAt: Date.now(),
      }));
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-panel-border bg-black/60 px-6 py-4 backdrop-blur">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-lg font-semibold tracking-tight">
            LaunchAgent <span className="text-accent">▸</span>{" "}
            <span className="font-normal text-zinc-400">
              Find where demand is. Launch there.
            </span>
          </h1>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs font-mono text-zinc-500 md:inline">
              12 agents · Gemini 3.5 Flash · Antigravity sandbox
            </span>
            <button
              onClick={() => setVoiceOpen(true)}
              className={[
                "rounded-md border px-3 py-1.5 text-xs font-mono hover:border-accent/40 hover:text-accent",
                voiceProfile && voiceProfile.samplePosts.length > 0
                  ? "border-accent/50 bg-accent/5 text-accent"
                  : "border-panel-border bg-panel/40 text-zinc-300",
              ].join(" ")}
            >
              Voice{" "}
              {voiceProfile && voiceProfile.samplePosts.length > 0
                ? `(${voiceProfile.samplePosts.length} sample${voiceProfile.samplePosts.length === 1 ? "" : "s"})`
                : "(off)"}
            </button>
            <RunHistory
              runs={runs}
              activeRunId={activeRunId}
              onSelect={loadSavedRun}
              onDelete={deleteRun}
            />
          </div>
        </div>
      </header>

      <section className="border-b border-panel-border px-6 py-6">
        <label className="mb-2 block text-xs font-mono uppercase tracking-wider text-zinc-500">
          Describe your product in one sentence
        </label>
        <div className="flex gap-3">
          <input
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="An open-source tool that…"
            disabled={running}
            className="flex-1 rounded-md border border-panel-border bg-panel/40 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:border-accent focus:outline-none disabled:opacity-50"
          />
          {running ? (
            <button
              onClick={stop}
              className="rounded-md border border-panel-border px-5 py-3 text-sm font-semibold text-zinc-300 hover:border-red-500 hover:text-red-400"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={run}
              disabled={!productDescription.trim()}
              className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-black hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Find demand →
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-xs text-zinc-600">Try:</span>
          {SAMPLE_PROMPTS.map((p) => (
            <button
              key={p}
              disabled={running}
              onClick={() => setProductDescription(p)}
              className="rounded-full border border-panel-border px-3 py-1 text-xs text-zinc-400 hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {p.length > 60 ? p.slice(0, 60) + "…" : p}
            </button>
          ))}
        </div>
        <div className="mt-5">
          <ProgressStrip
            phase={phase}
            draftCount={drafts.length}
            draftTotal={draftTotal}
          />
        </div>
        {error && (
          <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
      </section>

      <VoiceProfile
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onSaved={(profile) => setVoiceProfile(profile)}
        initial={voiceProfile}
      />

      <div className="flex flex-1">
        <AgentRail statuses={statuses} />

        <main className="flex flex-1 flex-col">
          <nav className="flex flex-wrap gap-1 border-b border-panel-border px-6 pt-4">
            {(
              [
                "demand",
                "strategy",
                "launchpad",
                "roadmap",
                "landing",
                "seo",
                "competitors",
                "chat",
              ] as Tab[]
            ).map((t) => {
              const label =
                t === "demand"
                  ? "Demand map"
                  : t === "strategy"
                  ? "Strategy"
                  : t === "launchpad"
                  ? `Launchpad${drafts.length > 0 ? ` · ${drafts.length}` : ""}`
                  : t === "roadmap"
                  ? `Roadmap${roadmap ? ` ✓` : ""}`
                  : t === "landing"
                  ? `Landing copy${landingCopy ? ` ✓` : ""}`
                  : t === "seo"
                  ? `SEO brief${seoBrief ? ` ✓` : ""}`
                  : t === "competitors"
                  ? `Competitors${competitorMentions.length > 0 ? ` · ${competitorMentions.length}` : ""}`
                  : "Chat";
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={[
                    "border-b-2 px-4 py-2 text-sm font-medium",
                    tab === t
                      ? "border-accent text-accent"
                      : "border-transparent text-zinc-500 hover:text-zinc-300",
                  ].join(" ")}
                >
                  {label}
                </button>
              );
            })}
          </nav>
          <div className="flex-1 px-6 py-6">
            {tab === "demand" && <DemandMap threads={threads} counts={counts} />}
            {tab === "strategy" && <StrategyView strategy={strategy} />}
            {tab === "launchpad" && (
              <Launchpad
                drafts={drafts}
                imageState={imageState}
                videoState={videoState}
                productDescription={productDescription}
                onRetryImage={retryImage}
                onRetryVideo={retryVideo}
                postedDraftIds={postedDraftIds}
                postedDraftUrls={postedDraftUrls}
                onMarkPosted={markPosted}
                onUnmarkPosted={unmarkPosted}
              />
            )}
            {tab === "roadmap" && (
              <RoadmapView
                doc={roadmap}
                loading={roadmapLoading}
                error={roadmapError}
                canGenerate={!!demandMap && demandMap.top_threads.length > 0}
                onGenerate={generateRoadmap}
              />
            )}
            {tab === "landing" && (
              <LandingCopyView
                doc={landingCopy}
                loading={landingLoading}
                error={landingError}
                canGenerate={!!demandMap && demandMap.top_threads.length > 0}
                onGenerate={generateLandingCopy}
              />
            )}
            {tab === "competitors" && (
              <CompetitorMatrix
                mentions={competitorMentions}
                hasDemandMap={!!demandMap}
              />
            )}
            {tab === "seo" && (
              <SeoBriefView
                doc={seoBrief}
                loading={seoLoading}
                error={seoError}
                canGenerate={!!demandMap && demandMap.top_threads.length > 0}
                onGenerate={generateSeoBrief}
              />
            )}
            {tab === "chat" && (
              <DemandChat productDescription={productDescription} demandMap={demandMap} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
