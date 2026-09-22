import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/**
 * Pointer plus keyboard, shared by the itinerary and the gallery. The keyboard sensor is what
 * makes drag-to-reorder reachable without a mouse — space to lift, arrows to move, space to
 * drop — so there is no second set of up/down buttons to keep in sync.
 *
 * The pointer sensor needs a small activation distance: without it, a click on a control inside
 * a draggable row starts a drag instead of activating the control.
 */
export function useSortableSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/** Resolve a drag-end into the index pair that moved, or null when nothing did. */
export function movedIndices(
  event: DragEndEvent,
  ids: string[],
): { from: number; to: number } | null {
  const { active, over } = event;
  if (!over || active.id === over.id) return null;
  const from = ids.indexOf(String(active.id));
  const to = ids.indexOf(String(over.id));
  if (from < 0 || to < 0) return null;
  return { from, to };
}

/** `arrayMove` without pulling the helper in — returns a new array with one item relocated. */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}
