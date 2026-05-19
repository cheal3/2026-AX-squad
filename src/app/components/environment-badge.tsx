interface EnvironmentBadgeProps {
  environment: "development" | "staging" | "production";
}

export function EnvironmentBadge({ environment }: EnvironmentBadgeProps) {
  const colors = {
    development: "bg-[var(--color-info)]/20 text-[var(--color-info)] border-[var(--color-info)]/30",
    staging: "bg-[var(--color-warning)]/20 text-[var(--color-warning)] border-[var(--color-warning)]/30",
    production: "bg-[var(--color-error)]/20 text-[var(--color-error)] border-[var(--color-error)]/30",
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${colors[environment]}`}>
      {environment}
    </span>
  );
}
