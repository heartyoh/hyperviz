import { h } from "preact";

interface EmptyStateProps {
  message: string;
  icon?: string;
}

export function EmptyState({ message, icon = "🔍" }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <p>{message}</p>
    </div>
  );
}
