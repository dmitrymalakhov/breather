import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store';
import { Settings, defaultBilling, settingsSchema } from '../server/config';
import { ApiGenerator, collect, type Generator } from '../server/ai';
import { observeModel, tokenCost } from '../server/usage';
import { mergeMemory } from '../server/memory';
import { Session } from '../server/session';
import { Documents } from '../server/documents';
import type { Meeting, Utterance } from '../shared/types';
const roots: string[]=[]; const stores: Store[]=[]; const sessions: Session[]=[];
afterEach(async()=>{for(const s of sessions.splice(0)) await s.end();for(const s of stores.splice(0))s.close();for(const r of roots.splice(0))rmSync(r,{recursive:true,force:true});vi.restoreAllMocks();});
const rates={...defaultBilling,inputMillion:2,outputMillion:8,cachedMillion:.2};
function fixture(){const root=mkdtempSync(join(tmpdir(),'sufler-usage-'));roots.push(root);const store=new Store(join(root,'store.sqlite'));stores.push(store);const settings=new Settings(root,{billing:rates});return{root,store,settings};}
const utterance=(id:string,text:string,end=1):Utterance=>({id,meetingId:'m',speakerId:'speaker',text,start:end-1,end,receivedAt:Date.now(),final:true});
it.each(['openai','compatible'] as const)('records actual %s usage exactly once and preserves cached input cost',async provider=>{
 const {store}=fixture();const config={provider,baseURL:'https://mock.example/v1',model:'fixture',apiKey:'fake'};
 const events=provider==='openai' ? 'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"OK"}\n\nevent: response.completed\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":1000,"output_tokens":100,"input_tokens_details":{"cached_tokens":400}}}}\n\n' : 'data: {"id":"x","object":"chat.completion.chunk","choices":[{"delta":{"content":"OK"},"index":0}]}\n\ndata: {"id":"x","object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":1000,"completion_tokens":100,"prompt_tokens_details":{"cached_tokens":400}}}\n\ndata: [DONE]\n\n';
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(events,{headers:{'content-type':'text/event-stream'}}));
 await collect(new ApiGenerator(config,observeModel(store,config,rates,null)),[{role:'user',content:'test'}],new AbortController().signal,'test');
 expect(store.usageTotals()).toMatchObject({requests:1,inputTokens:1000,outputTokens:100,cachedTokens:400,unknownTokens:0,pending:0});expect(store.usageTotals().estimatedCostUsd).toBeCloseTo(.00208);expect(store.usageRecords()[0].status).toBe('completed');
});
it('does not invent token totals when usage is absent and keeps failed attempts',async()=>{
 const {store}=fixture();const config={provider:'compatible' as const,baseURL:'https://mock.example/v1',model:'fixture',apiKey:'fake'};
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response('data: {"id":"x","choices":[{"delta":{"content":"OK"},"index":0}]}\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}})).mockResolvedValueOnce(new Response('{"error":{"message":"no"}}',{status:401,headers:{'content-type':'application/json'}}));
 const generator=new ApiGenerator(config,observeModel(store,config,rates,null));await collect(generator,[{role:'user',content:'t'}],new AbortController().signal,'test');await expect(collect(generator,[{role:'user',content:'t'}],new AbortController().signal,'test')).rejects.toThrow();
 expect(fetch).toHaveBeenCalledTimes(2);expect(store.usageTotals()).toMatchObject({requests:2,unknownTokens:2,failed:1,inputTokens:0,unpriced:2});expect(tokenCost(undefined,rates)).toBeNull();
});
it('persists speech audio and cost across reopen and deletes only meeting-associated usage',()=>{
 const {store,root}=fixture();const meeting:Meeting={id:'m',brief:{title:'t',goal:'',role:'',preparation:'',documents:[]},demo:false,status:'ended',createdAt:1,summary:''};store.meeting(meeting);
 store.usage({id:'speech',meetingId:'m',area:'speech',purpose:'recognition',provider:'elevenlabs',model:'scribe',status:'completed',inputTokens:0,outputTokens:0,cachedTokens:0,audioSeconds:3600,costUsd:.39,createdAt:1});
 const second=new Store(join(root,'store.sqlite'));stores.push(second);expect(second.usageTotals('m')).toMatchObject({speechConnections:1,audioSeconds:3600,estimatedCostUsd:.39});second.deleteMeeting('m');expect(second.usageTotals().requests).toBe(0);
});
it('merges durable evidence-backed questions without duplicates and respects manual resolution',()=>{
 const us=[utterance('one','Каков срок?'),utterance('two','До пятницы.',5)];const raw=JSON.stringify({summary:'Нужно согласовать срок.',items:[{kind:'question',text:'Каков срок?',utteranceIds:['one']},{kind:'decision',text:'Выдумано',utteranceIds:['missing']}]});
 const first=mergeMemory(undefined,raw,us);expect(first.memory.items).toHaveLength(1);first.memory.items[0].resolved=true;first.memory.items[0].manual=true;
 const second=mergeMemory(first.memory,raw,us);expect(second.memory.items).toHaveLength(1);expect(second.memory.items[0].resolved).toBe(true);
});
it('summarizes new finalized batches only and keeps earlier questions beyond the two-minute context',async()=>{
 const {store,settings}=fixture();const meeting:Meeting={id:'m',brief:{title:'t',goal:'Согласовать срок',role:'',preparation:'',documents:[]},demo:false,status:'paused',createdAt:1,summary:''};store.meeting(meeting);const inputs:any[]=[];
 const generator:Generator={async *stream(messages,_signal,purpose){if(purpose==='summary'){const input=JSON.parse(messages.at(-1)!.content);inputs.push(input);yield JSON.stringify({summary:'Сохраняем вопрос о сроках.',items:input.utterances.map((u:any)=>({kind:'question',text:u.text,utteranceIds:[u.id]}))});}}};
 const session=new Session(meeting,store,settings,new Documents(store,settings),{generator:()=>generator});sessions.push(session);
 session.ingest('a',[utterance('a:0','Каков срок?',1)]);await session.refreshMemory(true);session.ingest('b',[utterance('b:0','Какой бюджет?',600)]);await session.refreshMemory(true);
 expect(inputs).toHaveLength(2);expect(inputs[1].utterances).toHaveLength(1);expect(inputs[1].previousSummary).toContain('сроках');expect(session.meeting.memory?.items).toHaveLength(2);expect(store.getMeeting('m')?.memory?.items).toHaveLength(2);
});
it('clears model prices on model change while preserving speech rates',()=>{const {settings}=fixture();const next=settings.candidate(settingsSchema.parse({generation:{...settings.value.generation,model:'different'}}));expect(next.billing).toMatchObject({inputMillion:null,outputMillion:null,cachedMillion:null,elevenlabsHour:.39});});
it('drains a long meeting in bounded batches without skipping finalized utterances',async()=>{
 const {store,settings}=fixture();const meeting:Meeting={id:'m',brief:{title:'hour',goal:'Договориться о запуске',role:'',preparation:'',documents:[]},demo:true,status:'paused',createdAt:1,summary:''};store.meeting(meeting);const seen:string[]=[];
 const generator:Generator={async *stream(messages,_signal,purpose){if(purpose==='summary'){const input=JSON.parse(messages.at(-1)!.content);expect(input.utterances.length).toBeLessThanOrEqual(80);seen.push(...input.utterances.map((u:any)=>u.id));yield JSON.stringify({summary:'Сохраняем контекст запуска.',items:[{kind:'focus',text:'Запуск '+input.utterances[0].id,utteranceIds:[input.utterances[0].id]}]});}}};
 const session=new Session(meeting,store,settings,new Documents(store,settings),{generator:()=>generator});sessions.push(session);
 const all=Array.from({length:1200},(_,i)=>utterance('line:'+i,'Согласуем этап '+i,i*3+1));session.ingest('line',all);await session.end();
 expect(seen).toEqual(all.map(u=>u.id));expect(session.meeting.memory?.items).toHaveLength(15);expect(session.meeting.memoryThrough).toBe('line:1199');
});
it('records cancellation without inventing missing usage',async()=>{
 const {store}=fixture();const config={provider:'compatible' as const,baseURL:'https://mock.example/v1',model:'fixture',apiKey:'fake'};const abort=new AbortController();
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>new Promise((_resolve,reject)=>{options?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));setTimeout(()=>abort.abort(),10);}));
 await expect(collect(new ApiGenerator(config,observeModel(store,config,rates,null)),[{role:'user',content:'t'}],abort.signal,'test')).rejects.toThrow();
 expect(store.usageTotals()).toMatchObject({modelRequests:1,cancelled:1,unknownTokens:1,pending:0});
});
