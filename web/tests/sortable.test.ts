import type { DragEndEvent } from '@dnd-kit/core';
import { describe, expect, it } from 'vitest';
import { movedIndices, reorder } from '../src/lib/admin/sortable';

/** dnd-kit hands the handler `active`/`over` with ids; only those two fields matter here. */
const dragEnd = (active: string, over: string | null) =>
  ({ active: { id: active }, over: over === null ? null : { id: over } }) as DragEndEvent;

describe('movedIndices', () => {
  const ids = ['a', 'b', 'c'];

  it('resolves a drag onto another row into its index pair', () => {
    expect(movedIndices(dragEnd('a', 'c'), ids)).toEqual({ from: 0, to: 2 });
    expect(movedIndices(dragEnd('c', 'a'), ids)).toEqual({ from: 2, to: 0 });
  });

  it('reports nothing when the row did not move or was dropped outside', () => {
    expect(movedIndices(dragEnd('b', 'b'), ids)).toBeNull();
    expect(movedIndices(dragEnd('b', null), ids)).toBeNull();
  });

  it('reports nothing for an id the list does not hold', () => {
    expect(movedIndices(dragEnd('zzz', 'a'), ids)).toBeNull();
    expect(movedIndices(dragEnd('a', 'zzz'), ids)).toBeNull();
  });
});

describe('reorder', () => {
  it('moves one item and leaves the rest in order', () => {
    expect(reorder(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(reorder(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(reorder(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the list it was given', () => {
    const original = ['a', 'b', 'c'];
    reorder(original, 0, 2);
    expect(original).toEqual(['a', 'b', 'c']);
  });
});
