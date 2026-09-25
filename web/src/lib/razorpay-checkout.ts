/**
 * Razorpay Checkout (B5, docs/04 v2 §5 step 2). The script is injected on the first Pay click,
 * never on page load — a package page that is only read costs nothing — and reused after that.
 * Its origin is allowed site-wide in next.config.ts (`script-src`, plus the api.razorpay.com
 * frame it opens).
 */

export const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

export type CheckoutSuccess = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export type CheckoutOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: 'INR';
  name: string;
  description: string;
  /** Seconds before Checkout closes itself: what is left of the seat hold. */
  timeout: number;
  prefill: { name: string; email: string; contact: string };
  notes: Record<string, string>;
  theme: { color: string };
  retry: { enabled: boolean };
  modal: { ondismiss: () => void; confirm_close: boolean; escape: boolean };
  handler: (response: CheckoutSuccess) => void;
};

type CheckoutInstance = {
  open: () => void;
  on: (event: 'payment.failed', cb: (e: { error?: { description?: string } }) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => CheckoutInstance;
  }
}

let loading: Promise<void> | undefined;

/** Resolves once `window.Razorpay` exists. A failed load is forgotten, so Pay can try again. */
export function loadCheckout(): Promise<void> {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () =>
      window.Razorpay ? resolve() : reject(new Error('Checkout loaded without Razorpay'));
    script.onerror = () => {
      script.remove();
      reject(new Error('Could not load Razorpay Checkout'));
    };
    document.head.appendChild(script);
  }).catch((err: unknown) => {
    loading = undefined;
    throw err;
  });
  return loading;
}

/** Open Checkout; the returned instance is Razorpay's own. */
export function openCheckout(
  options: CheckoutOptions,
  onFailed: (description?: string) => void,
): void {
  if (!window.Razorpay) throw new Error('Razorpay Checkout is not loaded');
  const rzp = new window.Razorpay(options);
  rzp.on('payment.failed', (e) => onFailed(e.error?.description));
  rzp.open();
}

/** Test seam: forget a loaded script. */
export function resetCheckoutForTests() {
  loading = undefined;
}
