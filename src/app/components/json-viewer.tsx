import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface JSONViewerProps {
  data: any;
  title?: string;
}

export function JSONViewer({ data, title }: JSONViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {title && (
        <div className="flex items-center justify-between px-3 py-2 bg-muted border-b border-border">
          <span className="text-xs text-foreground">{title}</span>
          <button
            onClick={handleCopy}
            className="p-1 hover:bg-accent rounded transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-[var(--color-success)]" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </button>
        </div>
      )}
      <pre className="p-3 bg-[var(--color-code-bg)] text-xs text-foreground overflow-x-auto max-h-96 overflow-y-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
