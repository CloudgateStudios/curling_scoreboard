import { useEffect, useId } from 'react';

// Which mounted editors hold changes that have not been saved. Module level,
// so a page can ask before navigating without each editor reporting up.
const dirtyEditors = new Set<string>();

function warnOnUnload(e: BeforeUnloadEvent) {
  if (dirtyEditors.size > 0) e.preventDefault();
}

/** Marks the calling editor as holding unsaved changes while [dirty], so
 *  closing or reloading the tab, and confirmLeave, ask first. */
export function useUnsavedChanges(dirty: boolean): void {
  const id = useId();
  useEffect(() => {
    if (!dirty) return;
    dirtyEditors.add(id);
    window.addEventListener('beforeunload', warnOnUnload);
    return () => {
      dirtyEditors.delete(id);
      if (dirtyEditors.size === 0) window.removeEventListener('beforeunload', warnOnUnload);
    };
  }, [id, dirty]);
}

/** Whether to go ahead with leaving the page: straight away when nothing is
 *  unsaved, otherwise once the person confirms. The router in use cannot
 *  block navigation, so in-app links that leave a page call this first. */
export function confirmLeave(): boolean {
  return dirtyEditors.size === 0 || confirm('You have unsaved changes. Leave without saving them?');
}
