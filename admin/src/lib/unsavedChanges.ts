import { useEffect, useId, useRef, useSyncExternalStore } from 'react';

// Which mounted editors hold changes that have not been saved. Module level,
// so a page can ask before navigating without each editor reporting up.
const dirtyEditors = new Set<string>();

/** What an editor offers the save bar: a name for it, and saving or
 *  undoing its changes. Editors with a save bar of their own, such as a
 *  league or bonspiel, leave it out. */
export interface Editor {
  /** "Time zone", as the bar lists it. */
  label: string;
  save: () => unknown;
  discard: () => void;
  /** False while the changes cannot be saved, such as a bad webhook URL. */
  canSave?: boolean;
}

export interface DirtyEditor {
  id: string;
  label: string;
  /** Asked when the bar's button is pressed, so it is always current. */
  canSave: () => boolean;
  save: () => unknown;
  discard: () => void;
}

const barEditors = new Map<string, DirtyEditor>();
const listeners = new Set<() => void>();
let snapshot: DirtyEditor[] = [];

function changed() {
  snapshot = [...barEditors.values()];
  for (const listener of listeners) listener();
}

function warnOnUnload(e: BeforeUnloadEvent) {
  if (dirtyEditors.size > 0) e.preventDefault();
}

/** Marks the calling editor as holding unsaved changes while [dirty], so
 *  closing or reloading the tab, and confirmLeave, ask first. With [editor],
 *  it is listed on the save bar too. */
export function useUnsavedChanges(dirty: boolean, editor?: Editor): void {
  const id = useId();
  // The bar calls the latest save and discard, which close over the
  // editor's current draft.
  const latest = useRef(editor);
  useEffect(() => {
    latest.current = editor;
  });
  const onBar = editor !== undefined;
  const label = editor?.label ?? '';

  useEffect(() => {
    if (!dirty) return;
    dirtyEditors.add(id);
    window.addEventListener('beforeunload', warnOnUnload);
    if (onBar) {
      barEditors.set(id, {
        id,
        label,
        canSave: () => latest.current?.canSave !== false,
        save: () => latest.current?.save(),
        discard: () => latest.current?.discard(),
      });
      changed();
    }
    return () => {
      dirtyEditors.delete(id);
      if (barEditors.delete(id)) changed();
      if (dirtyEditors.size === 0) window.removeEventListener('beforeunload', warnOnUnload);
    };
  }, [id, dirty, onBar, label]);
}

/** The editors on the save bar with unsaved changes, in the order they
 *  were changed. */
export function useDirtyEditors(): DirtyEditor[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}

/** Whether to go ahead with leaving the page: straight away when nothing is
 *  unsaved, otherwise once the person confirms. The router in use cannot
 *  block navigation, so in-app links that leave a page call this first. */
export function confirmLeave(): boolean {
  return dirtyEditors.size === 0 || confirm('You have unsaved changes. Leave without saving them?');
}
