"use client";

import { useEffect, useRef, useState } from "react";
import type { SavedRun } from "../lib/types";
import { relativeTime } from "../lib/storage";

interface Props {
  runs: SavedRun[];
  activeRunId: string | null;
  onSelect: (run: SavedRun) => void;
  onDelete: (id: string) => void;
}

export function RunHistory({ runs, activeRunId, onSelect, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-panel-border bg-panel/40 px-3 py-1.5 text-xs font-mono text-zinc-300 hover:border-accent/40 hover:text-accent"
      >
        Recent runs ({runs.length}) {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-96 max-h-[60vh] overflow-y-auto rounded-md border border-panel-border bg-black/95 p-1 shadow-xl backdrop-blur">
          {runs.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-zinc-500">
              No runs yet. Run a discovery to start building history.
            </div>
          ) : (
            <ul className="flex flex-col">
              {runs.map((run) => {
                const draftsCount = run.drafts?.length ?? 0;
                const postedCount = run.postedDraftIds?.length ?? 0;
                const isActive = run.id === activeRunId;
                return (
                  <li key={run.id} className="group">
                    <div
                      className={[
                        "flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors",
                        isActive
                          ? "bg-accent/10 ring-1 ring-accent/40"
                          : "hover:bg-panel/60",
                      ].join(" ")}
                    >
                      <button
                        onClick={() => {
                          onSelect(run);
                          setOpen(false);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="truncate text-sm text-zinc-100">
                          {run.productDescription || "(no description)"}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] font-mono text-zinc-500">
                          <span>{relativeTime(run.createdAt)}</span>
                          <span className="text-zinc-700">·</span>
                          <span>
                            {draftsCount} draft{draftsCount === 1 ? "" : "s"}
                          </span>
                          {postedCount > 0 && (
                            <>
                              <span className="text-zinc-700">·</span>
                              <span className="text-accent">
                                {postedCount} posted
                              </span>
                            </>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Delete this run?")) onDelete(run.id);
                        }}
                        className="opacity-0 transition-opacity group-hover:opacity-100 text-zinc-600 hover:text-red-400"
                        title="Delete run"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
