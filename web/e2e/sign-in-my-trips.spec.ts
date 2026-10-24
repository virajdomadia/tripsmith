import { expect, test } from '@playwright/test';
import { isolate, paidBooking, signInCode, uniqueEmail } from './support';

test.beforeEach(async ({ page }) => {
  await isolate(page);
});

test('a customer signs in with an emailed code and finds their booking under My trips', async ({
  page,
  request,
}) => {
  const email = uniqueEmail('traveller');
  const { ref } = await paidBooking(request, { name: 'Nisha Pillai', email });

  await page.goto('/account/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();

  const code = page.getByLabel('6-digit code');
  await expect(code).toBeVisible();
  // Emailed, not shown: this address is not a demo one.
  await expect(page.getByText('Demo account — no email is sent.')).toHaveCount(0);
  await code.fill(await signInCode(request, email));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page).toHaveURL(/\/account(\?|$)/);
  await expect(page.getByRole('heading', { level: 1, name: 'Hello, Nisha.' })).toBeVisible();
  await expect(page.getByText(ref, { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Kasol Riverside Weekend' }).first()).toBeVisible();
});
