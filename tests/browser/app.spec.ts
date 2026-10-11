import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('breather.language', 'ru')); });
// Keep an interrupted scenario from leaving another test's demo meeting active.
test.afterEach(async ({request}) => {
 const meetings=await request.get('/api/meetings').then(r=>r.json());
 for(const meeting of meetings) if(meeting.status!=='ended') await request.post(`/api/meetings/${meeting.id}/end`);
});

test('durable questions, goal editing, evidence navigation and history', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Посмотреть пример' }).click();
  await page.getByRole('button',{name:'Контекст',exact:true}).click();
  await expect(page.locator('.utterance:not(.interim)').filter({hasText:'А как мы будем отличать говорящих? Что такое диаризация?'})).toBeVisible({timeout:10000});
  await page.getByRole('button', {name:'Задать цель',exact:true}).click();
  await page.getByLabel('Цель встречи',{exact:true}).fill('Согласовать срок запуска');
  await page.getByRole('button', {name:'Сохранить цель',exact:true}).click();
  await expect(page.locator('.goal-line')).toContainText('Согласовать срок запуска');
  await page.getByRole('button', {name:'Пауза',exact:true}).click();
  await page.getByRole('button', {name:'Обновить конспект',exact:true}).click();
  await expect(page.locator('.memory-list')).toContainText('Как отличать говорящих?');
  await page.getByRole('button', {name:'К реплике',exact:false}).first().click();
  await page.getByRole('button', {name:'Отметить отвеченным',exact:true}).first().click();
  await expect(page.getByRole('button',{name:'Открыть снова',exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Закрыть контекст',exact:true}).click();
  await page.getByRole('button',{name:'Завершить',exact:true}).click();
  await expect(page.getByText('Встреча завершена',{exact:true})).toBeVisible();
  await page.reload(); await page.getByRole('button',{name:'История',exact:true}).click();
  await page.getByRole('button',{name:'Открыть',exact:true}).first().click();
  await page.getByRole('button',{name:'Контекст',exact:true}).click();
  await expect(page.locator('.goal-line')).toContainText('Согласовать срок запуска');
  await expect(page.locator('.memory-list .resolved')).toContainText('Как отличать говорящих?');
  await expect(page.getByText('Демонстрация · платных запросов нет',{exact:true})).toBeVisible();
});

test('usage shows unknown amounts and configurable language and rates',async({page})=>{
 await page.route('**/api/usage',route=>route.fulfill({json:{requests:5,modelRequests:3,speechConnections:2,failed:1,cancelled:1,pending:0,unknownTokens:1,inputTokens:1234,outputTokens:50,cachedTokens:100,audioSeconds:3600,estimatedCostUsd:.39,unpriced:1}}));
 await page.goto('/');await page.getByRole('button',{name:'Настройки API',exact:true}).click();
 await page.getByText('Язык и скорость распознавания',{exact:true}).click();
 await page.getByLabel('Язык встречи',{exact:true}).selectOption('ru');
 await page.getByLabel('Пауза для завершения реплики',{exact:true}).selectOption('300');
 await page.locator('.billing-options > summary').click();
 await expect(page.locator('.usage-panel')).toContainText('$0,3900 + неизвестная часть');
 await page.locator('.usage-panel > summary').click();
 await expect(page.locator('.usage-panel')).toContainText('60,0 мин');
 await page.getByLabel('Модель · $ за 1 млн входных токенов',{exact:true}).fill('2');
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('demo stream, speakers, pause, persistence, and documents', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Посмотреть пример' }).click();
  await expect(page.getByText('Демонстрация · вымышленные реплики', { exact: false })).toBeVisible();
  await expect(page.getByText('Давайте обсудим помощника', { exact: false })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('heading', { name: 'Что такое диаризация?' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Говорящий 1', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Имя участника' }).fill('Дмитрий');
  await page.getByRole('button', { name: 'Сохранить имя' }).click();
  await expect(page.getByRole('button', { name: 'Дмитрий', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Закрепить подсказку' }).first().click();
  await expect(page.getByRole('button', { name: 'Открепить подсказку' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expect(page.getByText('На паузе', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(page.getByText('Встреча завершена', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'История', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Дмитрий', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Документы', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'заметки.md', mimeType: 'text/markdown', buffer: Buffer.from('# Диаризация\nРазделение реплик по говорящим в реальном времени.') });
  await expect(page.getByText('заметки.md', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Открыть заметки.md' }).click();
  await expect(page.getByRole('heading', { name: 'Диаризация', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Все документы' }).click();
  await page.getByRole('button', { name: 'Удалить заметки.md' }).click();
  await expect(page.getByText('заметки.md', { exact: true })).toHaveCount(0);
});
test('settings and responsive layout fit the viewport', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Настройки API' }).click();
  await expect(page.getByRole('heading', { name: 'Модель подсказок', exact: true })).toBeVisible();
  await expect(page.locator('input[type=password]')).toHaveCount(4);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Breather, встреча' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('quick start hides optional fields and returns after two-key setup', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Подключить API', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Ваша цель', { exact: true })).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Разговор', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Подключить API', exact: true }).click();
  await expect(page.locator('input[type=password]:visible')).toHaveCount(2);
  await page.getByLabel('Deepgram API-ключ', { exact: true }).fill('synthetic-deepgram');
  await page.getByLabel('API-ключ модели', { exact: true }).fill('synthetic-model');
  const modelOptions = page.locator('.connection-options').filter({has:page.getByLabel('Model ID', {exact:true})});
  await modelOptions.locator('summary').click();
  await modelOptions.getByLabel('Model ID', { exact: true }).fill('');
  await modelOptions.locator('summary').click();
  await page.getByRole('button', { name: 'Проверить и сохранить' }).click();
  await expect(modelOptions).toHaveAttribute('open', '');
  await modelOptions.getByLabel('Model ID', { exact: true }).fill('gpt-6-luna');
  await page.route('**/api/config', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    const input = route.request().postDataJSON();
    expect(input.deepgramKey).toBe('synthetic-deepgram'); expect(input.generation.apiKey).toBe('synthetic-model');
    const { apiKey: _key, ...generation } = input.generation;
    await route.fulfill({ json: { generation, hasDeepgramKey: true, hasGenerationKey: true, hasTavilyKey: false, embedding: { model: 'text-embedding-3-small', baseURL: 'https://api.openai.com/v1', hasKey: true } } });
  });
  await page.getByRole('button', { name: 'Проверить и сохранить' }).click();
  await expect(page.getByRole('button', { name: 'Начать встречу', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Ваша цель', { exact: true })).not.toBeVisible();
});

test('ElevenLabs setup saves the selected key and enables live start', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Подключить API', exact: true }).click();
  await page.getByLabel('Сервис распознавания', { exact: true }).selectOption('elevenlabs');
  await expect(page.getByLabel('Deepgram API-ключ', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Реплики идут общей лентой без разделения участников.', { exact: false })).toBeVisible();
  await page.getByLabel('ElevenLabs API-ключ', { exact: true }).fill('synthetic-eleven');
  await page.getByLabel('API-ключ модели', { exact: true }).fill('synthetic-model');
  await page.route('**/api/config', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    const input = route.request().postDataJSON();
    expect(input.speechProvider).toBe('elevenlabs'); expect(input.elevenlabsKey).toBe('synthetic-eleven'); expect(input.deepgramKey).toBeUndefined();
    const { apiKey: _key, ...generation } = input.generation;
    await route.fulfill({ json: { generation, speechProvider: 'elevenlabs', hasElevenlabsKey: true, hasDeepgramKey: false, hasGenerationKey: true, hasTavilyKey: false, embedding: { model: 'text-embedding-3-small', baseURL: 'https://api.openai.com/v1', hasKey: true } } });
  });
  await page.getByRole('button', { name: 'Проверить и сохранить' }).click();
  await expect(page.getByRole('button', { name: 'Начать встречу', exact: true })).toBeEnabled();
});
