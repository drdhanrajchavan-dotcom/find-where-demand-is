// Backend-agnostic persistence for LaunchAgent. Today: localStorage.
// Tomorrow: swap createLocalStorageBackend() for a Postgres-backed impl
// without touching call sites.

import type { SavedRun, VoiceProfile } from "./types";

const RUNS_KEY = "launchagent.runs";
const VOICE_KEY = "launchagent.voice_profile";
const MAX_RUNS = 50;

export interface StorageBackend {
  saveRun(run: SavedRun): Promise<void>;
  loadRuns(): Promise<SavedRun[]>;
  loadRun(id: string): Promise<SavedRun | null>;
  deleteRun(id: string): Promise<void>;
  markPosted(runId: string, draftId: string, postedUrl: string): Promise<void>;
  unmarkPosted(runId: string, draftId: string): Promise<void>;
  saveVoiceProfile(profile: VoiceProfile): Promise<void>;
  loadVoiceProfile(): Promise<VoiceProfile | null>;
}

class LocalStorageBackend implements StorageBackend {
  private get available(): boolean {
    return typeof window !== "undefined" && !!window.localStorage;
  }

  private readRuns(): SavedRun[] {
    if (!this.available) return [];
    try {
      const raw = window.localStorage.getItem(RUNS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as SavedRun[]) : [];
    } catch {
      return [];
    }
  }

  private writeRuns(runs: SavedRun[]): void {
    if (!this.available) return;
    try {
      window.localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
    } catch {
      // QuotaExceededError — drop the oldest half and retry once.
      const trimmed = runs.slice(0, Math.floor(runs.length / 2));
      try {
        window.localStorage.setItem(RUNS_KEY, JSON.stringify(trimmed));
      } catch {
        // give up silently — better than crashing the app
      }
    }
  }

  async saveRun(run: SavedRun): Promise<void> {
    const runs = this.readRuns();
    const existingIdx = runs.findIndex((r) => r.id === run.id);
    if (existingIdx >= 0) {
      runs[existingIdx] = run;
    } else {
      runs.unshift(run); // newest first
    }
    if (runs.length > MAX_RUNS) runs.length = MAX_RUNS;
    this.writeRuns(runs);
  }

  async loadRuns(): Promise<SavedRun[]> {
    return this.readRuns();
  }

  async loadRun(id: string): Promise<SavedRun | null> {
    return this.readRuns().find((r) => r.id === id) ?? null;
  }

  async deleteRun(id: string): Promise<void> {
    const runs = this.readRuns().filter((r) => r.id !== id);
    this.writeRuns(runs);
  }

  async markPosted(runId: string, draftId: string, postedUrl: string): Promise<void> {
    const runs = this.readRuns();
    const idx = runs.findIndex((r) => r.id === runId);
    if (idx < 0) return;
    const run = runs[idx];
    const postedIds = new Set(run.postedDraftIds ?? []);
    postedIds.add(draftId);
    const postedUrls = { ...(run.postedDraftUrls ?? {}), [draftId]: postedUrl };
    runs[idx] = { ...run, postedDraftIds: Array.from(postedIds), postedDraftUrls: postedUrls };
    this.writeRuns(runs);
  }

  async unmarkPosted(runId: string, draftId: string): Promise<void> {
    const runs = this.readRuns();
    const idx = runs.findIndex((r) => r.id === runId);
    if (idx < 0) return;
    const run = runs[idx];
    const postedIds = (run.postedDraftIds ?? []).filter((id) => id !== draftId);
    const postedUrls = { ...(run.postedDraftUrls ?? {}) };
    delete postedUrls[draftId];
    runs[idx] = { ...run, postedDraftIds: postedIds, postedDraftUrls: postedUrls };
    this.writeRuns(runs);
  }

  async saveVoiceProfile(profile: VoiceProfile): Promise<void> {
    if (!this.available) return;
    try {
      window.localStorage.setItem(VOICE_KEY, JSON.stringify(profile));
    } catch {
      // ignore
    }
  }

  async loadVoiceProfile(): Promise<VoiceProfile | null> {
    if (!this.available) return null;
    try {
      const raw = window.localStorage.getItem(VOICE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as VoiceProfile).samplePosts)
      ) {
        return parsed as VoiceProfile;
      }
      return null;
    } catch {
      return null;
    }
  }
}

let _backend: StorageBackend | null = null;

export function getStorage(): StorageBackend {
  if (!_backend) _backend = new LocalStorageBackend();
  return _backend;
}

/**
 * Cheap formatter for the run history list.
 * "Just now" / "12m ago" / "3h ago" / "Yesterday" / "May 23".
 */
export function relativeTime(timestamp: number, now: number = Date.now()): string {
  const diffMs = now - timestamp;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 30) return "just now";
  if (sec < 90) return "1m ago";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
