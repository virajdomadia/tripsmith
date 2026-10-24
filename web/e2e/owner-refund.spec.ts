import { expect, test } from '@playwright/test';
import {
  API_URL,
  inr,
  isolate,
  OWNER,
  paidBooking,
  signInCustomer,
  signInOwner,
  uniqueEmail,
} from './support';

test.beforeEach(async ({ page }) => {
  await isolate(page);
});

test('the owner sends a refund that is owed from the money desk', async ({ page, playwright }) => {
  test.setTimeout(90_000); // the admin desk's prefetch burst (below) is slow on small runners
  // Setup through the api: a paid booking, the customer asks to cancel, and the owner approves
  // a full refund while Razorpay's refund endpoint is down — so the refund is left owed.
  const customer = await playwright.request.newContext();
  const owner = await playwright.request.newContext();
  const switchRefunds = async (down: boolean) => {
    const res = await owner.post(`${API_URL}/__e2e/razorpay`, { data: { refunds_down: down } });
    expect(res.ok(), await res.text()).toBe(true);
  };
  let ref: string, paidPaise: number;
  try {
    ({ ref, paidPaise } = await leaveARefundOwed());
  } finally {
    await customer.dispose();
    await owner.dispose();
  }

  async function leaveARefundOwed() {
    const email = uniqueEmail('canceller');
    const { ref, paidPaise } = await paidBooking(customer, { name: 'Kabir Shah', email });
    await signInCustomer(customer, email);
    const asked = await customer.post(`${API_URL}/account/bookings/${ref}/cancellation`, {
      data: { reason: 'Our plans changed and we can no longer travel.' },
    });
    expect(asked.status(), await asked.text()).toBe(201);

    await signInOwner(owner);
    const got = await owner.get(`${API_URL}/admin/bookings/${ref}`);
    expect(got.ok(), await got.text()).toBe(true);
    const detail = (await got.json()) as { cancellation: { id: string } };
    await switchRefunds(true);
    try {
      const resolved = await owner.post(
        `${API_URL}/admin/cancellations/${detail.cancellation.id}/resolve`,
        {
          data: {
            decision: 'approve',
            note: 'Approved — the full amount goes back to your card.',
            refundPaise: paidPaise,
          },
        },
      );
      expect(resolved.status(), await resolved.text()).toBe(200);
    } finally {
      await switchRefunds(false);
    }
    return { ref, paidPaise };
  }

  // The refund click itself is the owner's, in the browser.
  await page.goto('/admin/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(OWNER.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  // The production build prefetches every admin nav link at once; on a slow runner that burst
  // can hold the single `next start` process for seconds. Let it finish before acting.
  await page.waitForLoadState('networkidle');

  // The money desk's "Going out" panel; each row is the booking's link plus its amount/action.
  const goingOut = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: /^Going out/ }) });
  const row = goingOut.getByRole('link', { name: new RegExp(`${ref} · `) }).locator('xpath=..');
  await expect(row).toContainText(inr(paidPaise));
  await row.getByRole('button', { name: 'Send refund' }).click();
  await row.getByRole('button', { name: `Yes, send ${inr(paidPaise)}` }).click();

  await expect(page.getByText(`Refund of ${inr(paidPaise)} sent on ${ref}`)).toBeVisible({
    timeout: 20_000,
  });
  await expect(goingOut.getByText(new RegExp(`Refunded .* · ${ref}`))).toBeVisible();
  // Nothing left owed on this booking: its "REF · why" row is gone from the panel.
  await expect(goingOut.getByRole('link', { name: new RegExp(`${ref} · `) })).toHaveCount(0);
});
