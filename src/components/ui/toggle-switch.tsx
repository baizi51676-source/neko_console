import { cn } from '@/lib/utils';

/**
 * Small, dependency-free switch used across the console.
 *
 * Implemented as a native button with role="switch" so there is no third-party
 * UI dependency and no licensing question: keyboard and screen-reader support
 * come from the standard ARIA semantics.
 */
export function ToggleSwitch({
  value,
  onChange,
  ariaLabel,
  disabled,
  className,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent',
        'transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
        'disabled:cursor-not-allowed disabled:opacity-50',
        value ? 'bg-primary' : 'bg-muted-foreground/35',
        className,
      )}
    >
      <span
        className={cn(
          'pointer-events-none block size-4 rounded-full bg-white shadow-sm transition-transform',
          value ? 'translate-x-[18px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}

export default ToggleSwitch;