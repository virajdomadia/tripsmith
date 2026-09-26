// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterLoad } from '@/components/site/booking/BookNow';

// B14: `#book` opens the sheet only after `load` + idle, so its chunks stay out of the LCP window.
describe('afterLoad', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('waits for load, then runs once', () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('interactive');
    const fn = vi.fn();
    afterLoad(fn);
    vi.runAllTimers();
    expect(fn).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('load'));
    vi.runAllTimers();
    window.dispatchEvent(new Event('load'));
    vi.runAllTimers();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs when the page has already loaded, and the cancel stops it', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    afterLoad(fn)();
    vi.runAllTimers();
    expect(fn).not.toHaveBeenCalled();
    afterLoad(fn);
    vi.runAllTimers();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
