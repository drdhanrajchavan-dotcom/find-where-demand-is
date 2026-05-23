"use client";

import { useMemo, useState } from "react";
import type { DiscoveredThread, Platform } from "../lib/types";

type SortMode = "engagement" | "recency" | "platform";

const PLATFORM_LABEL: Record<Platform, string> = {
  reddit: "Reddit",
  hackernews: "Hacker News",
  github: "GitHub",
  devto: "Dev.to",
  stackoverflow: "Stack Overflow",
  x: "X / Twitter",
};

const PLATFORM_COLOR: Record<Platform, string> = {
  reddit: "text-orange-400 border-orange-400/30",
  hackernews: "text-orange-300 border-orange-300/30",
  github: "text-zinc-300 border-zinc-500/30",
  devto: "text-zinc-100 border-zinc-400/30",
  stackoverflow: "text-amber-300 border-amber-300/30",
  x: "text-sky-300 border-sky-300/30",
};

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function DemandMap({
  threads,
  counts,
}: {
  threads: DiscoveredThread[];
  counts: Partial<Record<Platform, number>>;
}) {
  const platforms: Platform[] = ["reddit", "hackernews", "github", "devto", "stackoverflow", "x"];
  const [sort, setSort] = useState<SortMode>("engagement");

  const sorted = useMemo(() => {
    const arr = [...threads];
    switch (sort) {
      case "engagement":
        return arr.sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0));
      case "recency":
        return arr.sort(
          (a, b) =>
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
      case "platform":
        return arr.sort((a, b) => a.platform.localeCompare(b.platform));
    }
  }, [threads, sort]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs font-mono">
          {platforms.map((p) => (
            <span
              key={p}
              className={`rounded-full border px-3 py-1 ${PLATFORM_COLOR[p]}`}
            >
              {PLATFORM_LABEL[p]}: {counts[p] ?? 0}
            </span>
          ))}
          <span className="rounded-full border border-accent/40 px-3 py-1 text-accent">
            Total: {threads.length}
          </span>
        </div>
        {threads.length > 0 && (
          <label className="flex items-center gap-2 text-xs font-mono text-zinc-500">
            Sort by:
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="rounded-md border border-panel-border bg-black/40 px-2 py-1 text-zinc-200 focus:border-accent focus:outline-none"
            >
              <option value="engagement">engagement</option>
              <option value="recency">recency</option>
              <option value="platform">platform</option>
            </select>
          </label>
        )}
      </div>

      {threads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-panel-border p-8 text-center text-sm text-zinc-500">
          Discovery results stream in here as each agent reports back.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted.map((thread, i) => (
            <li
              key={`${thread.thread_url}-${i}`}
              className="rounded-lg border border-panel-border bg-panel/60 p-4 transition-colors hover:border-accent/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`rounded border px-2 py-0.5 font-mono ${PLATFORM_COLOR[thread.platform]}`}
                    >
                      {PLATFORM_LABEL[thread.platform]}
                    </span>
                    {thread.subreddit && (
                      <span className="font-mono text-zinc-500">
                        r/{thread.subreddit.replace(/^r\//, "")}
                      </span>
                    )}
                    {thread.repo && (
                      <span className="font-mono text-zinc-500">
                        {thread.repo}
                      </span>
                    )}
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-500">
                      {fmtDate(thread.created_at)}
                    </span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-400">
                      engagement {Math.round(thread.engagement ?? 0)}
                    </span>
                  </div>
                  <a
                    href={thread.thread_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-sm font-medium text-zinc-100 hover:text-accent"
                  >
                    {thread.title}
                  </a>
                  {thread.body_snippet && (
                    <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                      {thread.body_snippet}
                    </p>
                  )}
                  {thread.verbatim_phrases?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {thread.verbatim_phrases.slice(0, 3).map((phrase, idx) => (
                        <span
                          key={idx}
                          className="rounded border border-accent/30 bg-accent/5 px-2 py-0.5 text-[11px] font-mono text-accent"
                        >
                          “{phrase}”
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
