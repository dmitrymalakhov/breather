import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test.afterEach(async ({ request }) => {
  const meetings = await request.get('/api/meetings').then(r => r.json());
  for (const meeting of meetings) if (meeting.status !== 'ended') await request.post(`/api/meetings/${meeting.id}/end`);
});

test('English is the default; language switching persists and preserves form input', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Breather, meeting', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect APIs', exact: true })).toBeVisible();
  await page.getByText('Add context and materials', { exact: false }).click();
  await page.getByLabel('Your goal', { exact: true }).fill('Keep this goal unchanged');
  await page.getByRole('combobox', { name: 'Interface language' }).selectOption('ru');
  await expect(page.getByLabel('Ваша цель', { exact: true })).toHaveValue('Keep this goal unchanged');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await page.getByRole('combobox', { name: 'Язык интерфейса' }).selectOption('en');
  await page.getByRole('button', { name: 'API settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hint model', exact: true })).toBeVisible();
  await page.getByText('Speech language and speed', { exact: true }).click();
  await expect(page.getByLabel('Meeting language', { exact: true })).toHaveValue('auto');
  await page.getByText('Document and web search', { exact: false }).click();
  await page.getByText('Usage and rates', { exact: false }).click();
  expect((await page.locator('body').innerText()).replaceAll('Русский', '')).not.toMatch(/[А-Яа-яЁё]/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.route('**/api/documents', route => route.fulfill({ status: 400, json: { message: 'Документ не удалось прочитать.' } }));
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('fixture') });
  await expect(page.getByRole('alert')).toContainText('Unable to read the document.');
});

test('English demo and mini window stay synchronized across language changes', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => Object.defineProperty(window, 'documentPictureInPicture', { value: undefined, configurable: true }));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/'); await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('button', { name: 'Connect APIs', exact: true })).toBeEnabled();
  if (process.env.BREATHER_CAPTURE_README === '1') await page.screenshot({ animations: 'disabled', path: resolve('docs/images/start.png') });
  const created = page.waitForRequest(request => request.url().endsWith('/api/meetings') && request.method() === 'POST');
  await page.getByRole('button', { name: 'View demo', exact: true }).click();
  expect((await created).postDataJSON().brief.language).toBe('en');
  await expect(page.getByRole('heading', { name: 'What is diarization?', exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.utterance:not(.interim)').filter({ hasText: 'How will we tell speakers apart?' })).toBeVisible();
  await expect(page.locator('.hint-card .streaming-text')).toHaveCount(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  expect((await page.locator('body').innerText()).replaceAll('Русский', '')).not.toMatch(/[А-Яа-яЁё]/);
  if (process.env.BREATHER_CAPTURE_README === '1') await page.screenshot({ animations: 'disabled', path: resolve('docs/images/meeting.png') });
  const opened = context.waitForEvent('page'); await page.getByRole('button', { name: 'Mini mode', exact: true }).click(); const mini = await opened;
  await expect(mini.getByRole('heading', { name: 'What is diarization?', exact: true })).toBeVisible();
  await mini.evaluate(() => document.fonts.ready);
  if (process.env.BREATHER_CAPTURE_README === '1') await mini.screenshot({ animations: 'disabled', path: resolve('docs/images/mini.png') });
  await page.getByRole('combobox', { name: 'Interface language' }).selectOption('ru');
  await expect(mini.getByRole('heading', { name: 'Что такое диаризация?', exact: true })).toBeVisible();
  await expect(mini.locator('html')).toHaveAttribute('lang', 'ru');
  await page.getByRole('combobox', { name: 'Язык интерфейса' }).selectOption('en');
  await expect(mini.getByRole('heading', { name: 'What is diarization?', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env.BREATHER_CAPTURE_README === '1') await page.screenshot({ animations: 'disabled', path: resolve('docs/images/mobile.png') });
  await mini.close(); await page.getByRole('button', { name: 'Finish', exact: true }).click();
  expect(errors).toEqual([]);
});
