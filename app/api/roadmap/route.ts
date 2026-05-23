import { generateContent, extractJson } from "../../../lib/gemini";
import { ROADMAP_PROMPT } from "../../../lib/prompts";
import type { DemandMap, RoadmapDoc } from "../../../lib/types";

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
    const prompt = ROADMAP_PROMPT.replace("{productDescription}", productDescription).replace(
      "{demandMap}",
      JSON.stringify(demandMap)
    );
    const res = await generateContent({
      prompt,
      json: true,
      thinkingLevel: "high",
    });
    const doc = extractJson<RoadmapDoc>(res.text);
    if (!doc.features || !Array.isArray(doc.features)) {
      throw new Error("response missing features array");
    }
    return Response.json(doc);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
