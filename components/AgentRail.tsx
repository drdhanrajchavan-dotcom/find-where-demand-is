"use client";

import { useEffect, useState } from "react";
import type { AgentCounter, AgentId, AgentStatus } from "../lib/types";

export interface AgentStatusEntry {
  status: AgentStatus;
  note?: string;
  counter?: AgentCounter;
  startedAt?: number;
  endedAt?: number;
}

interface AgentRow {
  id: AgentId;
  label: string;
  group: "discover" | "synth" | "create";
}

const AGENTS: AgentRow[] = [
  { id: "discovery_reddit", label: "Reddit", group: "discover" },
  { id: "discovery_hackernews", label: "Hacker News", group: "discover" },
  { id: "discovery_github", label: "GitHub", group: "discover" },
  { id: "discovery_devto", label: "Dev.to", group: "discover" },
  { id: "discovery_stackoverflow", label: "Stack Overflow", group: "discover" },
  { id: "discovery_x", label: "X / Twitter", group: "discover" },
  { id: "aggregator", label: "Aggregator", group: "synth" },
  { id: "strategy", label: "Strategy", group: "synth" },
  { id: "content_replies", label: "Reply Writer", group: "create" },
  { id: "content_x", label: "X Writer", group: "create" },
  { id: "content_linkedin", label: "LinkedIn Writer", group: "create" },
  { id: "image", label: "Image", group: "create" },
  { id: "video", label: "Video", group: "create" },
];

const GROUP_LABELS: Record<AgentRow["group"], string> = {
  discover: "1. Discover demand",
  synth: "2. Synthesize",
  create: "3. Draft assets",
};

function statusBadge(status: AgentStatus | undefined) {
  switch (status) {
    case "running":
      return <span className="inline-flex h-2 w-2 rounded-full bg-accent pulse-accent" />;
    case "done":
      return <span className="inline-flex h-2 w-2 rounded-full bg-accent" />;
    case "failed":
      return <span className="inline-flex h-2 w-2 rounded-full bg-red-500" />;
    case "skipped":
      return <span className="inline-flex h-2 w-2 rounded-full bg-zinc-600" />;
    default:
      return <span className="inline-flex h-2 w-2 rounded-full bg-zinc-800" />;
  }
}

function useTick(ms = 500): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

function elapsedLabel(entry: AgentStatusEntry | undefined, now: number): string {
  if (!entry?.startedAt) return "";
  const endedAt = entry.status === "running" ? now : entry.endedAt ?? now;
  const seconds = Math.max(0, Math.round((endedAt - entry.startedAt) / 1000));
  if (seconds < 1) return "";
  return `${seconds}s`;
}

export function AgentRail({
  statuses,
}: {
  statuses: Partial<Record<AgentId, AgentStatusEntry>>;
}) {
  // Tick to keep elapsed-time labels updating while agents are running.
  useTick(500);
  const now = Date.now();

  const groups: AgentRow["group"][] = ["discover", "synth", "create"];

  const groupCounts = groups.map((group) => {
    const inGroup = AGENTS.filter((a) => a.group === group);
    const done = inGroup.filter((a) => {
      const s = statuses[a.id]?.status;
      return s === "done" || s === "skipped" || s === "failed";
    }).length;
    return { group, done, total: inGroup.length };
  });

  return (
    <aside className="w-72 shrink-0 border-r border-panel-border bg-panel/40 px-4 py-6 text-sm">
      <h2 className="mb-4 text-xs font-mono uppercase tracking-wider text-zinc-500">
        Agent trace
      </h2>
      <div className="flex flex-col gap-6">
        {groups.map((group) => {
          const count = groupCounts.find((c) => c.group === group)!;
          return (
            <div key={group}>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">
                  {GROUP_LABELS[group]}
                </h3>
                <span className="text-[10px] font-mono text-zinc-700">
                  {count.done}/{count.total}
                </span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {AGENTS.filter((a) => a.group === group).map((agent) => {
                  const entry = statuses[agent.id];
                  const elapsed = elapsedLabel(entry, now);
                  const counter = entry?.counter;
                  return (
                    <li
                      key={agent.id}
                      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-zinc-300"
                      title={entry?.note}
                    >
                      {statusBadge(entry?.status)}
                      <span className="flex-1 truncate">
                        {agent.label}
                        {counter && (
                          <span className="ml-2 font-mono text-[11px] text-accent/80">
                            {counter.current}/{counter.total}
                          </span>
                        )}
                      </span>
                      {entry?.status === "running" && (
                        <span className="font-mono text-[10px] text-zinc-500">
                          {elapsed || <span className="dots" />}
                        </span>
                      )}
                      {(entry?.status === "done" || entry?.status === "skipped") && elapsed && (
                        <span className="font-mono text-[10px] text-zinc-600">{elapsed}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
