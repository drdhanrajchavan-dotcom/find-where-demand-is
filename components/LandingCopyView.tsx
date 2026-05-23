"use client";

import { useState } from "react";
import type { LandingCopyDoc } from "../lib/types";
import { EmptyShell, ErrorShell, LoadingShell } from "./RoadmapView";

interface Props {
  doc: LandingCopyDoc | null;
  loading: boolean;
  error: string | null;
  canGenerate: boolean;
  onGenerate: () => void;
}

export function LandingCopyView({ doc, loading, error, canGenerate, onGenerate }: Props) {
  const [copied, setCopied] = useState(false);

  if (!doc && !loading && !error) {
    return (
      <EmptyShell
        canGenerate={canGenerate}
        onGenerate={onGenerate}
        title="Landing-page copy"
        description="Hero headline, subheadline, three feature blocks, and pain-point quotes — all anchored in real user language from the demand map."
        cta="Generate landing copy"
      />
    );
  }
  if (loading) return <LoadingShell title="Writing landing copy…" />;
  if (error) return <ErrorShell error={error} onRetry={onGenerate} />;
  if (!doc) return null;

  function copyMarkdown() {
    if (!doc) return;
    navigator.clipboard.writeText(landingToMarkdown(doc)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-baseline justify-between">
        <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
          Landing-page copy
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

      <section className="rounded-lg border border-accent/40 bg-accent/5 p-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">
          {doc.hero_headline}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-zinc-300">
          {doc.hero_subheadline}
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-mono uppercase tracking-wider text-zinc-500">
          Feature blocks
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {doc.feature_blocks.map((f, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-lg border border-panel-border bg-panel/60 p-4"
            >
              <h4 className="text-sm font-semibold text-zinc-100">{f.headline}</h4>
              <p className="text-xs leading-relaxed text-zinc-400">{f.body}</p>
              <p className="mt-1 text-[11px] italic text-accent/80">“{f.evidence_quote}”</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-mono uppercase tracking-wider text-zinc-500">
          Social proof quotes (the problem in users' own words)
        </h3>
        <ul className="flex flex-col gap-2">
          {doc.social_proof_quotes.map((q, i) => (
            <li
              key={i}
              className="rounded-lg border border-panel-border bg-panel/40 px-4 py-3 text-sm italic leading-relaxed text-zinc-200"
            >
              “{q}”
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function landingToMarkdown(doc: LandingCopyDoc): string {
  const lines: string[] = [];
  lines.push(`# ${doc.hero_headline}\n\n${doc.hero_subheadline}\n`);
  lines.push("\n## Features\n");
  for (const f of doc.feature_blocks) {
    lines.push(`### ${f.headline}\n${f.body}\n\n> "${f.evidence_quote}"\n`);
  }
  lines.push("\n## What users are saying about the problem\n");
  for (const q of doc.social_proof_quotes) {
    lines.push(`- "${q}"`);
  }
  return lines.join("\n");
}
