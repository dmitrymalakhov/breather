import { test, expect } from '@playwright/test';
// Keep an interrupted scenario from leaving another test's demo meeting active.
test.afterEach(async ({request}) => {
 const meetings=await request.get('/api/meetings').then(r=>r.json());
 for(const meeting of meetings) if(meeting.status!=='ended') await request.post(`/api/meetings/${meeting.id}/end`);
});


test('compact workspace keeps live content above the fold and context optional',async({page})=>{
 await page.setViewportSize({width:1366,height:768});await page.goto('/');await page.getByRole('button',{name:'Посмотреть пример',exact:true}).click();
 await expect(page.locator('.conversation-grid')).toBeVisible();
 const box=await page.locator('.conversation-grid').boundingBox();expect(box!.y).toBeLessThan(200);
 await expect(page.locator('#meeting-context')).toBeHidden();
 await page.getByLabel('Настройки микрофона',{exact:true}).click();await expect(page.getByRole('combobox',{name:'Микрофон',exact:true})).toBeVisible();await page.getByLabel('Настройки микрофона',{exact:true}).click();
 await page.getByRole('button',{name:'Контекст',exact:true}).click();await expect(page.locator('#meeting-context')).toBeVisible();
 await page.getByRole('button',{name:'Закрыть контекст',exact:true}).click();await expect(page.locator('#meeting-context')).toBeHidden();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.getByRole('heading',{name:'Подсказки',exact:true})).toBeInViewport();
 await page.getByLabel('Настройки микрофона',{exact:true}).click();const device=await page.locator('.device-menu .audio-control').boundingBox();expect(device!.x).toBeGreaterThanOrEqual(0);expect(device!.x+device!.width).toBeLessThanOrEqual(390);await page.getByLabel('Настройки микрофона',{exact:true}).click();
 await page.getByRole('button',{name:'Завершить',exact:true}).click();
});

test('ordinary mini window mirrors live hints, pin and pause without another meeting',async({page,context})=>{
 const sockets:string[]=[];page.on('websocket',socket=>sockets.push(socket.url()));
 await page.addInitScript(()=>Object.defineProperty(window,'documentPictureInPicture',{value:undefined,configurable:true}));
 await page.goto('/');await page.getByRole('button',{name:'Посмотреть пример',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Что такое диаризация?',exact:true})).toBeVisible({timeout:10000});
 const before=await page.request.get('/api/meetings').then(r=>r.json());
 const opened=context.waitForEvent('page');await page.getByRole('button',{name:'Мини-режим',exact:true}).click();const mini=await opened;
 await expect(mini.getByRole('heading',{name:'Что такое диаризация?',exact:true})).toBeVisible();
 await expect(mini.locator('footer')).toContainText('Обычное окно');
 await mini.getByRole('button',{name:'Закрепить подсказку',exact:true}).first().click();await expect(page.getByRole('button',{name:'Открепить подсказку',exact:true}).first()).toBeVisible();
 await mini.getByRole('button',{name:'Пауза',exact:true}).click();await expect(page.getByText('На паузе',{exact:true})).toBeVisible();
 await mini.getByRole('button',{name:'Продолжить',exact:true}).click();await expect(page.getByRole('button',{name:'Пауза',exact:true})).toBeVisible();
 await mini.close();await expect(page.getByRole('button',{name:'Пауза',exact:true})).toBeVisible();
 expect((await page.request.get('/api/meetings').then(r=>r.json())).length).toBe(before.length);expect(sockets).toHaveLength(1);
 await page.getByRole('button',{name:'Завершить',exact:true}).click();
});

test('Document Picture-in-Picture displays the same live React state',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Посмотреть пример',exact:true}).click();
 await page.getByRole('button',{name:'Мини-режим',exact:true}).click();
 await expect(page.locator('.notice')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>!!(window as any).documentPictureInPicture?.window?.document.querySelector('.mini-panel'))).toBe(true);
 await expect.poll(()=>page.evaluate(()=>(window as any).documentPictureInPicture.window.document.querySelector('.mini-hints')?.textContent)).toContain('Что такое диаризация?');
 await page.evaluate(()=>(window as any).documentPictureInPicture.window.close());
 await expect(page.getByRole('button',{name:'Пауза',exact:true})).toBeVisible();await page.getByRole('button',{name:'Завершить',exact:true}).click();
});
