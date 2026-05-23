"use client";

export type Phase = "idle" | "discovering" | "synthesizing" | "drafting" | "done";

interface PhaseDef {
  id: Exclude<Phase, "idle">;
  label: string;
}

const PHASES: PhaseDef[] = [
  { id: "discovering", label: "Discovering demand" },
  { id: "synthesizing", label: "Building strategy" },
  { id: "drafting", label: "Drafting launch assets" },
];

function phaseStatus(current: Phase, target: Phase): "idle" | "running" | "done" {
  const order: Phase[] = ["idle", "discovering", "synthesizing", "drafting", "done"];
  const ci = order.indexOf(current);
  const ti = order.indexOf(target);
  if (ci > ti) return "done";
  if (ci === ti) return "running";
  return "idle";
}

export function ProgressStrip({
  phase,
  draftCount,
  draftTotal,
}: {
  phase: Phase;
  draftCount?: number;
  draftTotal?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {PHASES.map((p, idx) => {
        const status = phaseStatus(phase, p.id);
        const showCounter = p.id === "drafting" && (draftCount ?? 0) + (draftTotal ?? 0) > 0;
        return (
          <div key={p.id} className="flex items-center gap-3">
            <div
              className={[
                "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-mono",
                status === "done" && "border-accent text-accent",
                status === "running" && "border-accent text-accent pulse-accent",
                status === "idle" && "border-panel-border text-zinc-500",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="font-semibold">{idx + 1}.</span>
              <span>{p.label}</span>
              {showCounter && (
                <span className="font-mono text-[11px] opacity-80">
                  {draftCount}/{draftTotal}
                </span>
              )}
              {status === "running" && <span className="dots" />}
            </div>
            {idx < PHASES.length - 1 && (
              <span
                className={
                  status === "done" ? "h-px w-6 bg-accent" : "h-px w-6 bg-panel-border"
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
