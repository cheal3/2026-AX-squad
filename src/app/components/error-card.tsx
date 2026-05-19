import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { CodeLocationChip } from "./code-location-chip";

interface ErrorCardProps {
  message: string;
  type: string;
  file: string;
  line: number;
  column?: number;
  stackTrace?: string;
}

export function ErrorCard({ message, type, file, line, column, stackTrace }: ErrorCardProps) {
  const [showStack, setShowStack] = useState(false);

  return (
    <div className="border border-[var(--color-error)]/50 bg-[var(--color-error)]/5 rounded-lg overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[var(--color-error)] flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-[var(--color-error)]">{type}</span>
              <CodeLocationChip file={file} line={line} column={column} />
            </div>
            <p className="text-sm text-foreground break-words">{message}</p>
          </div>
        </div>

        {stackTrace && (
          <div className="mt-3">
            <button
              onClick={() => setShowStack(!showStack)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showStack ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Stack Trace
            </button>
            {showStack && (
              <pre className="mt-2 p-3 bg-[var(--color-code-bg)] border border-border rounded text-xs text-foreground overflow-x-auto">
                {stackTrace}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
