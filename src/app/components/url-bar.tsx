import { Globe, Play, Square, ArrowRight } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

interface URLBarProps {
  url: string;
  isRecording: boolean;
  onUrlChange: (url: string) => void;
  onToggleRecording: () => void;
}

export function URLBar({ url, isRecording, onUrlChange, onToggleRecording }: URLBarProps) {
  const [draftUrl, setDraftUrl] = useState(url);

  useEffect(() => {
    setDraftUrl(url);
  }, [url]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onUrlChange(draftUrl.trim());
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-3 px-4 py-3 bg-white border-b border-border"
    >
      <Globe className="w-4 h-4 text-muted-foreground" />
      <input
        type="text"
        value={draftUrl}
        onChange={(e) => setDraftUrl(e.target.value)}
        className="flex-1 bg-white px-3 py-1.5 rounded border border-border text-sm text-foreground focus:outline-none focus:border-[var(--color-electric-blue)] focus:ring-2 focus:ring-[var(--color-electric-blue)]/15"
        placeholder="Enter web service URL..."
      />
      <button
        type="submit"
        className="p-1.5 hover:bg-accent rounded transition-colors"
        aria-label="Navigate"
      >
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
      </button>
      <button
        type="button"
        onClick={onToggleRecording}
        className={`flex items-center gap-2 px-4 py-1.5 rounded transition-colors ${
          isRecording
            ? "bg-[var(--color-error)] text-white hover:bg-[var(--color-error)]/80"
            : "bg-[var(--color-electric-blue)] text-white hover:bg-[var(--color-electric-blue)]/80"
        }`}
      >
        {isRecording ? (
          <>
            <Square className="w-3.5 h-3.5 fill-current" />
            Stop
          </>
        ) : (
          <>
            <Play className="w-3.5 h-3.5 fill-current" />
            Start Trace
          </>
        )}
      </button>
    </form>
  );
}
