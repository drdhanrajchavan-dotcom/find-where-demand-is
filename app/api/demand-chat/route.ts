import { generateContent, extractJson } from "../../../lib/gemini";
import { DEMAND_CHAT_PROMPT } from "../../../lib/prompts";
import type { ChatMessage, DemandMap } from "../../../lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let productDescription = "";
  let demandMap: DemandMap | null = null;
  let messages: ChatMessage[] = [];
  try {
    const body = await request.json();
    productDescription = (body?.productDescription ?? "").toString().trim();
    demandMap = body?.demandMap ?? null;
    if (Array.isArray(body?.messages)) {
      messages = (body.messages as unknown[])
        .map((m) => {
          if (
            m &&
            typeof m === "object" &&
            ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant") &&
            typeof (m as ChatMessage).content === "string"
          ) {
            return m as ChatMessage;
          }
          return null;
        })
        .filter((m): m is ChatMessage => m !== null);
    }
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!productDescription || !demandMap || messages.length === 0) {
    return Response.json(
      { error: "productDescription, demandMap, and at least one message are required" },
      { status: 400 }
    );
  }

  const formatted = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  try {
    const prompt = DEMAND_CHAT_PROMPT.replace("{productDescription}", productDescription)
      .replace("{demandMap}", JSON.stringify(demandMap))
      .replace("{messages}", formatted);
    const res = await generateContent({
      prompt,
      json: true,
      thinkingLevel: "high",
    });
    const parsed = extractJson<{ reply: string }>(res.text);
    if (!parsed.reply || typeof parsed.reply !== "string") {
      throw new Error("reply missing from model output");
    }
    return Response.json({ reply: parsed.reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
