import { generateVideo } from "../../../lib/gemini";
import { VIDEO_PROMPT } from "../../../lib/prompts";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  let productDescription = "";
  try {
    const body = await request.json();
    productDescription = (body?.productDescription ?? "").toString().trim();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!productDescription) {
    return Response.json({ error: "productDescription is required" }, { status: 400 });
  }

  try {
    const prompt = VIDEO_PROMPT.replace("{productDescription}", productDescription);
    const dataUrl = await generateVideo(prompt);
    return Response.json({ dataUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
