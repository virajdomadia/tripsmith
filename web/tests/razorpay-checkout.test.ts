// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHECKOUT_SRC,
  type CheckoutOptions,
  loadCheckout,
  openCheckout,
  resetCheckoutForTests,
} from '../src/lib/razorpay-checkout';
import { nth } from './nth';

/** V9 (Q-7): the Checkout loader — one script on the first Pay, reused, and retried after a miss. */

const scripts = () => [...document.head.querySelectorAll<HTMLScriptElement>('script')];

/** A stand-in for Razorpay's constructor that records what it was given. */
function fakeRazorpay() {
  const instance = { open: vi.fn(), on: vi.fn() };
  const ctor = vi.fn<(options: CheckoutOptions) => typeof instance>(function () {
    return instance;
  });
  return { ctor, instance };
}

afterEach(() => {
  resetCheckoutForTests();
  delete window.Razorpay;
  document.head.innerHTML = '';
});

describe('loadCheckout', () => {
  it('injects the script once on first use and resolves when Razorpay arrives', async () => {
    const first = loadCheckout();
    const second = loadCheckout();
    expect(scripts()).toHaveLength(1);
    const script = nth(scripts(), 0);
    expect(script.src).toBe(CHECKOUT_SRC);
    expect(script.async).toBe(true);

    window.Razorpay = fakeRazorpay().ctor as never;
    script.onload?.(new Event('load'));
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
  });

  it('adds nothing once Razorpay is already on the page', async () => {
    window.Razorpay = fakeRazorpay().ctor as never;
    await loadCheckout();
    expect(scripts()).toHaveLength(0);
  });

  it('rejects a script that loaded without defining Razorpay', async () => {
    const loading = loadCheckout();
    nth(scripts(), 0).onload?.(new Event('load'));
    await expect(loading).rejects.toThrow('Checkout loaded without Razorpay');
  });

  it('forgets a failed load, removes the script, and lets Pay try again', async () => {
    const failed = loadCheckout();
    nth(scripts(), 0).onerror?.(new Event('error'));
    await expect(failed).rejects.toThrow('Could not load Razorpay Checkout');
    expect(scripts()).toHaveLength(0);

    const retry = loadCheckout();
    expect(scripts()).toHaveLength(1);
    window.Razorpay = fakeRazorpay().ctor as never;
    nth(scripts(), 0).onload?.(new Event('load'));
    await expect(retry).resolves.toBeUndefined();
  });
});

describe('openCheckout', () => {
  const options = { key: 'rzp_test_x', order_id: 'order_1' } as CheckoutOptions;

  it('refuses to open before the script has loaded', () => {
    expect(() => openCheckout(options, vi.fn())).toThrow('Razorpay Checkout is not loaded');
  });

  it('opens Checkout with the options and reports a failed payment’s description', () => {
    const { ctor, instance } = fakeRazorpay();
    window.Razorpay = ctor as never;
    const onFailed = vi.fn();
    openCheckout(options, onFailed);

    expect(ctor).toHaveBeenCalledWith(options);
    expect(instance.open).toHaveBeenCalledOnce();
    const [event, cb] = nth(instance.on.mock.calls, 0) as [string, (e: object) => void];
    expect(event).toBe('payment.failed');
    cb({ error: { description: 'Card declined' } });
    cb({});
    expect(onFailed.mock.calls).toEqual([['Card declined'], [undefined]]);
  });
});
