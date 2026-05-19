import { ChevronRight, AlertCircle, CheckCircle } from "lucide-react";
import { useState } from "react";

interface FlowGraphNodeProps {
  functionName: string;
  parameters?: Record<string, any>;
  returnValue?: any;
  executionTime?: number;
  hasError?: boolean;
  children?: React.ReactNode;
}

export function FlowGraphNode({
  functionName,
  parameters,
  returnValue,
  executionTime,
  hasError,
  children,
}: FlowGraphNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="relative">
      <div
        className={`relative p-3 rounded-lg border cursor-pointer transition-colors ${
          hasError
            ? "bg-[var(--color-error)]/10 border-[var(--color-error)]/50 hover:border-[var(--color-error)]"
            : "bg-card border-border hover:border-[var(--color-electric-blue)]"
        }`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-1">
            <ChevronRight
              className={`w-4 h-4 text-muted-foreground transition-transform ${
                isExpanded ? "rotate-90" : ""
              }`}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-foreground">{functionName}()</span>
                {executionTime && (
                  <span className="text-xs text-muted-foreground">{executionTime}ms</span>
                )}
              </div>
              {parameters && !isExpanded && (
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {Object.keys(parameters).length} parameters
                </div>
              )}
            </div>
          </div>
          {hasError ? (
            <AlertCircle className="w-4 h-4 text-[var(--color-error)] flex-shrink-0" />
          ) : (
            <CheckCircle className="w-4 h-4 text-[var(--color-success)] flex-shrink-0" />
          )}
        </div>

        {isExpanded && (
          <div className="mt-3 space-y-2 pl-6">
            {parameters && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Parameters:</div>
                <pre className="text-xs bg-[var(--color-code-bg)] p-2 rounded border border-border overflow-x-auto">
                  {JSON.stringify(parameters, null, 2)}
                </pre>
              </div>
            )}
            {returnValue && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Return Value:</div>
                <pre className="text-xs bg-[var(--color-code-bg)] p-2 rounded border border-border overflow-x-auto">
                  {JSON.stringify(returnValue, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {children && (
        <div className="ml-8 mt-2 pl-4 border-l-2 border-border space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}
