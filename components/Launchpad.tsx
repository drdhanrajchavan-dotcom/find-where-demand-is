"use client";

import { useState } from "react";
import type {
  BroadcastDraft,
  ContentDraft,
  ImageState,
  Platform,
  ReplyDraft,
  VideoState,
} from "../lib/types";
import {
  buildLinkedInShareLink,
  buildXIntentLink,
} from "../lib/deeplinks";
import { sourceLabel } from "../lib/source-urls";

interface Props {
  drafts: ContentDraft[];
  imageState: ImageState;
  videoState: VideoState;
  productDescription: string;
  onRetryImage: () => void;
  onRetryVideo: () => void;
  postedDraftIds: string[];
  postedDraftUrls: Record<string, string>;
  onMarkPosted: (draftId: string, url: string) => void;
  onUnmarkPosted: (draftId: string) => void;
}

interface PostedProps {
  isPosted: boolean;
  postedUrl?: string;
  onMarkPosted: (url: string) => void;
  onUnmarkPosted: () => void;
}

const PLATFORM_BADGE_CLASS: Record<Platform, string> = {
  reddit: "text-orange-400 border-orange-400/40 bg-orange-400/5",
  hackernews: "text-orange-300 border-orange-300/40 bg-orange-300/5",
  github: "text-zinc-200 border-zinc-400/40 bg-zinc-400/5",
  devto: "text-zinc-100 border-zinc-300/40 bg-zinc-300/5",
  stackoverflow: "text-amber-300 border-amber-300/40 bg-amber-300/5",
};

const PLATFORM_DISPLAY: Record<Platform, string> = {
  reddit: "Reddit",
  hackernews: "Hacker News",
  github: "GitHub",
  devto: "Dev.to",
  stackoverflow: "Stack Overflow",
};

export function Launchpad({
  drafts,
  imageState,
  videoState,
  productDescription,
  onRetryImage,
  onRetryVideo,
  postedDraftIds,
  postedDraftUrls,
  onMarkPosted,
  onUnmarkPosted,
}: Props) {
  const replies = drafts.filter((d): d is ReplyDraft => d.kind === "reply");
  const broadcasts = drafts.filter((d): d is BroadcastDraft => d.kind === "broadcast");
  const xDraft = broadcasts.find((b) => b.platform === "x");
  const linkedinDraft = broadcasts.find((b) => b.platform === "linkedin");

  const postedSet = new Set(postedDraftIds);
  function postedPropsFor(id: string): PostedProps {
    return {
      isPosted: postedSet.has(id),
      postedUrl: postedDraftUrls[id],
      onMarkPosted: (url) => onMarkPosted(id, url),
      onUnmarkPosted: () => onUnmarkPosted(id),
    };
  }

  const empty =
    replies.length === 0 &&
    broadcasts.length === 0 &&
    imageState.state === "idle" &&
    videoState.state === "idle";
  if (empty) {
    return (
      <div className="rounded-lg border border-dashed border-panel-border p-12 text-center text-sm text-zinc-500">
        Drafted replies and broadcast posts will appear here as agents finish.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            Reply to sources
          </h2>
          <span className="text-xs font-mono text-zinc-600">
            {replies.length} {replies.length === 1 ? "reply" : "replies"} drafted
          </span>
        </div>
        {replies.length === 0 ? (
          <div className="rounded-lg border border-dashed border-panel-border p-8 text-center text-xs text-zinc-500">
            Per-thread replies stream in as each Reply Writer agent finishes.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {replies.map((reply) => (
              <ReplyCard key={reply.id} reply={reply} posted={postedPropsFor(reply.id)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            Broadcast posts
          </h2>
          <span className="text-xs font-mono text-zinc-600">
            amplification — link to the conversations you replied in
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {xDraft ? (
            <BroadcastXCard draft={xDraft} posted={postedPropsFor(xDraft.id)} />
          ) : (
            <BroadcastPlaceholder platform="X / Twitter" hint="X writer is drafting…" />
          )}
          {linkedinDraft ? (
            <BroadcastLinkedInCard draft={linkedinDraft} posted={postedPropsFor(linkedinDraft.id)} />
          ) : (
            <BroadcastPlaceholder platform="LinkedIn" hint="LinkedIn writer is drafting…" />
          )}
          <ImageCard
            state={imageState}
            productDescription={productDescription}
            onRetry={onRetryImage}
          />
          <VideoCard
            state={videoState}
            productDescription={productDescription}
            onRetry={onRetryVideo}
          />
        </div>
      </section>
    </div>
  );
}

// -------------------------------------------------------------------------
// Reply cards
// -------------------------------------------------------------------------

function PostedRow({ posted }: { posted: PostedProps }) {
  if (posted.isPosted && posted.postedUrl) {
    return (
      <div className="flex items-center justify-between border-t border-accent/20 pt-2 text-[11px]">
        <a
          href={posted.postedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-accent hover:underline"
        >
          ✓ Posted — view live →
        </a>
        <button
          onClick={posted.onUnmarkPosted}
          className="font-mono text-zinc-600 hover:text-red-400"
        >
          unmark
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between border-t border-panel-border pt-2 text-[11px]">
      <button
        onClick={() => {
          const url = window.prompt(
            "Paste the URL of your live post / comment so you can find it later:",
            ""
          );
          if (url && url.trim()) posted.onMarkPosted(url.trim());
        }}
        className="font-mono text-zinc-500 hover:text-accent"
      >
        ◌ Mark as posted
      </button>
    </div>
  );
}

function ReplyCard({ reply, posted }: { reply: ReplyDraft; posted: PostedProps }) {
  const [body, setBody] = useState(reply.reply_body);
  const [copied, setCopied] = useState(false);
  const label = sourceLabel({
    platform: reply.source_platform,
    url: reply.source_thread_url,
    subreddit: reply.source_subreddit,
    repo: reply.source_repo,
  });
  const targetUrl = reply.source_comment_permalink ?? reply.source_thread_url;
  const isComment = Boolean(reply.source_comment_permalink);

  function openAndCopy() {
    navigator.clipboard.writeText(body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }

  function copyOnly() {
    navigator.clipboard.writeText(body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-panel-border bg-panel/60 p-4 transition-colors hover:border-accent/40">
      <header className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`rounded border px-2 py-0.5 font-mono ${PLATFORM_BADGE_CLASS[reply.source_platform]}`}
        >
          {PLATFORM_DISPLAY[reply.source_platform]}
        </span>
        <span className="font-mono text-zinc-500">{label}</span>
        {typeof reply.source_engagement === "number" && reply.source_engagement > 0 && (
          <>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">
              engagement {Math.round(reply.source_engagement)}
            </span>
          </>
        )}
      </header>
      <a
        href={reply.source_thread_url}
        target="_blank"
        rel="noreferrer"
        className="block text-sm font-medium text-zinc-100 hover:text-accent"
      >
        {reply.source_thread_title || reply.source_thread_url}
      </a>
      {isComment && reply.source_comment_author && (
        <div className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
          <div className="mb-1 flex items-center gap-2 text-[11px]">
            <span className="font-mono text-accent">
              Replying to @{reply.source_comment_author}
            </span>
            {typeof reply.source_comment_score === "number" && reply.source_comment_score > 0 && (
              <span className="font-mono text-accent/60">
                · {reply.source_comment_score} pts
              </span>
            )}
          </div>
          <p className="text-xs italic leading-snug text-zinc-300">
            “{(reply.source_comment_text ?? "").slice(0, 240)}
            {(reply.source_comment_text ?? "").length > 240 && "…"}”
          </p>
        </div>
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        className="w-full resize-y rounded-md border border-panel-border bg-black/40 p-3 text-sm leading-relaxed text-zinc-200 focus:border-accent focus:outline-none"
      />
      <div className="flex flex-wrap gap-2">
        <button
          onClick={openAndCopy}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent/90"
        >
          {copied
            ? "Copied — opening…"
            : isComment
            ? "Open comment + copy reply"
            : "Open thread + copy reply"}{" "}
          →
        </button>
        <button
          onClick={copyOnly}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-panel-border px-3 py-2 text-sm text-zinc-300 hover:border-accent/60 hover:text-accent"
        >
          {copied ? "Copied ✓" : "Copy reply only"}
        </button>
      </div>
      <p className="text-[11px] leading-snug text-zinc-500">
        {isComment
          ? `Opens the ${PLATFORM_DISPLAY[reply.source_platform]} page scrolled to @${reply.source_comment_author}'s comment. Click Reply on that comment and paste.`
          : `Click the green button to open the ${PLATFORM_DISPLAY[reply.source_platform]} thread in a new tab — your reply is copied to the clipboard. Hit Reply on the thread, paste (Cmd-V), post.`}
      </p>
      <PostedRow posted={posted} />
    </div>
  );
}

// -------------------------------------------------------------------------
// Broadcast cards
// -------------------------------------------------------------------------

function BroadcastXCard({ draft, posted }: { draft: BroadcastDraft; posted: PostedProps }) {
  const [body, setBody] = useState(draft.body);
  const [copied, setCopied] = useState(false);
  const len = body.length;
  const href = buildXIntentLink(body);

  function launch() {
    navigator.clipboard.writeText(body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-panel-border bg-panel/60 p-4">
      <header className="flex items-center justify-between text-xs">
        <span className="font-mono uppercase tracking-wider text-accent">X / Twitter</span>
        <span className={`font-mono ${len > 280 ? "text-red-400" : "text-zinc-500"}`}>
          {len}/280
        </span>
      </header>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        className="w-full resize-y rounded-md border border-panel-border bg-black/40 p-3 text-sm leading-relaxed text-zinc-200 focus:border-accent focus:outline-none"
      />
      {draft.references_thread_title && (
        <p className="text-[11px] text-zinc-500">
          References:{" "}
          <a
            href={draft.references_thread_url}
            target="_blank"
            rel="noreferrer"
            className="text-accent/80 hover:text-accent"
          >
            {draft.references_thread_title.slice(0, 80)}
            {draft.references_thread_title.length > 80 && "…"}
          </a>
        </p>
      )}
      <button
        onClick={launch}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent/90"
      >
        {copied ? "Copied — opening X…" : "Launch on X"} →
      </button>
      <PostedRow posted={posted} />
    </div>
  );
}

function BroadcastLinkedInCard({ draft, posted }: { draft: BroadcastDraft; posted: PostedProps }) {
  const [body, setBody] = useState(draft.body);
  const [copied, setCopied] = useState(false);

  function launch() {
    navigator.clipboard.writeText(body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    window.open(
      buildLinkedInShareLink(draft.references_thread_url),
      "_blank",
      "noopener,noreferrer"
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-panel-border bg-panel/60 p-4">
      <header className="text-xs font-mono uppercase tracking-wider text-accent">
        LinkedIn
      </header>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={9}
        className="w-full resize-y rounded-md border border-panel-border bg-black/40 p-3 text-sm leading-relaxed text-zinc-200 focus:border-accent focus:outline-none"
      />
      {draft.references_thread_title && (
        <p className="text-[11px] text-zinc-500">
          References:{" "}
          <a
            href={draft.references_thread_url}
            target="_blank"
            rel="noreferrer"
            className="text-accent/80 hover:text-accent"
          >
            {draft.references_thread_title.slice(0, 80)}
            {draft.references_thread_title.length > 80 && "…"}
          </a>
        </p>
      )}
      <button
        onClick={launch}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent/90"
      >
        {copied ? "Copied — opening LinkedIn…" : "Copy + open LinkedIn"} →
      </button>
      <p className="text-[11px] text-zinc-500">
        LinkedIn's share page only accepts a URL, so your post body is copied to your clipboard. Paste it in the compose window.
      </p>
      <PostedRow posted={posted} />
    </div>
  );
}

function BroadcastPlaceholder({ platform, hint }: { platform: string; hint: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-panel-border bg-panel/30 p-4">
      <header className="text-xs font-mono uppercase tracking-wider text-zinc-600">
        {platform}
      </header>
      <div className="flex-1 rounded-md border border-panel-border bg-black/20 p-3">
        <div className="space-y-2">
          <div className="h-3 w-3/4 animate-pulse rounded bg-zinc-800" />
          <div className="h-3 w-full animate-pulse rounded bg-zinc-800" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-800" />
        </div>
      </div>
      <p className="text-[11px] text-zinc-500">{hint}</p>
    </div>
  );
}

// -------------------------------------------------------------------------
// Image card with state machine
// -------------------------------------------------------------------------

function ImageCard({
  state,
  productDescription,
  onRetry,
}: {
  state: ImageState;
  productDescription: string;
  onRetry: () => void;
}) {
  if (state.state === "idle") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-panel-border bg-panel/30 p-4">
        <header className="text-xs font-mono uppercase tracking-wider text-zinc-600">
          Social card · Nano Banana 2
        </header>
        <div className="flex flex-1 items-center justify-center rounded-md border border-panel-border bg-black/20 p-6">
          <span className="text-xs text-zinc-600">Waiting for the image agent…</span>
        </div>
      </div>
    );
  }

  if (state.state === "running") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-panel-border bg-panel/60 p-4">
        <header className="text-xs font-mono uppercase tracking-wider text-accent">
          Social card · Nano Banana 2
        </header>
        <div className="flex aspect-[1200/630] items-center justify-center rounded-md border border-panel-border bg-gradient-to-br from-black/60 to-zinc-900/60">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
            <span className="text-xs font-mono text-zinc-500">Generating social card…</span>
          </div>
        </div>
      </div>
    );
  }

  if (state.state === "failed") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-red-500/40 bg-red-500/5 p-4">
        <header className="text-xs font-mono uppercase tracking-wider text-red-300">
          Social card · failed
        </header>
        <div className="rounded-md border border-red-500/30 bg-black/40 p-3 text-xs leading-relaxed text-red-300">
          {state.error}
        </div>
        <button
          onClick={onRetry}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-red-400/40 px-3 py-2 text-sm text-red-300 hover:border-red-400 hover:text-red-200"
        >
          Retry image
        </button>
      </div>
    );
  }

  // done
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-panel-border bg-panel/60 p-4">
      <header className="text-xs font-mono uppercase tracking-wider text-accent">
        Social card · Nano Banana 2
      </header>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={state.dataUrl}
        alt={`Social card for ${productDescription}`}
        className="w-full rounded-md border border-panel-border"
      />
      <div className="flex flex-wrap gap-2">
        <a
          href={state.dataUrl}
          download="launchagent-social.png"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent/90"
        >
          Download →
        </a>
        <button
          onClick={onRetry}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-panel-border px-3 py-2 text-sm text-zinc-300 hover:border-accent/60 hover:text-accent"
        >
          Regenerate
        </button>
      </div>
      <p className="text-[11px] text-zinc-500">
        Download and attach to your X / LinkedIn post. Platforms don't accept image uploads via URL.
      </p>
    </div>
  );
}

// -------------------------------------------------------------------------
// Video card — mirrors ImageCard state machine with <video> element
// -------------------------------------------------------------------------

function VideoCard({
  state,
  productDescription,
  onRetry,
}: {
  state: VideoState;
  productDescription: string;
  onRetry: () => void;
}) {
  if (state.state === "idle") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-panel-border bg-panel/30 p-4">
        <header className="text-xs font-mono uppercase tracking-wider text-zinc-600">
          Video · Veo 3 fast
        </header>
        <div className="flex flex-1 items-center justify-center rounded-md border border-panel-border bg-black/20 p-6">
          <span className="text-xs text-zinc-600">Waiting for the video agent…</span>
        </div>
      </div>
    );
  }

  if (state.state === "running") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-panel-border bg-panel/60 p-4">
        <header className="text-xs font-mono uppercase tracking-wider text-accent">
          Video · Veo 3 fast
        </header>
        <div className="flex aspect-video items-center justify-center rounded-md border border-panel-border bg-gradient-to-br from-black/60 to-zinc-900/60">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
            <span className="text-xs font-mono text-zinc-500">
              Generating 8s video… ~30s
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (state.state === "failed") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-red-500/40 bg-red-500/5 p-4">
        <header className="text-xs font-mono uppercase tracking-wider text-red-300">
          Video · failed
        </header>
        <div className="rounded-md border border-red-500/30 bg-black/40 p-3 text-xs leading-relaxed text-red-300">
          {state.error}
        </div>
        <button
          onClick={onRetry}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-red-400/40 px-3 py-2 text-sm text-red-300 hover:border-red-400 hover:text-red-200"
        >
          Retry video
        </button>
      </div>
    );
  }

  // done
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-panel-border bg-panel/60 p-4">
      <header className="text-xs font-mono uppercase tracking-wider text-accent">
        Video · Veo 3 fast
      </header>
      <video
        src={state.dataUrl}
        controls
        loop
        muted
        playsInline
        autoPlay
        className="w-full rounded-md border border-panel-border bg-black"
      >
        <track kind="captions" />
      </video>
      <div className="flex flex-wrap gap-2">
        <a
          href={state.dataUrl}
          download="launchagent-broadcast.mp4"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent/90"
        >
          Download MP4 →
        </a>
        <button
          onClick={onRetry}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-panel-border px-3 py-2 text-sm text-zinc-300 hover:border-accent/60 hover:text-accent"
        >
          Regenerate
        </button>
      </div>
      <p className="text-[11px] leading-snug text-zinc-500">
        8-second muted loop sized for X / LinkedIn. Download and attach to your broadcast post — both platforms boost video posts vs static images.
        <span className="hidden">Generated for: {productDescription}</span>
      </p>
    </div>
  );
}
