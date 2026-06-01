import type { Signal } from "~/server/api/routers/ge";

const SIGNAL_CONFIG: Record<
  Signal,
  { label: string; classes: string }
> = {
  SURGING: {
    label: "Surging",
    classes: "bg-green-900/60 text-green-300 border border-green-700",
  },
  CRASHING: {
    label: "Crashing",
    classes: "bg-red-900/60 text-red-300 border border-red-700",
  },
  HIGH_MARGIN: {
    label: "High Margin",
    classes: "bg-amber-900/60 text-amber-300 border border-amber-700",
  },
  VOLUME_SPIKE: {
    label: "Vol. Spike",
    classes: "bg-blue-900/60 text-blue-300 border border-blue-700",
  },
  STABLE: {
    label: "Stable",
    classes: "bg-stone-800/60 text-stone-400 border border-stone-600",
  },
};

export function SignalBadge({ signal }: { signal: Signal }) {
  const config = SIGNAL_CONFIG[signal];
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${config.classes}`}
    >
      {config.label}
    </span>
  );
}
