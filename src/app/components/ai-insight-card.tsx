import { Sparkles, Lightbulb, AlertTriangle, Code } from "lucide-react";

interface AIInsightCardProps {
  type: "analysis" | "suggestion" | "warning" | "fix";
  title: string;
  content: string;
  codeSnippet?: string;
}

export function AIInsightCard({ type, title, content, codeSnippet }: AIInsightCardProps) {
  const config = {
    analysis: {
      icon: Sparkles,
      color: "text-[var(--color-electric-blue)]",
      bg: "bg-[var(--color-electric-blue)]/10",
      border: "border-[var(--color-electric-blue)]/30",
    },
    suggestion: {
      icon: Lightbulb,
      color: "text-[var(--color-warning)]",
      bg: "bg-[var(--color-warning)]/10",
      border: "border-[var(--color-warning)]/30",
    },
    warning: {
      icon: AlertTriangle,
      color: "text-[var(--color-error)]",
      bg: "bg-[var(--color-error)]/10",
      border: "border-[var(--color-error)]/30",
    },
    fix: {
      icon: Code,
      color: "text-[var(--color-success)]",
      bg: "bg-[var(--color-success)]/10",
      border: "border-[var(--color-success)]/30",
    },
  };

  const { icon: Icon, color, bg, border } = config[type];

  return (
    <div className={`border rounded-lg ${border} ${bg}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded ${bg}`}>
            <Icon className={`w-4 h-4 ${color}`} />
          </div>
          <div className="flex-1">
            <h4 className={`${color} mb-2`}>{title}</h4>
            <p className="text-sm text-foreground">{content}</p>

            {codeSnippet && (
              <pre className="mt-3 p-3 bg-[var(--color-code-bg)] border border-border rounded text-xs text-foreground overflow-x-auto">
                {codeSnippet}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
