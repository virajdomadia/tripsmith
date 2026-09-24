// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Facets, SearchQuery } from '../src/lib/search';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const { FilterPanel } = await import('../src/components/site/packages/FilterPanel');
const { ResultsToolbar } = await import('../src/components/site/packages/ResultsToolbar');
const { SearchTransition } = await import('../src/components/site/packages/SearchTransition');

const facets: Facets = {
  budget: { min: 10_000, max: 50_000 },
  destinations: [{ value: 'goa', label: 'Goa', count: 3 }],
  months: [],
  nights: { min: 2, max: 6 },
  themes: [],
};
const query: SearchQuery = { destination: [], themes: [], sort: 'price-asc' };

function renderListing(q: SearchQuery = query) {
  return render(
    <SearchTransition query={q}>
      <FilterPanel facets={facets} />
      <ResultsToolbar total={3} chips={[]} />
    </SearchTransition>,
  );
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const slider = () => screen.getByRole('slider');

describe('FilterPanel budget slider', () => {
  it('commits a keyboard / assistive-tech step once it settles', () => {
    renderListing();
    fireEvent.change(slider(), { target: { value: '30000' } });
    expect(replace).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(400));
    expect(replace).toHaveBeenCalledWith('/packages?maxBudget=30000', { scroll: false });
  });

  it('commits a drag let go outside the input, or cancelled', () => {
    renderListing();
    fireEvent.pointerDown(slider());
    fireEvent.change(slider(), { target: { value: '20000' } });
    act(() => void vi.advanceTimersByTime(400));
    expect(replace).not.toHaveBeenCalled(); // still held
    fireEvent.pointerCancel(window);
    expect(replace).toHaveBeenCalledWith('/packages?maxBudget=20000', { scroll: false });
  });

  it('drops a leftover drag once the committed budget moves on', () => {
    const { rerender } = renderListing({ ...query, maxBudget: 40_000 });
    fireEvent.pointerDown(slider());
    fireEvent.change(slider(), { target: { value: '20000' } });
    // A chip removal (or back/forward) clears the budget before the drag is released.
    rerender(
      <SearchTransition query={query}>
        <FilterPanel facets={facets} />
        <ResultsToolbar total={3} chips={[]} />
      </SearchTransition>,
    );
    expect(slider().getAttribute('aria-valuetext')).toBe('Any budget');
    fireEvent.pointerUp(window);
    expect(replace).not.toHaveBeenCalled();
  });
});
