/**
 * Neko mark - the product logo (512x512): a cat face inside a console window.
 * Inlined so it costs no extra request and can be sized by the caller. The
 * source file's <title id>/<desc id> pair is dropped on purpose: the badge is
 * decorative (aria-hidden) and those ids would otherwise repeat when the mark is
 * rendered several times on one screen.
 */
export function NekoMark({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="512" height="512" rx="112" fill="#0f172a" />
      <rect x="64" y="64" width="384" height="384" rx="72" fill="#ffffff" />
      <path d="M64 136h384" fill="none" stroke="#dbeafe" strokeWidth="16" />
      <circle cx="112" cy="100" r="10" fill="#38bdf8" />
      <circle cx="144" cy="100" r="10" fill="#7dd3fc" />
      <circle cx="176" cy="100" r="10" fill="#bae6fd" />
      <path
        d="M152 280V204l58 48c16-8 31-12 46-12s30 4 46 12l58-48v76c0 75-46 124-104 124s-104-49-104-124Z"
        fill="#38bdf8"
      />
      <path
        d="M152 204v76c0 75 46 124 104 124s104-49 104-124v-76l-58 48c-16-8-31-12-46-12s-30 4-46 12l-58-48Z"
        fill="none"
        stroke="#0f172a"
        strokeWidth="16"
        strokeLinejoin="round"
      />
      <path d="M204 316c10 13 25 20 52 20s42-7 52-20" fill="none" stroke="#0f172a" strokeWidth="14" strokeLinecap="round" />
      <circle cx="218" cy="294" r="12" fill="#0f172a" />
      <circle cx="294" cy="294" r="12" fill="#0f172a" />
      <path d="M256 307v12" fill="none" stroke="#0f172a" strokeWidth="10" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Resolve any CSS colour (hex / oklch / rgb / named) into an "r, g, b" triplet
 * by letting the engine compute it for us.
 */
export function resolveRgb(value: string): string | null {
  try {
    const probe = document.createElement('span');
    probe.style.position = 'absolute';
    probe.style.opacity = '0';
    probe.style.color = value;
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    const match = computed.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    return match[1]
      .split(',')
      .map((part) => part.trim())
      .slice(0, 3)
      .join(', ');
    } catch {
    return null;
  }
}

/**
 * Publish rgba() derivatives of the accent colour as CSS variables.
 *
 * Needed because Tailwind's `bg-primary/10` style utilities compile down to
 * colour-mix(), which several in-app WebViews do not support — with these
 * variables every surface (chips, dots, charts, selection) can follow the
 * accent without colour-mix().
 */
export function applyAccentVars(root: HTMLElement, accent: string): void {
  const rgb = resolveRgb(accent);
  if (!rgb) return;
  root.style.setProperty('--primary-soft', 'rgba(' + rgb + ', 0.12)');
  root.style.setProperty('--primary-faint', 'rgba(' + rgb + ', 0.07)');
  root.style.setProperty('--primary-line', 'rgba(' + rgb + ', 0.34)');
}

export function clearAccentVars(root: HTMLElement): void {
  ['--primary-soft', '--primary-faint', '--primary-line'].forEach((key) => root.style.removeProperty(key));
}

/**
 * Paint the document root with the theme's real background colour.
 *
 * Needed because the root has no background of its own: with a wallpaper on,
 * `body` is transparent, so the host WebView's own default (black on many
 * devices) showed through at the edges / on overscroll — the “light theme but
 * the base plate is still black” symptom.
 *
 * The colour is probed with a real element so it works no matter which CSS
 * variable name the theme system uses, falling back to a sensible default.
 */
export function paintRootBackground(root: HTMLElement, fallback: string): void {
  let color = '';
  try {
    const probe = document.createElement('div');
    probe.className = 'bg-background';
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;';
    document.body.appendChild(probe);
    color = getComputedStyle(probe).backgroundColor;
    probe.remove();
  } catch {
    /* ignore and use the fallback */
  }
  root.style.backgroundColor = !color || color === 'rgba(0, 0, 0, 0)' ? fallback : color;
}
