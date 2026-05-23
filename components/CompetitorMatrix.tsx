"use client";

import type { CompetitorMention } from "../lib/types";

interface Props {
  mentions: CompetitorMention[];
  hasDemandMap: boolean;
}

export function CompetitorMatrix({ mentions, hasDemandMap }: Props) {
  if (!hasDemandMap) {
    return (
      <div className="rounded-lg border border-dashed border-panel-border p-10 text-center">
        <h2 className="text-sm font-semibold text-zinc-200">Competitor matrix</h2>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-zinc-500">
          Run a discovery first. The matrix is extracted client-side from the demand map — no extra API call.
        </p>
      </div>
    );
  }

  if (mentions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-panel-border p-10 text-center">
        <h2 className="text-sm font-semibold text-zinc-200">Competitor matrix</h2>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-zinc-500">
          No competitor mentions found in the demand map (need a name to appear in at least 2 threads).
        </p>
      </div>
    );
  }

  const max = mentions[0]?.mention_count ?? 1;

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
          Competitor mentions
        </h2>
        <span className="text-xs font-mono text-zinc-600">
          {mentions.length} name{mentions.length === 1 ? "" : "s"} cited in 2+ threads
        </span>
      </header>
      <p className="text-xs text-zinc-500">
        Names extracted from titles + bodies + verbatim phrases. Heuristic only — false positives possible.
      </p>
      <ul className="flex flex-col gap-2">
        {mentions.map((m, i) => {
          const bar = Math.max(8, Math.round((m.mention_count / max) * 100));
          return (
            <li
              key={i}
              className="rounded-lg border border-panel-border bg-panel/60 p-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-zinc-100">
                  {m.competitor_name}
                </h3>
                <span className="font-mono text-xs text-accent">
                  {m.mention_count} mentions
                </span>
              </div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded bg-zinc-900">
                <div
                  className="h-full bg-accent/60"
                  style={{ width: `${bar}%` }}
                />
              </div>
              {m.sample_quote && (
                <p className="mt-3 text-xs italic leading-relaxed text-zinc-400">
                  “{m.sample_quote}”
                </p>
              )}
              {m.sample_thread_url && (
                <a
                  href={m.sample_thread_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-[11px] font-mono text-zinc-500 hover:text-accent"
                >
                  {m.sample_platform} · view source →
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
