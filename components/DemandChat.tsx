"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, DemandMap } from "../lib/types";

interface Props {
  productDescription: string;
  demandMap: DemandMap | null;
}

const SUGGESTED_QUESTIONS = [
  "Which threads mention pricing or cost?",
  "What's the most-cited pain point across all platforms?",
  "Summarize what r/python users care about vs r/javascript users",
  "Which threads are from the last 30 days?",
];

export function DemandChat({ productDescription, demandMap }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  if (!demandMap || demandMap.top_threads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-panel-border p-10 text-center">
        <h2 className="text-sm font-semibold text-zinc-200">Demand-map chat</h2>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-zinc-500">
          Run a discovery first. Then ask natural-language questions about what you found —
          every answer is grounded in the actual threads.
        </p>
      </div>
    );
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/demand-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productDescription,
          demandMap,
          messages: nextMessages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
  }

  return (
    <div className="flex h-[70vh] flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
          Demand-map chat
        </h2>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="text-xs font-mono text-zinc-500 hover:text-red-400"
          >
            Clear chat
          </button>
        )}
      </header>
      <div className="flex-1 overflow-y-auto rounded-lg border border-panel-border bg-panel/30 p-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="text-sm text-zinc-400">
              Ask anything about the {demandMap.top_threads.length}-thread demand map.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="rounded-full border border-panel-border px-3 py-1 text-xs text-zinc-400 hover:border-accent/40 hover:text-accent"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
              thinking…
            </div>
          )}
          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-300">
              {error}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the demand map…"
          disabled={loading}
          className="flex-1 rounded-md border border-panel-border bg-panel/40 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:border-accent focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-black hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send →
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={[
          "max-w-[80%] rounded-lg border p-3 text-sm leading-relaxed",
          isUser
            ? "border-accent/40 bg-accent/10 text-zinc-100"
            : "border-panel-border bg-panel/60 text-zinc-200",
        ].join(" ")}
      >
        <div className="mb-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          {isUser ? "you" : "assistant"}
        </div>
        <div className="whitespace-pre-wrap">{message.content}</div>
      </div>
    </div>
  );
}
