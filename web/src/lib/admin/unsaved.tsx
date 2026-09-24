'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * Unsaved-changes guard for the owner area.
 *
 * The App Router has no route-change events to veto, so the guard works at the two places a
 * navigation actually starts: a click on an in-site link (caught in the capture phase on the
 * document, before `next/link` sees it — so the sidebar, the tables and the page links are all
 * covered without wrapping each one) and the handful of `router.push` calls the admin makes
 * itself, which go through `confirmLeave`. A reload, a tab close or an off-site link is the
 * browser's own `beforeunload` prompt. The back button is not intercepted.
 */

type LeaveOptions = { description?: string };

type Guard = {
  setDirty: (key: string, dirty: boolean) => void;
  /** Runs `go` now when nothing is dirty; otherwise asks first. */
  confirmLeave: (go: () => void, opts?: LeaveOptions) => void;
};

const GuardContext = createContext<Guard | null>(null);

const DEFAULT_DESCRIPTION =
  'Your changes on this page have not been saved. If you leave now, they will be lost.';

/** True for a plain left click on a same-origin link to another page of the site. */
function interceptable(e: MouseEvent): URL | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
    return null;
  }
  const target = e.target instanceof Element ? e.target : null;
  const anchor = target?.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null; // beforeunload covers it
  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    return null; // a hash jump on the same page loses nothing
  }
  return url;
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dirty = useRef(new Set<string>());
  const [pending, setPending] = useState<{ go: () => void; description: string } | null>(null);

  const setDirty = useCallback((key: string, on: boolean) => {
    if (on) dirty.current.add(key);
    else dirty.current.delete(key);
  }, []);

  const confirmLeave = useCallback((go: () => void, opts?: LeaveOptions) => {
    if (dirty.current.size === 0) {
      go();
      return;
    }
    setPending({ go, description: opts?.description ?? DEFAULT_DESCRIPTION });
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dirty.current.size === 0) return;
      const url = interceptable(e);
      if (!url) return;
      e.preventDefault();
      e.stopPropagation();
      setPending({
        go: () => router.push(url.pathname + url.search + url.hash),
        description: DEFAULT_DESCRIPTION,
      });
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [router]);

  function leave() {
    const go = pending?.go;
    // The owner chose to discard: nothing on this page should hold them back any more.
    dirty.current.clear();
    setPending(null);
    go?.();
  }

  const value = useMemo(() => ({ setDirty, confirmLeave }), [setDirty, confirmLeave]);

  return (
    <GuardContext.Provider value={value}>
      {children}
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>{pending?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={leave}>Discard changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </GuardContext.Provider>
  );
}

/** `confirmLeave` for code that navigates itself (Cancel, Duplicate). Without a provider — a
 *  component test, say — it simply runs the navigation. */
export function useConfirmLeave(): Guard['confirmLeave'] {
  const guard = useContext(GuardContext);
  return guard?.confirmLeave ?? ((go) => go());
}

/**
 * Registers a form's dirty state: arms the browser's `beforeunload` prompt and the in-app link
 * guard while `dirty` is true. `release()` disarms both for a navigation the form starts on
 * purpose (a deliberate reload, say).
 */
export function useUnsavedChangesGuard(dirty: boolean): { release: () => void } {
  const guard = useContext(GuardContext);
  const key = useId();
  const released = useRef(false);

  useEffect(() => {
    released.current = false;
    guard?.setDirty(key, dirty);
    if (!dirty) return () => guard?.setDirty(key, false);
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (released.current) return;
      e.preventDefault();
      // Chrome < 119 and Safari still want the legacy returnValue to show the prompt.
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      guard?.setDirty(key, false);
    };
  }, [dirty, guard, key]);

  const release = useCallback(() => {
    released.current = true;
    guard?.setDirty(key, false);
  }, [guard, key]);

  return { release };
}
