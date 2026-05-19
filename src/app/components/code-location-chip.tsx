import { FileCode, ExternalLink } from "lucide-react";

interface CodeLocationChipProps {
  file: string;
  line?: number;
  column?: number;
}

export function CodeLocationChip({ file, line, column }: CodeLocationChipProps) {
  const location = line ? `${file}:${line}${column ? `:${column}` : ""}` : file;

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-[var(--color-code-bg)] border border-border rounded text-xs text-muted-foreground hover:border-[var(--color-electric-blue)] hover:text-[var(--color-electric-blue)] transition-colors cursor-pointer group">
      <FileCode className="w-3 h-3" />
      <span className="font-mono">{location}</span>
      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
