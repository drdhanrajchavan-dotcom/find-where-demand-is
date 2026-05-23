import { generateContent, extractJson } from "../../../lib/gemini";
import { SEO_BRIEF_PROMPT } from "../../../lib/prompts";
import type { DemandMap, SeoBriefDoc } from "../../../lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let productDescription = "";
  let demandMap: DemandMap | null = null;
  try {
    const body = await request.json();
    productDescription = (body?.productDescription ?? "").toString().trim();
    demandMap = body?.demandMap ?? null;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!productDescription) {
    return Response.json({ error: "productDescription is required" }, { status: 400 });
  }
  if (!demandMap || !Array.isArray(demandMap.top_threads) || demandMap.top_threads.length === 0) {
    return Response.json(
      { error: "demandMap with top_threads is required" },
      { status: 400 }
    );
  }

  try {
    const prompt = SEO_BRIEF_PROMPT.replace(
      "{productDescription}",
      productDescription
    ).replace("{demandMap}", JSON.stringify(demandMap));
    const res = await generateContent({
      prompt,
      json: true,
      thinkingLevel: "high",
    });
    const doc = extractJson<SeoBriefDoc>(res.text);
    if (!doc.target_keyword || !Array.isArray(doc.outline)) {
      throw new Error("response missing required fields");
    }
    return Response.json(doc);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
