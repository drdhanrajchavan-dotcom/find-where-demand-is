"use client";

import { useEffect, useState } from "react";
import type { VoiceProfile as VoiceProfileT } from "../lib/types";
import { getStorage } from "../lib/storage";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (profile: VoiceProfileT | null) => void;
  initial: VoiceProfileT | null;
}

const SAMPLE_COUNT = 3;

export function VoiceProfile({ open, onClose, onSaved, initial }: Props) {
  const [samples, setSamples] = useState<string[]>(() =>
    padToLength(initial?.samplePosts ?? [], SAMPLE_COUNT)
  );
  const [saving, setSaving] = useState(false);

  // Re-seed when modal opens (in case profile changed elsewhere)
  useEffect(() => {
    if (open) setSamples(padToLength(initial?.samplePosts ?? [], SAMPLE_COUNT));
  }, [open, initial]);

  if (!open) return null;

  async function save() {
    const cleaned = samples.map((s) => s.trim()).filter(Boolean);
    setSaving(true);
    try {
      if (cleaned.length === 0) {
        // Treat empty save as a clear: write an empty profile (no removal API)
        const profile: VoiceProfileT = { samplePosts: [], updatedAt: Date.now() };
        await getStorage().saveVoiceProfile(profile);
        onSaved(null);
      } else {
        const profile: VoiceProfileT = {
          samplePosts: cleaned,
          updatedAt: Date.now(),
        };
        await getStorage().saveVoiceProfile(profile);
        onSaved(profile);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function clearAll() {
    setSamples(padToLength([], SAMPLE_COUNT));
  }

  const totalChars = samples.reduce((acc, s) => acc + s.trim().length, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-lg border border-panel-border bg-panel/95 p-6 shadow-2xl">
        <header className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold tracking-tight">
            Voice profile
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200"
            title="Close"
          >
            ×
          </button>
        </header>
        <p className="text-sm text-zinc-400">
          Paste 1-3 sample posts you've written — tweets, blog excerpts, Reddit
          comments, anything you'd like the drafts to sound like. Stored locally
          in your browser only.
        </p>
        <div className="flex flex-col gap-3">
          {samples.map((sample, i) => (
            <div key={i} className="flex flex-col gap-1">
              <label className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                Sample {i + 1}{" "}
                <span className="text-zinc-700">
                  {sample.trim().length > 0 && `· ${sample.trim().length} chars`}
                </span>
              </label>
              <textarea
                value={sample}
                onChange={(e) => {
                  const next = [...samples];
                  next[i] = e.target.value;
                  setSamples(next);
                }}
                rows={4}
                placeholder={
                  i === 0
                    ? "e.g. a recent tweet of yours where you talked about something technical"
                    : i === 1
                    ? "another short post — maybe a Reddit comment or LinkedIn update"
                    : "a third example — the more variety, the better"
                }
                className="w-full resize-y rounded-md border border-panel-border bg-black/40 p-3 text-sm leading-relaxed text-zinc-200 focus:border-accent focus:outline-none"
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-panel-border pt-3 text-[11px] font-mono text-zinc-600">
          <span>{totalChars} chars total</span>
          <button onClick={clearAll} className="hover:text-red-400">
            Clear all
          </button>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-panel-border px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-accent px-5 py-2 text-sm font-semibold text-black hover:bg-accent/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save voice profile"}
          </button>
        </div>
      </div>
    </div>
  );
}

function padToLength(arr: string[], n: number): string[] {
  const out = arr.slice(0, n);
  while (out.length < n) out.push("");
  return out;
}
