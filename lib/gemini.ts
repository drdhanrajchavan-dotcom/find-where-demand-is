// Thin wrapper around the Gemini API endpoints used by LaunchAgent.
// Verified working against gemini-3.5-flash GA (May 20, 2026) and the Managed
// Agents Interactions API (antigravity-preview-05-2026, Api-Revision 2026-05-20).

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
}

/**
 * Managed Agents / Interactions API — Path A discovery agents.
 * Each call spins up an isolated Linux sandbox with Python + bash + web access.
 * Returns the agent's final text output (last `model_output` step).
 */
export async function interaction(input: string, opts?: {
  agent?: string;
  signal?: AbortSignal;
  previousInteractionId?: string;
}): Promise<{ text: string; usage: { totalTokens: number }; interactionId: string }> {
  const body: Record<string, unknown> = {
    agent: opts?.agent ?? "antigravity-preview-05-2026",
    input,
    environment: "remote",
  };
  if (opts?.previousInteractionId) body.previous_interaction_id = opts.previousInteractionId;

  const res = await fetch(`${API_BASE}/interactions`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey(),
      "Api-Revision": "2026-05-20",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: opts?.signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`interactions API ${res.status}: ${errText.slice(0, 400)}`);
  }

  const data = await res.json();
  const modelOutputs = (data.steps ?? []).filter(
    (s: { type: string }) => s.type === "model_output"
  );
  const last = modelOutputs[modelOutputs.length - 1];
  const text: string = last?.content?.[0]?.text ?? "";
  return {
    text,
    usage: { totalTokens: data?.usage?.total_tokens ?? 0 },
    interactionId: data?.id ?? "",
  };
}

/**
 * Direct generateContent — used for aggregator, strategy, content agents,
 * and as the Path B fallback for discovery agents.
 */
export async function generateContent(opts: {
  model?: string;
  prompt: string;
  json?: boolean;
  responseSchema?: object;
  signal?: AbortSignal;
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
  tools?: Array<Record<string, unknown>>;
}): Promise<{ text: string; usage: { totalTokens: number } }> {
  const model = opts.model ?? "gemini-3.5-flash";
  const generationConfig: Record<string, unknown> = {};
  // responseMimeType and grounded tools conflict — when tools are in play we
  // rely on extractJson to recover JSON from prose.
  if (opts.json && !opts.tools) generationConfig.responseMimeType = "application/json";
  if (opts.responseSchema && !opts.tools) generationConfig.responseSchema = opts.responseSchema;
  if (opts.thinkingLevel) {
    generationConfig.thinkingConfig = { thinkingLevel: opts.thinkingLevel };
  }

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: opts.prompt }] }],
  };
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
  }

  const res = await fetch(`${API_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`generateContent ${res.status}: ${errText.slice(0, 400)}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p: { text?: string }) => p.text ?? "").join("");
  return { text, usage: { totalTokens: data?.usageMetadata?.totalTokenCount ?? 0 } };
}

/**
 * Video generation via Veo 3 (fast variant). Long-running operation:
 * POST → operation name → poll until done → download MP4 → base64 data URL.
 *
 * Notes verified against the live API (May 2026):
 * - `durationSeconds` on veo-3.0-fast-generate-001 only accepts 8 in practice
 *   despite the docs claiming 4-8. Default is 8.
 * - `personGeneration: "dont_allow"` is rejected — omit the field.
 * - The video URI returns 302; must follow redirects to download the MP4.
 */
export async function generateVideo(
  prompt: string,
  opts?: { signal?: AbortSignal; model?: string }
): Promise<string> {
  const model = opts?.model ?? "veo-3.0-fast-generate-001";
  const key = apiKey();
  const startRes = await fetch(
    `${API_BASE}/models/${model}:predictLongRunning?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: opts?.signal,
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { aspectRatio: "16:9", durationSeconds: 8, sampleCount: 1 },
      }),
    }
  );
  if (!startRes.ok) {
    const errText = await startRes.text().catch(() => "");
    throw new Error(`Veo start ${startRes.status}: ${errText.slice(0, 400)}`);
  }
  const startData = await startRes.json();
  const opName: string | undefined = startData?.name;
  if (!opName) {
    throw new Error(`Veo start missing operation name: ${JSON.stringify(startData).slice(0, 300)}`);
  }

  // Poll. Veo fast typically completes in ~15-30s; allow up to 180s.
  const POLL_INTERVAL_MS = 4000;
  const POLL_TIMEOUT_MS = 180_000;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let videoUri: string | null = null;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    if (opts?.signal?.aborted) throw new Error("aborted");
    const pollRes = await fetch(
      `${API_BASE}/${opName}?key=${key}`,
      { signal: opts?.signal }
    );
    if (!pollRes.ok) continue; // transient — keep trying
    const pollData = await pollRes.json();
    if (pollData?.done) {
      videoUri =
        pollData?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ?? null;
      if (!videoUri) {
        throw new Error(
          `Veo done but no video URI: ${JSON.stringify(pollData).slice(0, 400)}`
        );
      }
      break;
    }
  }
  if (!videoUri) throw new Error(`Veo timed out after ${POLL_TIMEOUT_MS / 1000}s`);

  // Download the MP4. The URI 302-redirects to a CDN URL; follow.
  const dlUrl = `${videoUri}${videoUri.includes("?") ? "&" : "?"}key=${key}`;
  const dlRes = await fetch(dlUrl, { redirect: "follow", signal: opts?.signal });
  if (!dlRes.ok) {
    throw new Error(`Veo file download ${dlRes.status}`);
  }
  const buf = await dlRes.arrayBuffer();
  return `data:video/mp4;base64,${arrayBufferToBase64(buf)}`;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK))
    );
  }
  return btoa(binary);
}

/**
 * Image generation via gemini-2.5-flash-image (Nano Banana 2).
 * Returns a data URL suitable for <img src=...>.
 */
export async function generateImage(prompt: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${API_BASE}/models/gemini-2.5-flash-image:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`generateImage ${res.status}: ${errText.slice(0, 400)}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData);
  if (!imagePart?.inlineData) {
    throw new Error("No image returned");
  }
  const { mimeType, data: base64 } = imagePart.inlineData as { mimeType: string; data: string };
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Discovery dispatcher: Path A (Managed Agents sandbox) or Path B (Flash direct).
 * The agent prompt is injected via {productDescription} placeholder.
 */
export async function discoveryAgentCall(opts: {
  agentPrompt: string;
  productDescription: string;
  signal?: AbortSignal;
}): Promise<{ text: string; usage: { totalTokens: number } }> {
  const mode = (process.env.DISCOVERY_MODE ?? "sandbox").toLowerCase();
  const filled = opts.agentPrompt.replace("{productDescription}", opts.productDescription);

  if (mode === "direct") {
    return generateContent({ prompt: filled, json: true, signal: opts.signal });
  }
  // Default: sandbox (Path A)
  const result = await interaction(filled, { signal: opts.signal });
  return { text: result.text, usage: result.usage };
}

/**
 * Robust JSON extraction. Agents may wrap JSON in fences (sometimes multiple
 * blocks), add preamble prose, or trail closing notes. Strategy:
 *   1. Try parsing the whole raw string.
 *   2. Try each fenced ```json|``` block, last one first.
 *   3. Find the largest substring starting at the first { or [ that parses.
 */
export function extractJson<T = unknown>(raw: string): T {
  const trimmed = raw.trim();

  // 1. Direct parse.
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // continue
  }

  // 2. Fenced blocks — try last first (agents put the answer last).
  const fences: string[] = [];
  const fenceRegex = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRegex.exec(trimmed)) !== null) {
    const inner = m[1].trim();
    if (inner) fences.push(inner);
  }
  for (let i = fences.length - 1; i >= 0; i--) {
    const tryParsed = tryParseLargest<T>(fences[i]);
    if (tryParsed !== undefined) return tryParsed;
  }

  // 3. Greedy from first { or [ in the raw text.
  const greedy = tryParseLargest<T>(trimmed);
  if (greedy !== undefined) return greedy;

  throw new Error(`Could not parse JSON from: ${raw.slice(0, 300)}`);
}

function tryParseLargest<T>(text: string): T | undefined {
  const firstBrace = text.search(/[{[]/);
  if (firstBrace < 0) return undefined;
  const start = text.slice(firstBrace);

  // Walk forward finding balanced closers, then try parsing at each.
  const openChar = start[0];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < start.length; i++) {
    const ch = start[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(start.slice(0, i + 1)) as T;
        } catch {
          // not balanced JSON at this point, keep scanning
        }
      }
    }
  }
  return undefined;
}
