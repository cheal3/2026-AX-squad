import { Circle, Code, Globe, AlertTriangle, Monitor, MousePointer } from "lucide-react";

interface TimelineItemProps {
  type: "action" | "function" | "api" | "error" | "page";
  title: string;
  timestamp: string;
  details?: string;
  status?: "success" | "error";
}

export function TimelineItem({ type, title, timestamp, details, status = "success" }: TimelineItemProps) {
  const icons = {
    action: MousePointer,
    function: Code,
    api: Globe,
    error: AlertTriangle,
    page: Monitor,
  };

  const Icon = icons[type] || Circle;

  const statusColor =
    status === "error" ? "text-[var(--color-error)]" : "text-[var(--color-success)]";

  return (
    <div className="flex gap-3 group">
      <div className="flex flex-col items-center">
        <div
          className={`p-1.5 rounded-full border ${
            status === "error"
              ? "bg-[var(--color-error)]/10 border-[var(--color-error)]"
              : "bg-[var(--color-electric-blue)]/10 border-[var(--color-electric-blue)]"
          }`}
        >
          <Icon
            className={`w-3 h-3 ${
              status === "error" ? "text-[var(--color-error)]" : "text-[var(--color-electric-blue)]"
            }`}
          />
        </div>
        <div className="w-px flex-1 bg-border group-last:bg-transparent mt-2" />
      </div>

      <div className="flex-1 pb-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground">{title}</span>
              <Circle className={`w-1.5 h-1.5 ${statusColor} fill-current`} />
            </div>
            {details && <div className="text-xs text-muted-foreground mt-1">{details}</div>}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">{timestamp}</span>
        </div>
      </div>
    </div>
  );
}
