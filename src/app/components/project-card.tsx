import { FolderOpen, Clock } from "lucide-react";

interface ProjectCardProps {
  name: string;
  lastUsed: string;
  traceCount: number;
}

export function ProjectCard({ name, lastUsed, traceCount }: ProjectCardProps) {
  return (
    <div className="p-4 bg-card border border-border rounded-lg hover:border-[var(--color-electric-blue)] transition-colors cursor-pointer">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[var(--color-electric-blue)]/10 rounded">
            <FolderOpen className="w-5 h-5 text-[var(--color-electric-blue)]" />
          </div>
          <div>
            <h3 className="text-foreground">{name}</h3>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {lastUsed}
            </div>
          </div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        {traceCount} traces collected
      </div>
    </div>
  );
}
