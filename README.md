# LaunchAgent

**Find where demand is. Launch there.**

LaunchAgent reverses the marketing pipeline. Instead of writing content and chasing audiences, it finds conversations where developers are *already* asking for your product, then drafts a platform-specific reply for each — landing inside an active discussion instead of broadcasting blindly.

Built for the Cerebral Valley × Google I/O Hackathon (May 2026).

## How it works

You give it one sentence about your product. **12 parallel Gemini 3.5 Flash agents** fan out across Reddit, Hacker News, GitHub, Dev.to, and Stack Overflow — five of them running in isolated Antigravity sandboxes via the **Managed Agents API**.

They surface real threads (plus the highest-leverage comment to reply to in each), filter for relevance, and pass the demand map to six reply agents that quote the actual commenter's words. The result is a Launchpad of:

- **6 per-thread replies** with one-click "Open thread + copy reply" — opens the actual Reddit / HN / GitHub comment permalink and puts your reply in your clipboard
- **2 broadcast posts** for X and LinkedIn, referencing the top discovered thread
- **A social card image** (Nano Banana 2)
- **An 8-second product video** (Veo 3 fast)

The same demand map fuels five additional intelligence outputs as tabs: roadmap synthesizer, landing-page copy, SEO content brief, competitor matrix, and natural-language chat against the demand map.

End-to-end in ~75–180 seconds. Runs persist locally in `localStorage`. Set a voice profile (paste 1-3 sample posts you've written) and drafts mirror your voice instead of sounding like AI.

## Stack

- **Next.js 16** (App Router, Edge runtime for all API routes)
- **React 19**, **Tailwind v4**, TypeScript
- **Gemini 3.5 Flash** for all reasoning + content generation (with `thinkingLevel` control)
- **Managed Agents API** (`antigravity-preview-05-2026`) for discovery sandboxes
- **Nano Banana 2** (`gemini-2.5-flash-image`) for the social card
- **Veo 3 fast** (`veo-3.0-fast-generate-001`) for the broadcast video
- Server-sent events to stream every agent's status to the UI as it lands

No database, no auth — all state is in `localStorage` (max 50 runs FIFO). The `lib/storage.ts` backend is interfaced so a future Postgres swap is one file change.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then add your GEMINI_API_KEY
npm run dev
```

Open http://localhost:3000.

## Environment variables

| Variable | Required | What it does |
|---|---|---|
| `GEMINI_API_KEY` | yes | Powers all Flash / image / video calls. Get from [aistudio.google.com](https://aistudio.google.com). |
| `GITHUB_TOKEN` | no | Personal access token (`public_repo` scope). Raises GitHub Issues search from 10/min → 30/min. |
| `DEVTO_API_KEY` | no | Enables the live "Publish to Dev.to" button in the Launchpad. From [dev.to/settings/account](https://dev.to/settings/account). |
| `DISCOVERY_MODE` | no | `sandbox` (default) uses Managed Agents API. `direct` falls back to JS-only API calls. |

## Project layout

```
app/
├── page.tsx                        # main UI shell + state
├── api/
│   ├── discover/route.ts           # SSE orchestrator: 12 agents in 4 phases
│   ├── roadmap/route.ts            # Theme B: roadmap synthesizer
│   ├── landing-copy/route.ts       # Theme B: landing-page copy
│   ├── seo-brief/route.ts          # Theme B: SEO content brief
│   ├── demand-chat/route.ts        # Theme B: Q&A against the demand map
│   ├── regenerate-image/route.ts   # retry endpoint for the social card
│   ├── regenerate-video/route.ts   # retry endpoint for the broadcast video
│   └── devto-publish/route.ts      # one-click Dev.to publish
lib/
├── gemini.ts                       # generateContent / interaction / generateImage / generateVideo
├── prompts.ts                      # all 12 agent prompts + theme-B prompts
├── discovery-direct.ts             # Path B JS-only fetchers per platform
├── url-validator.ts                # HEAD-check thread URLs, drop 404s
├── competitors.ts                  # client-side competitor name extractor
├── source-urls.ts                  # parse Reddit / HN / GitHub / SO / Dev.to URLs
├── deeplinks.ts                    # build platform pre-fill URLs
├── stream.ts                       # SSE helpers
├── storage.ts                      # localStorage-backed run history
└── types.ts                        # shared types
components/
├── AgentRail.tsx                   # left 12-agent status sidebar
├── ProgressStrip.tsx               # 3-phase progress chips
├── DemandMap.tsx                   # discovered threads list (sortable)
├── StrategyView.tsx                # strategy agent output
├── Launchpad.tsx                   # reply cards + broadcast cards + image + video
├── RunHistory.tsx                  # past-runs dropdown
├── VoiceProfile.tsx                # founder-voice sample modal
├── RoadmapView.tsx                 # theme-B output
├── LandingCopyView.tsx             # theme-B output
├── SeoBriefView.tsx                # theme-B output
├── CompetitorMatrix.tsx            # theme-B output
└── DemandChat.tsx                  # theme-B output
```

## Notes on the Google APIs

A few real-world quirks worth knowing if you build on the same stack:

- **Managed Agents API** rate-limits aggressively under parallel use. Five concurrent `Interactions` calls can trip the per-minute quota — we built a Path A → Path B fallback ladder for resilience.
- **Veo 3 fast**: `durationSeconds` only accepts 8 in practice despite docs claiming 4–8; `personGeneration: "dont_allow"` is rejected; the file URI 302-redirects so requires `redirect: "follow"` to download.
- **Nano Banana 2** occasionally duplicates words in rendered text. A "no duplicate words" prompt guardrail fixes it.
- **googleSearch grounding** returns real URLs but the *model can fabricate plausible titles for those URLs*. Server-side verification (re-fetch `reddit.com/<url>.json` for Reddit threads) catches this.

## License

MIT.
