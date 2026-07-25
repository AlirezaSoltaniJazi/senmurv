import type { PageMode } from '@/shared/types';

/** The sub-tools of the Tools tab. */
export type ToolKey = 'bypass' | 'sitedata' | 'measure' | 'color' | 'taborder' | 'a11y' | 'font';

/**
 * One entry in the Tools launcher. `mode` is the in-page mode the shell tears
 * down when the tool unmounts — null for tools that never enter one (Bypass
 * mutates and leaves; Site data runs entirely in the service worker).
 */
export interface ToolDescriptor {
  readonly key: ToolKey;
  readonly label: string;
  /** Standing hint shown under the title. States the tool's real limits. */
  readonly blurb: string;
  readonly mode: PageMode | null;
  /** True when the tool needs a reachable page (blocks on chrome://, Web Store, …). */
  readonly requiresPage: boolean;
  /** False until the tool's own phase lands; the shell renders a placeholder. */
  readonly isReady: boolean;
}

/**
 * Launcher order is QA reach-frequency, not the order the tools were designed.
 * Every blurb names the tool's honest limit — these are the strings a user
 * reads before trusting a number, so they belong here, not in a doc.
 */
export const TOOLS: readonly ToolDescriptor[] = [
  {
    key: 'bypass',
    label: 'Bypass',
    blurb:
      'Strips client-side locks so you can drive a disabled or hidden form. The server can still reject the submit, and on a model-driven form it affects the view, not the model.',
    mode: null,
    requiresPage: true,
    isReady: true,
  },
  {
    key: 'sitedata',
    label: 'Site data',
    blurb:
      "Clears this origin's storage. Chrome does not expose HTTP cache size or let extensions clear it per-origin — use Clear + hard reload for that.",
    mode: null,
    requiresPage: true,
    isReady: true,
  },
  {
    key: 'measure',
    label: 'Measure',
    blurb:
      'Drag a region, or hover an element for its box model. Numbers are CSS px in the top frame; page zoom changes them.',
    mode: 'measure',
    requiresPage: true,
    isReady: true,
  },
  {
    key: 'color',
    label: 'Colour',
    blurb:
      'Reads an element’s colours in every format plus its WCAG contrast. Background images, gradients and ::before overlays are invisible to the ancestor walk and are flagged, not guessed.',
    mode: 'color',
    requiresPage: true,
    isReady: true,
  },
  {
    key: 'taborder',
    label: 'Tab order',
    blurb:
      'Computed from the DOM — top frame only. Closed shadow roots, cross-origin frames, roving tabindex and JS focus managers are not visible.',
    mode: 'taborder',
    requiresPage: true,
    isReady: false,
  },
  {
    key: 'a11y',
    label: 'Accessibility',
    blurb:
      'WCAG A / AA / AAA checks. Automated testing catches roughly 30–40% of accessibility issues, and AAA coverage is thin by nature — this never replaces a manual audit.',
    mode: null,
    requiresPage: true,
    isReady: false,
  },
  {
    key: 'font',
    label: 'Fonts',
    blurb:
      'Typography of the hovered element. Resolves the rendered face where it can and says so when it cannot.',
    mode: 'font',
    requiresPage: true,
    isReady: false,
  },
];

/** Look up a descriptor by key; falls back to the first tool for an unknown key. */
export function findTool(key: ToolKey): ToolDescriptor {
  // TOOLS is a non-empty literal, but noUncheckedIndexedAccess cannot see that.
  const first = TOOLS[0] as ToolDescriptor;
  return TOOLS.find((t) => t.key === key) ?? first;
}
