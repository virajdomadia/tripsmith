import { createHmac } from 'node:crypto';
import { type APIRequestContext, expect, type Page } from '@playwright/test';

export { formatDate, inr } from '@/lib/format';

/*
 * Shared by the V9 journeys. The api is api/tests/e2e_app.py: FakeRazorpay signs with the
 * secret below, email lands in an outbox read on /__e2e/outbox, and the seed
 * (api/tests/e2e_seed.py) adds one far-off departure of E2E_PACKAGE with E2E_SEATS seats.
 */

export const API_URL = `http://127.0.0.1:${process.env.E2E_API_PORT ?? 8000}`;
export const RAZORPAY_SECRET = 'fake-secret-for-tests'; // api/tests/razorpay_fake.py KEY_SECRET
export const OWNER = {
  email: 'owner@tripsmith-e2e.dev',
  password: 'e2e-owner-password-not-secret',
}; // api/tests/e2e_app.py
export const E2E_PACKAGE = 'kasol-weekend-camp';
const E2E_SEATS = 40;
export const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

/** A fresh address per run, on a domain that is not a demo one (so the code is "emailed"). */
export function uniqueEmail(who: string): string {
  return `${who}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@tripsmith-e2e.dev`;
}

export function signature(orderId: string, paymentId: string): string {
  return createHmac('sha256', RAZORPAY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
}

/**
 * Nothing leaves the machine: Checkout.js is answered with a stub that "pays" at once (the
 * signature made in the page with WebCrypto, under the fake's secret), and every other
 * third-party request is aborted.
 */
export async function isolate(page: Page): Promise<void> {
  const stub = `
    (() => {
      const secret = ${JSON.stringify(RAZORPAY_SECRET)};
      async function sign(text) {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const mac = await crypto.subtle.sign('HMAC', key, enc.encode(text));
        return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
      }
      window.Razorpay = function (options) {
        this.options = options;
        this.on = function () {};
        this.open = function () {
          const order = options.order_id;
          const payment = 'pay_E2e' + Date.now();
          sign(order + '|' + payment).then((sig) =>
            options.handler({
              razorpay_order_id: order,
              razorpay_payment_id: payment,
              razorpay_signature: sig,
            }));
        };
      };
    })();
  `;
  await page.context().route(
    (url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1',
    (route) =>
      route.request().url() === CHECKOUT_SRC
        ? route.fulfill({ status: 200, contentType: 'application/javascript', body: stub })
        : route.abort('blockedbyclient'),
  );
}

type Departure = { id: string; date: string; seatsTotal: number; seatsLeft: number };

/** The seed's own far-off departure of E2E_PACKAGE. */
export async function e2eDeparture(request: APIRequestContext): Promise<Departure> {
  const res = await request.get(`${API_URL}/packages/${E2E_PACKAGE}/departures`);
  expect(res.ok()).toBeTruthy();
  const { items } = (await res.json()) as { items: Departure[] };
  const ours = items.filter((d) => d.seatsTotal === E2E_SEATS);
  const found = ours[ours.length - 1];
  if (!found) throw new Error(`No ${E2E_SEATS}-seat departure of ${E2E_PACKAGE}: run e2e_seed`);
  return found;
}

/** The newest sign-in code emailed to `email` (the api's outbox). */
export async function signInCode(request: APIRequestContext, email: string): Promise<string> {
  let code = '';
  await expect
    .poll(async () => {
      const res = await request.get(`${API_URL}/__e2e/outbox`, { params: { to: email } });
      const mail = (await res.json()) as { subject: string }[];
      code = mail.find((m) => /sign-in code/.test(m.subject))?.subject.match(/\d{6}/)?.[0] ?? '';
      return code;
    })
    .toMatch(/^\d{6}$/);
  return code;
}

/** Sign `request` in as the customer `email` (code request → outbox → verify). */
export async function signInCustomer(request: APIRequestContext, email: string): Promise<void> {
  const asked = await request.post(`${API_URL}/auth/otp/request`, { data: { email } });
  expect(asked.status(), await asked.text()).toBe(200);
  const code = await signInCode(request, email);
  const res = await request.post(`${API_URL}/auth/otp/verify`, { data: { email, code } });
  expect(res.status(), await res.text()).toBe(200);
}

export async function signInOwner(request: APIRequestContext): Promise<void> {
  const res = await request.post(`${API_URL}/auth/login`, { data: OWNER });
  expect(res.status(), await res.text()).toBe(200);
}

/**
 * A booking for two in a double room on the e2e departure, paid in full through the api the way
 * Checkout's success handler would. Returns its ref and what was paid.
 */
export async function paidBooking(
  request: APIRequestContext,
  contact: { name: string; email: string },
): Promise<{ ref: string; paidPaise: number }> {
  const departure = await e2eDeparture(request);
  const order = await request.post(`${API_URL}/bookings`, {
    data: {
      departureId: departure.id,
      travellers: [
        { name: contact.name, age: 34, occupancy: 'double' },
        { name: 'Ira Menon', age: 32, occupancy: 'double' },
      ],
      contact: { ...contact, phone: '9845012345', state: 'Karnataka' },
      pay: 'full',
    },
  });
  expect(order.status(), await order.text()).toBe(201);
  const { bookingRef, orderId, amountPaise } = (await order.json()) as {
    bookingRef: string;
    orderId: string;
    amountPaise: number;
  };
  const paymentId = `pay_E2eApi${Date.now()}`;
  const paid = await request.post(`${API_URL}/bookings/${bookingRef}/confirm`, {
    data: {
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature(orderId, paymentId),
    },
  });
  expect(paid.status(), await paid.text()).toBe(200);
  expect(((await paid.json()) as { status: string }).status).toBe('confirmed');
  return { ref: bookingRef, paidPaise: amountPaise };
}
