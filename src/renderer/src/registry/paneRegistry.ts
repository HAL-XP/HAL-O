/**
 * paneRegistry.ts -- Central pane type registry for HAL-O dockview system.
 *
 * Every pane type (scene, terminal, settings, stats, debate, etc.) is registered
 * here with metadata + component reference.  DockLayout reads this registry to
 * build the `components` map that dockview needs.
 *
 * This is the single source of truth for "what panes exist" -- adding a new pane
 * type means adding one entry here + creating the component.  Nothing else.
 */

import type { FunctionComponent } from 'react'
import type { IDockviewPanelProps } from 'dockview'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Dockview renderer policy: 'always' keeps DOM alive, 'onVisible' mounts/unmounts */
export type PaneRenderer = 'always' | 'onVisible'

/** Position hint for default layout generation */
export interface PaneDefaultPosition {
  /** Reference panel id to dock relative to */
  referencePanel?: string
  /** Direction relative to reference: 'left' | 'right' | 'above' | 'below' | 'within' */
  direction?: 'left' | 'right' | 'above' | 'below' | 'within'
  /** Initial width in pixels (only for horizontal splits) */
  initialWidth?: number
  /** Initial height in pixels (only for vertical splits) */
  initialHeight?: number
}

/** Metadata describing a single pane type */
export interface PaneDefinition {
  /** Unique string key (used as dockview component id and localStorage reference) */
  id: string
  /** Human-readable title shown in tab headers */
  title: string
  /** Optional icon class or emoji for the tab */
  icon?: string
  /** React component for dockview -- must accept IDockviewPanelProps (with optional params) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: FunctionComponent<IDockviewPanelProps<any>>
  /** Renderer policy: 'always' for WebGL/xterm, 'onVisible' for lightweight panels */
  renderer: PaneRenderer
  /** Where this pane should go in the default layout */
  defaultPosition?: PaneDefaultPosition
  /** If true, this pane is included in the default layout on first launch */
  defaultVisible?: boolean
  /** If true, only one instance of this pane can exist at a time */
  singleton?: boolean
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const _registry = new Map<string, PaneDefinition>()

/** Register a pane type.  Overwrites if same id is registered again. */
export function registerPane(def: PaneDefinition): void {
  _registry.set(def.id, def)
}

/** Get a pane definition by id.  Returns undefined if not found. */
export function getPane(id: string): PaneDefinition | undefined {
  return _registry.get(id)
}

/** Get all registered pane definitions as an array. */
export function getAllPanes(): PaneDefinition[] {
  return Array.from(_registry.values())
}

/** Build the `components` record that DockviewReact expects. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildComponentMap(): Record<string, FunctionComponent<any>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map: Record<string, FunctionComponent<any>> = {}
  for (const [id, def] of _registry) {
    map[id] = def.component
  }
  return map
}

/** Get all pane definitions that should be visible in the default layout. */
export function getDefaultVisiblePanes(): PaneDefinition[] {
  return getAllPanes().filter((p) => p.defaultVisible)
}
