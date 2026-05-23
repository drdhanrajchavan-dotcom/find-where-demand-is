"use client";

import { useState } from "react";
import type { RoadmapDoc } from "../lib/types";

interface Props {
  doc: RoadmapDoc | null;
  loading: boolean;
  error: string | null;
  canGenerate: boolean;
  onGenerate: () => void;
}

export function RoadmapView({ doc, loading, error, canGenerate, onGenerate }: Props) {
  const [copied, setCopied] = useState(false);

  if (!doc && !loading && !error) {
    return (
      <EmptyShell
        canGenerate={canGenerate}
        onGenerate={onGenerate}
        title="Roadmap synthesizer"
        description="Distill the demand map into 5-7 features worth shipping next, each grounded in real user quotes."
        cta="Generate roadmap"
      />
    );
  }

  if (loading) return <LoadingShell title="Synthesizing roadmap…" />;
  if (error) return <ErrorShell error={error} onRetry={onGenerate} />;

  if (!doc) return null;

  function copyMarkdown() {
    if (!doc) return;
    const md = roadmapToMarkdown(doc);
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-baseline justify-between">
        <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
          Roadmap synthesizer
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={copyMarkdown}
            className="rounded-md border border-panel-border px-3 py-1.5 text-xs text-zinc-300 hover:border-accent/60 hover:text-accent"
          >
            {copied ? "Copied ✓" : "Copy markdown"}
          </button>
          <button
            onClick={onGenerate}
            className="rounded-md border border-panel-border px-3 py-1.5 text-xs text-zinc-300 hover:border-accent/60 hover:text-accent"
          >
            Regenerate
          </button>
        </div>
      </header>

      {doc.summary && (
        <p className="rounded-lg border border-accent/30 bg-accent/5 p-4 text-sm leading-relaxed text-zinc-100">
          {doc.summary}
        </p>
      )}

      <ol className="flex flex-col gap-3">
        {doc.features.map((f, i) => (
          <li
            key={i}
            className="rounded-lg border border-panel-border bg-panel/60 p-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-zinc-100">
                <span className="font-mono text-accent">{i + 1}.</span>{" "}
                {f.title}
              </h3>
              <span
                className={[
                  "rounded border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider",
                  f.priority === "must-have"
                    ? "border-accent/50 text-accent"
                    : "border-panel-border text-zinc-500",
                ].join(" ")}
              >
                {f.priority}
              </span>
            </div>
            {f.existing_competitors_offering_it && (
              <p className="mt-1 text-[11px] text-zinc-500">
                Competitors offering it: {f.existing_competitors_offering_it}
              </p>
            )}
            {f.evidence.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {f.evidence.map((e, ei) => (
                  <li
                    key={ei}
                    className="rounded-md border border-panel-border/60 bg-black/40 px-3 py-2"
                  >
                    <p className="text-xs italic leading-snug text-zinc-300">
                      “{e.quote}”
                    </p>
                    <a
                      href={e.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-[10px] font-mono text-zinc-500 hover:text-accent"
                    >
                      {e.platform} · {e.source_url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function roadmapToMarkdown(doc: RoadmapDoc): string {
  const lines: string[] = [];
  lines.push("# Roadmap (synthesized from demand map)\n");
  if (doc.summary) lines.push(`> ${doc.summary}\n`);
  doc.features.forEach((f, i) => {
    lines.push(`## ${i + 1}. ${f.title}  \`[${f.priority}]\``);
    if (f.existing_competitors_offering_it) {
      lines.push(`*Competitors offering it: ${f.existing_competitors_offering_it}*`);
    }
    if (f.evidence.length > 0) {
      lines.push("\nEvidence:");
      for (const e of f.evidence) {
        lines.push(`- "${e.quote}" — [${e.platform}](${e.source_url})`);
      }
    }
    lines.push("");
  });
  return lines.join("\n");
}

function EmptyShell({
  canGenerate,
  onGenerate,
  title,
  description,
  cta,
}: {
  canGenerate: boolean;
  onGenerate: () => void;
  title: string;
  description: string;
  cta: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-panel-border p-10 text-center">
      <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-zinc-500">
        {description}
      </p>
      <button
        onClick={onGenerate}
        disabled={!canGenerate}
        className="mt-5 inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2 text-sm font-semibold text-black hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {cta} →
      </button>
      {!canGenerate && (
        <p className="mt-2 text-[11px] text-zinc-600">
          Run a discovery first to build a demand map.
        </p>
      )}
    </div>
  );
}

function LoadingShell({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-panel-border bg-panel/40 p-10">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
      <p className="text-xs font-mono text-zinc-400">{title}</p>
    </div>
  );
}

function ErrorShell({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-6">
      <p className="text-xs text-red-300">{error}</p>
      <button
        onClick={onRetry}
        className="mt-3 rounded-md border border-red-400/40 px-3 py-1.5 text-xs text-red-200 hover:border-red-400"
      >
        Retry
      </button>
    </div>
  );
}

export { EmptyShell, LoadingShell, ErrorShell };
