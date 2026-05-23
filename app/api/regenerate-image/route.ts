import { generateImage } from "../../../lib/gemini";
import { IMAGE_PROMPT } from "../../../lib/prompts";

export const runtime = "edge";
export const dynamic = "force-dynamic";

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
    const prompt = IMAGE_PROMPT.replace("{productDescription}", productDescription);
    const dataUrl = await generateImage(prompt);
    return Response.json({ dataUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
