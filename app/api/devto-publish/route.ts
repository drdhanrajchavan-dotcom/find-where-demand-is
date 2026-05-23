import { publishDevtoArticle } from "../../../lib/deeplinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!process.env.DEVTO_API_KEY) {
    return Response.json(
      { error: "DEVTO_API_KEY is not set. Set it in .env.local to enable real publishing." },
      { status: 503 }
    );
  }
  try {
    const body = await request.json();
    const title = String(body?.title ?? "").trim();
    const articleBody = String(body?.body ?? "").trim();
    if (!title || !articleBody) {
      return Response.json({ error: "title and body are required" }, { status: 400 });
    }
    const result = await publishDevtoArticle({
      title,
      bodyMarkdown: articleBody,
      published: true,
    });
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
