import type { ReactNode } from 'react';
import { LayoutDashboard } from 'lucide-react';

/**
 * Empty-state block shared by every page (this used to be copy-pasted into
 * app.tsx, pages.tsx and plugins.tsx).
 */
export function EmptyState({
  icon: Icon = LayoutDashboard,
  title,
  description,
  action,
}: {
  icon?: typeof LayoutDashboard;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-11 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {description ? <p className="text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
