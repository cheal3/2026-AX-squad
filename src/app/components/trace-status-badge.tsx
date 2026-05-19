import { Circle } from "lucide-react";

interface TraceStatusBadgeProps {
  status: "idle" | "recording" | "completed" | "error" | "analyzing";
}

export function TraceStatusBadge({ status }: TraceStatusBadgeProps) {
  const config = {
    idle: {
      color: "text-muted-foreground",
      bg: "bg-muted/20",
      border: "border-border",
      label: "Ready",
      pulse: false,
    },
    recording: {
      color: "text-[var(--color-error)]",
      bg: "bg-[var(--color-error)]/20",
      border: "border-[var(--color-error)]/30",
      label: "Recording",
      pulse: true,
    },
    completed: {
      color: "text-[var(--color-success)]",
      bg: "bg-[var(--color-success)]/20",
      border: "border-[var(--color-success)]/30",
      label: "Completed",
      pulse: false,
    },
    error: {
      color: "text-[var(--color-error)]",
      bg: "bg-[var(--color-error)]/20",
      border: "border-[var(--color-error)]/30",
      label: "Error",
      pulse: false,
    },
    analyzing: {
      color: "text-[var(--color-electric-blue)]",
      bg: "bg-[var(--color-electric-blue)]/20",
      border: "border-[var(--color-electric-blue)]/30",
      label: "AI Analyzing",
      pulse: true,
    },
  };

  const { color, bg, border, label, pulse } = config[status];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border ${bg} ${border} ${color}`}>
      <Circle className={`w-2 h-2 fill-current ${pulse ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}
