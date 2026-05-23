"use client";

import type { Strategy } from "../lib/types";

export function StrategyView({ strategy }: { strategy: Strategy | null }) {
  if (!strategy) {
    return (
      <div className="rounded-lg border border-dashed border-panel-border p-8 text-center text-sm text-zinc-500">
        Strategy appears once the Aggregator finishes ranking the demand map.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-3 text-xs font-mono uppercase tracking-wider text-zinc-500">
          Channel ranking
        </h3>
        <ol className="flex flex-col gap-2">
          {strategy.channel_ranking?.map((c, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-lg border border-panel-border bg-panel/60 p-3"
            >
              <span className="text-sm font-mono text-accent">{i + 1}.</span>
              <div>
                <div className="text-sm font-medium capitalize text-zinc-100">
                  {c.platform}
                </div>
                <div className="text-xs text-zinc-400">{c.rationale}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-mono uppercase tracking-wider text-zinc-500">
          Tone per platform
        </h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {Object.entries(strategy.tone_per_platform ?? {}).map(
            ([platform, tone]) => (
              <div
                key={platform}
                className="rounded-lg border border-panel-border bg-panel/60 p-3"
              >
                <div className="mb-1 text-xs font-mono uppercase tracking-wider text-accent">
                  {platform}
                </div>
                <div className="text-xs leading-relaxed text-zinc-400">
                  {tone}
                </div>
              </div>
            )
          )}
        </div>
      </section>

      {strategy.engagement_strategy_per_channel?.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-mono uppercase tracking-wider text-zinc-500">
            Engagement plan
          </h3>
          <ul className="flex flex-col gap-2">
            {strategy.engagement_strategy_per_channel.map((e, i) => (
              <li
                key={i}
                className="rounded-lg border border-panel-border bg-panel/60 p-3"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded border border-panel-border px-2 py-0.5 font-mono capitalize text-zinc-300">
                    {e.platform}
                  </span>
                  <span className="rounded border border-accent/40 px-2 py-0.5 font-mono text-accent">
                    {e.action}
                  </span>
                  {e.target_url && (
                    <a
                      href={e.target_url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-xs text-zinc-500 hover:text-accent"
                    >
                      {e.target_url}
                    </a>
                  )}
                </div>
                <div className="mt-1 text-xs text-zinc-400">{e.rationale}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
