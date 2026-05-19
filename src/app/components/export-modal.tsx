import { X, Download, FileJson, FileText } from "lucide-react";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  if (!isOpen) return null;

  const exportOptions = [
    {
      icon: FileJson,
      title: "JSON Format",
      description: "Export trace data as JSON file",
      format: "json",
    },
    {
      icon: FileText,
      title: "Markdown Report",
      description: "Export analysis as Markdown document",
      format: "md",
    },
    {
      icon: FileText,
      title: "HTML Report",
      description: "Export interactive HTML report",
      format: "html",
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-foreground">Export Trace Data</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-accent rounded transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-2">
          {exportOptions.map((option) => (
            <button
              key={option.format}
              className="w-full flex items-start gap-3 p-3 bg-[var(--color-navy-dark)] hover:bg-[var(--color-electric-blue)]/10 border border-border hover:border-[var(--color-electric-blue)] rounded-lg transition-colors text-left"
            >
              <div className="p-2 bg-[var(--color-electric-blue)]/10 rounded">
                <option.icon className="w-4 h-4 text-[var(--color-electric-blue)]" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-foreground">{option.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {option.description}
                </div>
              </div>
              <Download className="w-4 h-4 text-muted-foreground mt-2" />
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
