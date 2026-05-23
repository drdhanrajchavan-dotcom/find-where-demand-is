"use client";

import { useState } from "react";
import type { SeoBriefDoc } from "../lib/types";
import { EmptyShell, ErrorShell, LoadingShell } from "./RoadmapView";

interface Props {
  doc: SeoBriefDoc | null;
  loading: boolean;
  error: string | null;
  canGenerate: boolean;
  onGenerate: () => void;
}

export function SeoBriefView({ doc, loading, error, canGenerate, onGenerate }: Props) {
  const [copied, setCopied] = useState(false);

  if (!doc && !loading && !error) {
    return (
      <EmptyShell
        canGenerate={canGenerate}
        onGenerate={onGenerate}
        title="SEO content brief"
        description="A long-form blog post outline targeting search demand identified by the demand map: primary keyword, section outline, evidence quotes, internal link anchors."
        cta="Generate SEO brief"
      />
    );
  }
  if (loading) return <LoadingShell title="Drafting SEO brief…" />;
  if (error) return <ErrorShell error={error} onRetry={onGenerate} />;
  if (!doc) return null;

  function copyMarkdown() {
    if (!doc) return;
    navigator.clipboard.writeText(briefToMarkdown(doc)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-baseline justify-between">
        <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
          SEO content brief
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

      <section className="rounded-lg border border-accent/40 bg-accent/5 p-4">
        <div className="flex flex-wrap items-baseline gap-3 text-sm">
          <span className="text-[11px] font-mono uppercase tracking-wider text-accent">
            Primary keyword
          </span>
          <span className="text-zinc-100">{doc.target_keyword}</span>
        </div>
        {doc.secondary_keywords.length > 0 && (
          <div className="mt-2 flex flex-wrap items-baseline gap-2 text-xs">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
              Secondary
            </span>
            {doc.secondary_keywords.map((k) => (
              <span
                key={k}
                className="rounded border border-panel-border px-2 py-0.5 font-mono text-zinc-300"
              >
                {k}
              </span>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-zinc-400">
          <span className="font-mono uppercase tracking-wider text-zinc-500">
            Audience:{" "}
          </span>
          {doc.target_audience}
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-mono uppercase tracking-wider text-zinc-500">
          Title options
        </h3>
        <ul className="flex flex-col gap-1.5">
          {doc.title_options.map((t, i) => (
            <li
              key={i}
              className="rounded-md border border-panel-border bg-panel/60 px-3 py-2 text-sm text-zinc-100"
            >
              {t}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-mono uppercase tracking-wider text-zinc-500">
          Outline
        </h3>
        <ol className="flex flex-col gap-3">
          {doc.outline.map((sec, i) => (
            <li
              key={i}
              className="rounded-lg border border-panel-border bg-panel/60 p-4"
            >
              <h4 className="text-sm font-semibold text-zinc-100">
                <span className="font-mono text-accent">H{i + 2}.</span> {sec.heading}
              </h4>
              <ul className="mt-2 flex flex-col gap-1 text-xs leading-relaxed text-zinc-400">
                {sec.bullets.map((b, bi) => (
                  <li key={bi}>• {b}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      {doc.evidence_pull_quotes.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-mono uppercase tracking-wider text-zinc-500">
            Pull quotes (real user pain — drop into the post)
          </h3>
          <ul className="flex flex-col gap-2">
            {doc.evidence_pull_quotes.map((q, i) => (
              <li
                key={i}
                className="rounded-lg border border-panel-border bg-panel/40 p-3"
              >
                <p className="text-xs italic leading-snug text-zinc-200">
                  “{q.quote}”
                </p>
                <a
                  href={q.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-[11px] font-mono text-zinc-500 hover:text-accent"
                >
                  {q.source_url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {doc.internal_link_anchor_texts.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-mono uppercase tracking-wider text-zinc-500">
            Internal link anchor texts
          </h3>
          <div className="flex flex-wrap gap-2">
            {doc.internal_link_anchor_texts.map((a, i) => (
              <span
                key={i}
                className="rounded border border-accent/30 bg-accent/5 px-2 py-0.5 text-xs font-mono text-accent"
              >
                {a}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function briefToMarkdown(doc: SeoBriefDoc): string {
  const lines: string[] = [];
  lines.push("# SEO Content Brief\n");
  lines.push(`**Primary keyword:** ${doc.target_keyword}`);
  lines.push(`**Secondary keywords:** ${doc.secondary_keywords.join(", ")}`);
  lines.push(`**Audience:** ${doc.target_audience}\n`);
  lines.push("## Title options");
  for (const t of doc.title_options) lines.push(`- ${t}`);
  lines.push("\n## Outline");
  doc.outline.forEach((sec, i) => {
    lines.push(`\n### H${i + 2}. ${sec.heading}`);
    for (const b of sec.bullets) lines.push(`- ${b}`);
  });
  if (doc.evidence_pull_quotes.length > 0) {
    lines.push("\n## Pull quotes");
    for (const q of doc.evidence_pull_quotes) {
      lines.push(`> "${q.quote}"  \n> — ${q.source_url}`);
    }
  }
  if (doc.internal_link_anchor_texts.length > 0) {
    lines.push("\n## Internal link anchors");
    for (const a of doc.internal_link_anchor_texts) lines.push(`- ${a}`);
  }
  return lines.join("\n");
}
