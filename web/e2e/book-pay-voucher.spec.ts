import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { E2E_PACKAGE, e2eDeparture, formatDate, isolate, uniqueEmail } from './support';

test.beforeEach(async ({ page }) => {
  await isolate(page);
});

test('a visitor books, pays through Checkout and downloads the voucher', async ({
  page,
  request,
}) => {
  const departure = await e2eDeparture(request);
  const email = uniqueEmail('booker');

  await page.goto(`/packages/${E2E_PACKAGE}`);
  await page.getByRole('button', { name: 'Book now' }).first().click();

  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Pick a date' })).toBeVisible();
  await sheet
    .getByRole('group', { name: 'Departure dates' })
    .getByRole('button', { name: new RegExp(formatDate(departure.date)) })
    .click();

  // The default party is one double room: two adults.
  await sheet.getByLabel('Traveller 1 name').fill('Asha Rao');
  await sheet.getByLabel('Traveller 1 age').fill('34');
  await sheet.getByLabel('Traveller 2 name').fill('Ira Menon');
  await sheet.getByLabel('Traveller 2 age').fill('32');

  await sheet.getByLabel('Lead traveller').fill('Asha Rao');
  await sheet.getByLabel('Mobile').fill('9845012345');
  await sheet.getByLabel('Email').fill(email);
  await sheet.getByLabel('State').selectOption('Karnataka');

  const pay = page.getByRole('button', { name: /^Pay/ });
  await expect(pay).toBeEnabled();
  await pay.click();

  // The Checkout stub pays at once; the api verifies the signature and confirms.
  await expect(sheet.getByRole('heading', { name: /^You’re going to/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect(sheet.getByText('is confirmed and paid.')).toBeVisible();
  const voucher = sheet.getByRole('link', { name: /Download voucher/ });
  await expect(voucher).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), voucher.click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const path = await download.path();
  const pdf = await readFile(path);
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(5_000);
});
