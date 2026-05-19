import { X, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

interface SensitiveDataModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SensitiveDataModal({ isOpen, onClose }: SensitiveDataModalProps) {
  const [patterns, setPatterns] = useState([
    { id: 1, pattern: "password", enabled: true },
    { id: 2, pattern: "token", enabled: true },
    { id: 3, pattern: "api[_-]?key", enabled: true },
  ]);

  const [newPattern, setNewPattern] = useState("");

  const addPattern = () => {
    if (newPattern.trim()) {
      setPatterns([...patterns, { id: Date.now(), pattern: newPattern, enabled: true }]);
      setNewPattern("");
    }
  };

  const removePattern = (id: number) => {
    setPatterns(patterns.filter((p) => p.id !== id));
  };

  const togglePattern = (id: number) => {
    setPatterns(
      patterns.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-foreground">Sensitive Data Masking</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-accent rounded transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4">
          <p className="text-sm text-muted-foreground mb-4">
            Define patterns to automatically mask sensitive data in traces
          </p>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addPattern()}
              placeholder="e.g., email, credit_card"
              className="flex-1 px-3 py-2 bg-[var(--color-code-bg)] border border-border rounded text-sm focus:outline-none focus:border-[var(--color-electric-blue)]"
            />
            <button
              onClick={addPattern}
              className="px-4 py-2 bg-[var(--color-electric-blue)] text-white rounded hover:bg-[var(--color-electric-blue)]/80 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {patterns.map((pattern) => (
              <div
                key={pattern.id}
                className="flex items-center gap-3 p-3 bg-[var(--color-navy-dark)] border border-border rounded"
              >
                <button
                  onClick={() => togglePattern(pattern.id)}
                  className="p-1 hover:bg-accent rounded transition-colors"
                >
                  {pattern.enabled ? (
                    <Eye className="w-4 h-4 text-[var(--color-success)]" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
                <code className="flex-1 text-sm font-mono text-foreground">
                  {pattern.pattern}
                </code>
                <button
                  onClick={() => removePattern(pattern.id)}
                  className="p-1 hover:bg-[var(--color-error)]/10 rounded transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-[var(--color-error)]" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-[var(--color-electric-blue)] text-white hover:bg-[var(--color-electric-blue)]/80 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
