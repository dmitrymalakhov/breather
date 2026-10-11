import { t, message, demoText, getLanguage, setLanguage, speakerName, plural, number, dateTime, type Language } from './i18n';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { useMiniWindow } from './mini-window';
import { Waveform, Microphone as MicrophoneIcon, Play, Pause, Stop, ClockCounterClockwise, Files, ArrowRight, ArrowLeft, PushPin, X, UploadSimple, Trash, ArrowSquareOut, Check, CircleNotch, SlidersHorizontal, CaretDown, PictureInPicture, SidebarSimple } from '@phosphor-icons/react';
import type { Brief, PublicConfig, Snapshot, Meeting, DocumentInfo, Source, ServerEvent, Hint, UsageTotals } from '../shared/types';
import { Microphone } from './audio';
import '@fontsource-variable/onest';
import './style.css';

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api' + path, { method, ...(body instanceof FormData ? { body } : body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const result = await response.json(); if (!response.ok) throw new Error(result.message ?? t("Не удалось выполнить действие.")); return result as T;
}
const emptyBrief = (): Brief => ({ title: t("Новая встреча"), goal: '', role: '', preparation: 'Знаком с темой', documents: [] });
const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
function merge<T extends { id: string }>(list: T[], item: T): T[] { const found = list.some(old => old.id === item.id); return found ? list.map(old => old.id === item.id ? item : old) : [...list, item]; }
const hintLabels = { answer: 'Опора для ответа', term: 'Понятие в разговоре', prediction: 'Возможный вопрос', goal: 'Следующий шаг к цели' };
function App() {
  const [language, updateLanguage] = useState<Language>(getLanguage);
  useEffect(() => { document.documentElement.lang = language; document.title = 'Breather · ' + t('рядом с разговором'); }, [language]);
  function changeLanguage(next: Language) {
    const oldTitle = t('Новая встреча'); setLanguage(next); updateLanguage(next);
    setBrief(old => old.title === oldTitle ? { ...old, title: t('Новая встреча') } : old);
  }

  const [view, setView] = useState<'meeting' | 'settings' | 'documents' | 'history'>('meeting');
  const [totalUsage, setTotalUsage] = useState<UsageTotals | null>(null);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const mini = useMiniWindow();
  useEffect(() => { if (mini.target) { mini.target.window.document.documentElement.lang = language; mini.target.window.document.title = t('Суфлёр · мини-режим'); } }, [language, mini.target]);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [brief, setBrief] = useState<Brief>(emptyBrief);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [history, setHistory] = useState<Meeting[]>([]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [speech, setSpeech] = useState('idle');
  const [level, setLevel] = useState(0);
  const [follow, setFollow] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [documentView, setDocumentView] = useState<{ document: DocumentInfo; chunks: { id: string; text: string; location: string }[] } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const ws = useRef<WebSocket | null>(null);
  const mic = useRef<Microphone | null>(null);
  const current = useRef<Snapshot | null>(null);
  const lostAudio = useRef(false);
  current.current = snapshot;
  const active = snapshot?.meeting.status === 'active';
  const canNew = !snapshot || snapshot.meeting.status === 'ended';
  const ready = view === 'meeting' && !snapshot;
  const needsSetup = !(config?.speechProvider === 'elevenlabs' ? config.hasElevenlabsKey : config?.hasDeepgramKey) || !config?.hasGenerationKey;
  useEffect(() => { if (view === 'settings') void api<UsageTotals>('/usage').then(setTotalUsage).catch(() => {}); }, [view]);
  useEffect(() => {
    Promise.all([api<PublicConfig>('/config'), api<DocumentInfo[]>('/documents'), api<Meeting[]>('/meetings')]).then(([c, d, h]) => { setConfig(c); setDocuments(d); setHistory(h); }).catch(e => setError(e.message));
    const getDevices = () => navigator.mediaDevices?.enumerateDevices().then(list => setDevices(list.filter(d => d.kind === 'audioinput'))).catch(() => {});
    void getDevices(); navigator.mediaDevices?.addEventListener('devicechange', getDevices);
    const unload = () => { void mic.current?.stop(); ws.current?.close(); };
    window.addEventListener('pagehide', unload);
    return () => { unload(); window.removeEventListener('pagehide', unload); navigator.mediaDevices?.removeEventListener('devicechange', getDevices); };
  }, []);
  useEffect(() => {
    if (!snapshot) return;
    const tick = () => setElapsed(Math.floor(((snapshot.meeting.endedAt ?? Date.now()) - snapshot.meeting.createdAt) / 1000));
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [snapshot?.meeting.id, snapshot?.meeting.endedAt]);
  useEffect(() => { if (follow && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [snapshot?.utterances, follow, view]);
  useEffect(() => { if (!uploading) return; const timer = setInterval(() => void api<DocumentInfo[]>('/documents').then(setDocuments), 1000); return () => clearInterval(timer); }, [uploading]);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  function connect(id: string): Promise<void> {
    ws.current?.close(); const socket = ws.current = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/meetings/${id}/stream`);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { socket.close(); reject(new Error(t("Не удалось открыть поток. Повторите подключение."))); }, 5000);
      let ready = false;
      socket.onopen = () => {};
      socket.onerror = () => { clearTimeout(timeout); reject(new Error(t("Не удалось подключиться к локальному серверу."))); };
      socket.onmessage = message => {
        const event: ServerEvent = JSON.parse(message.data);
        if (event.type === 'error') { setError(event.data.message); return; }
        if (event.type === 'state') {
          setSpeech(event.data.speech);
          setSnapshot(old => old ? { ...old, meeting: { ...old.meeting, status: event.data.status } } : old);
          if (event.data.status !== 'active') { void mic.current?.stop(); setLevel(0); }
          if (!ready) { ready = true; clearTimeout(timeout); resolve(); }
          return;
        }
        setSnapshot(old => {
          if (event.type === 'snapshot') return event.data;
          if (!old) return old;
          if (event.type === 'utterance') return { ...old, utterances: merge(old.utterances, event.data).sort((a, b) => a.start - b.start) };
          if (event.type === 'speaker') return { ...old, speakers: merge(old.speakers, event.data) };
          if (event.type === 'hint') return { ...old, hints: merge(old.hints, event.data) };
          if (event.type === 'usage') return { ...old, usage: event.data };
          if (event.type === 'memory') return { ...old, meeting: { ...old.meeting, memory: event.data.memory, summary: event.data.summary } };
          if (event.type === 'metrics') return { ...old, metrics: event.data };
          return old;
        });
      };
      socket.onclose = () => {
        clearTimeout(timeout);
        if (!ready) reject(new Error(t("Встреча уже открыта в другой вкладке или сервер отключён.")));
        if (ws.current !== socket) return;
        void mic.current?.stop(); setLevel(0); setSpeech('disconnected');
        if (current.current?.meeting.status === 'active') {
          setError(t("Поток отключён. Микрофон остановлен. Нажмите «Продолжить», чтобы подключиться снова."));
          setSnapshot(old => old ? { ...old, meeting: { ...old.meeting, status: 'paused' } } : old);
          void api(`/meetings/${id}/pause`, 'POST').catch(() => {});
        }
      };
    });
  }
  async function start(demo = false) {
    await run(async () => {
      let session = snapshot;
      if (!session || session.meeting.status === 'ended') {
        session = await api<Snapshot>('/meetings', 'POST', { brief: { ...brief, language, title: demo ? t("Обсуждение голосового помощника") : brief.title || t("Новая встреча") }, demo });
        setSnapshot(session); setFollow(true);
      }
      const id = session.meeting.id;
      if (ws.current?.readyState !== WebSocket.OPEN) await connect(id);
      if (!session.meeting.demo) {
        const microphone = mic.current = new Microphone(); lostAudio.current = false;
        try {
          await microphone.start(device, (audio, capturedAt) => {
            if (ws.current?.readyState === WebSocket.OPEN && ws.current.bufferedAmount < 96000) {
              const framed = new ArrayBuffer(audio.byteLength + 8); new DataView(framed).setFloat64(0, capturedAt, true); new Uint8Array(framed, 8).set(new Uint8Array(audio)); ws.current.send(framed);
            }
          }, setLevel, () => {
            if (lostAudio.current) return; lostAudio.current = true;
            void microphone.stop(); setLevel(0); setError(t("Микрофон отключён или приостановлен системой. Проверьте устройство и нажмите «Продолжить».")); void api(`/meetings/${id}/pause`, 'POST').catch(() => {});
          });
          navigator.mediaDevices.enumerateDevices().then(list => setDevices(list.filter(d => d.kind === 'audioinput'))).catch(() => {});
        } catch (e) {
          const name = (e as DOMException).name;
          throw new Error(name === 'NotAllowedError' ? t("Разрешите доступ к микрофону в Chrome и настройках macOS, затем нажмите «Продолжить».") : name === 'NotFoundError' || name === 'OverconstrainedError' ? t("Микрофон не найден. Выберите другое устройство.") : (e as Error).message);
        }
      }
      try { await api(`/meetings/${id}/start`, 'POST'); } catch (e) { await mic.current?.stop(); throw e; }
      setSnapshot(old => old ? { ...old, meeting: { ...old.meeting, status: 'active' } } : old); setView('meeting');
    });
  }
  async function pause() { await run(async () => { await mic.current?.stop(); setLevel(0); await api(`/meetings/${snapshot!.meeting.id}/pause`, 'POST'); }); }
  async function end() { await run(async () => { await mic.current?.stop(); setLevel(0); await api(`/meetings/${snapshot!.meeting.id}/end`, 'POST'); setSnapshot(old => old ? { ...old, meeting: { ...old.meeting, status: 'ended', endedAt: Date.now() } } : old); ws.current?.close(); ws.current = null; setHistory(await api<Meeting[]>('/meetings')); }); }
  const newMeeting = () => { if (!canNew) { setView('meeting'); return; } mini.close(); setContextOpen(false); setSnapshot(null); setBrief({ ...emptyBrief(), documents: [] }); setSpeech('idle'); setView('meeting'); setError(''); };
  async function loadHistory(id: string) { await run(async () => { if (!canNew) throw new Error(t("Завершите текущую встречу перед открытием истории.")); ws.current?.close(); ws.current = null; setSnapshot(await api<Snapshot>(`/meetings/${id}`)); setSpeech('ended'); setView('meeting'); }); }
  async function upload(file: File) {
    setUploading(true); setError(''); const data = new FormData(); data.append('file', file);
    try { const document = await api<DocumentInfo>('/documents', 'POST', data); setDocuments(await api<DocumentInfo[]>('/documents')); if (document.status === 'error') setError(document.error ?? t("Документ не удалось прочитать.")); }
    catch (e) { setError((e as Error).message); } finally { setUploading(false); }
  }
  async function openSource(source: Source) { if (!source.documentId) return; await run(async () => { setDocumentView(await api(`/documents/${source.documentId}`)); setView('documents'); setTimeout(() => document.getElementById(source.id)?.scrollIntoView({ block: 'center' }), 100); }); }
  const hints = [...(snapshot?.hints ?? [])].filter(h => h.pinned || !h.stale).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt).slice(0, 3);
  const archivedHints = (snapshot?.hints ?? []).filter(h => !hints.some(current => current.id === h.id)).sort((a, b) => b.createdAt - a.createdAt);
  const working = view === 'meeting' && !!snapshot;
  const statusText = snapshot?.meeting.demo && active ? t("Демонстрация") : active ? ({ connecting: t("Подключение к речи"), listening: t("Слушаю встречу"), reconnecting: t("Восстанавливаю связь"), failed: t("Речь недоступна") }[speech] ?? t("Слушаю встречу")) : snapshot?.meeting.status === 'paused' ? t("На паузе") : snapshot ? t("Встреча завершена") : t("Готов к встрече");
  return <div className={'app-shell ' + (working ? 'workspace-shell' : '')}>
    <header className="topbar">
      <button className="brand" onClick={() => setView('meeting')} aria-label={t("Суфлёр, встреча")}><img className="brand-mark" src="/brand/breather-symbol.png" alt=""/><span className="brand-wordmark">{t("суфлёр")}<span className="brand-caption">{t("рядом с разговором")}</span></span></button>
      <nav aria-label={t("Разделы приложения")}>
        <button aria-current={view === 'documents' ? 'page' : undefined} className={view === 'documents' ? 'selected' : ''} onClick={() => { setView('documents'); setDocumentView(null); }}><Files size={16}/>{t("Документы")}</button>
        <button aria-current={view === 'history' ? 'page' : undefined} className={view === 'history' ? 'selected' : ''} onClick={() => { setView('history'); void api<Meeting[]>('/meetings').then(setHistory); }}><ClockCounterClockwise size={16}/>{t("История")}</button>
        <button aria-label={t("Настройки API")} aria-current={view === 'settings' ? 'page' : undefined} className={view === 'settings' ? 'selected' : ''} onClick={() => setView('settings')}><SlidersHorizontal size={16}/>{t("Настройки")}</button>
      </nav>
      <select className="language-select" aria-label={language === 'en' ? 'Interface language' : 'Язык интерфейса'} value={language} onChange={e => changeLanguage(e.target.value as Language)}><option value="en">English</option><option value="ru">Русский</option></select>
    </header>
    <main className={ready ? 'launch-main' : working ? 'meeting-main' : ''}>
      {!ready && !working && <header className="page-header"><div><h1>{view === 'meeting' ? snapshot?.meeting.brief.title : view === 'documents' ? t("Документы") : view === 'history' ? t("История встреч") : t("Настройки")}</h1>{view === 'history' && <p>{t("Реплики, подсказки и источники. Без записи аудио.")}</p>}</div>{snapshot && <div role="status" className={'status-badge ' + (active ? 'is-live' : '')}><span/>{statusText}</div>}</header>}
      {error && <div className="notice error" role="alert"><span>{message(error)}</span><button className="icon-button" onClick={() => setError('')} aria-label={t("Скрыть сообщение")}><X size={18}/></button></div>}
      {view === 'meeting' && <>
        {snapshot?.meeting.demo && <div className="demo-banner">{t("Демонстрация · вымышленные реплики и подготовленные подсказки. Микрофон и облачные API не используются.")}</div>}
        {!snapshot && <section className="launch-panel">
          <div className="launch-copy">
          <img className="launch-symbol" src="/brand/breather-symbol.png" alt=""/>
          <h1>{t("Начнём")}<br/>{' '}{t("встречу")}<span className="title-period">.</span></h1>
          <p>{needsSetup ? t("Подключите речь и модель один раз — затем начинайте одним нажатием.") : t("Суфлёр покажет реплики и поможет с ответами.")}</p>
          </div>
          <div className="launch-actions"><h2>{t("Ваш следующий разговор")}</h2>
          <div className="launch-microphone"><MicrophoneIcon size={18}/><select aria-label={t("Микрофон")} value={device} onChange={e => setDevice(e.target.value)}><option value="">{t("Микрофон по умолчанию")}</option>{devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || t("Микрофон {p0}", { p0: i + 1 })}</option>)}</select></div>
          <button className="button primary launch-button" disabled={busy || !config} onClick={() => needsSetup ? setView('settings') : void start(false)}>{busy ? <CircleNotch size={19} className="spin"/> : <Play size={18} weight="fill"/>}{busy ? t("Подключение…") : needsSetup ? t("Подключить API") : t("Начать встречу")}</button>
          <button className="text-button demo-button" disabled={busy || !config} onClick={() => void start(true)}>{t("Посмотреть пример")}<ArrowRight size={15}/></button>
          <span className="launch-note">{t("Аудио не сохраняется на этом Mac.")}<br/>{t("Распознавание и подсказки — через API.")}</span></div>
        </section>}
        {!snapshot && <details className="brief-panel"><summary>{t("Добавить вводные и материалы")}<span>{t("Необязательно")}</span></summary><div className="brief-fields">
          <label>{t("Название")}<input value={brief.title} onChange={e => setBrief({ ...brief, title: e.target.value })} maxLength={120}/></label>
          <label className="wide">{t("Ваша цель")}<input placeholder={t("Например, обсудить архитектуру и согласовать следующий шаг")} value={brief.goal} onChange={e => setBrief({ ...brief, goal: e.target.value })} maxLength={3000}/></label>
          <label>{t("Ваша роль")}<input placeholder={t("Например, руководитель проекта")} value={brief.role} onChange={e => setBrief({ ...brief, role: e.target.value })} maxLength={1000}/></label>
          <label>{t("Знакомство с темой")}<select value={brief.preparation} onChange={e => setBrief({ ...brief, preparation: e.target.value })}><option value="Знаком с темой">{t("Знаком с темой")}</option><option value="Нужны простые объяснения">{t("Нужны простые объяснения")}</option><option value="Хорошо разбираюсь, нужны детали">{t("Хорошо разбираюсь, нужны детали")}</option></select></label>
          {!!documents.filter(d => d.status === 'ready').length && <fieldset className="document-selection wide"><legend>{t("Материалы для этой встречи")}</legend>{documents.filter(d => d.status === 'ready').map(d => <label key={d.id}><input type="checkbox" checked={brief.documents.includes(d.id)} onChange={e => setBrief({ ...brief, documents: e.target.checked ? [...brief.documents, d.id] : brief.documents.filter(id => id !== d.id) })}/>{d.name}</label>)}</fieldset>}
        </div></details>}
        {snapshot && <div className="meeting-controls"><div className="meeting-identity"><h1 title={snapshot.meeting.brief.title}>{snapshot.meeting.brief.title}</h1><span role="status" className={'meeting-state ' + (active ? 'is-live' : '')}><span className={active ? 'live-dot' : 'quiet-dot'}/>{statusText}</span></div><div className="control-actions"><details className="device-menu"><summary aria-label={t("Настройки микрофона")} title={t("Выбрать микрофон")}><MicrophoneIcon size={17}/><meter min="0" max="1" value={level} aria-label={t("Уровень микрофона")}/><CaretDown size={12}/></summary><div className="audio-control"><select aria-label={t("Микрофон")} value={device} disabled={active} onChange={e => setDevice(e.target.value)}><option value="">{t("Микрофон по умолчанию")}</option>{devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || t("Микрофон {p0}", { p0: i + 1 })}</option>)}</select></div><p>{t("Сменить микрофон можно на паузе.")}</p></details>
          {snapshot && <span className="elapsed"><ClockCounterClockwise size={15}/>{formatTime(elapsed)}</span>}
          {active ? <><button className="button secondary" disabled={busy} onClick={() => void pause()}><Pause size={17}/>{t("Пауза")}</button><button className="button stop" disabled={busy} onClick={() => void end()}><Stop size={16}/>{t("Завершить")}</button></> : snapshot?.meeting.status === 'paused' ? <><button className="button primary" disabled={busy} onClick={() => void start(snapshot.meeting.demo)}><Play size={16} weight="fill"/>{t("Продолжить")}</button><button className="button secondary" disabled={busy} onClick={() => void end()}>{t("Завершить")}</button></> : <button className="button primary" disabled={busy} onClick={newMeeting}><Play size={16} weight="fill"/>{t("Новая встреча")}</button>}
        <button className="button secondary mini-trigger" onClick={() => void mini.open()} title={t("Вынести ответы в отдельное окно")}><PictureInPicture size={17}/>{t("Мини-режим")}</button><button className="button secondary context-trigger" aria-expanded={contextOpen} aria-controls="meeting-context" onClick={() => setContextOpen(!contextOpen)}><SidebarSimple size={17}/>{t("Контекст")}</button></div></div>}
        {mini.error && <div className="notice" role="alert"><span>{message(mini.error)}</span><button className="text-button" onClick={() => void mini.open(true)}>{t("Открыть обычное окно")}</button></div>}
        {snapshot && <div className={'meeting-workspace ' + (contextOpen ? 'with-context' : '')}>
        <div className="conversation-grid"><section className="transcript-panel"><div className="panel-heading"><h2>{t("Разговор")}</h2><span>{snapshot?.utterances.filter(u => !u.gap && u.final).length ?? 0} {plural(snapshot?.utterances.filter(u => !u.gap && u.final).length ?? 0, 'реплика', 'реплики', 'реплик')}</span></div><div className="transcript-scroll" ref={scroll} onScroll={() => { const el = scroll.current; if (el) setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 70); }}>
          {!(snapshot?.utterances.length) ? <div className="empty-transcript"><span className="empty-mark"><Waveform size={42} weight="light"/></span><h3>{t("Разговор начнётся здесь")}</h3><p>{t("Реплики появятся по мере речи.")}<br/>{!snapshot?.meeting.demo && config?.speechProvider === 'elevenlabs' ? t("ElevenLabs показывает общую ленту без меток голосов.") : t("Каждый голос получит свою метку.")}</p></div> : snapshot.utterances.map(u => u.gap ? <div key={u.id} className="gap-message">{message(u.text)}</div> : <article id={'utterance-' + u.id} key={u.id} className={'utterance ' + (!u.final ? 'interim' : '')}><div className="speaker-avatar">{snapshot.speakers.find(s => s.id === u.speakerId)?.name ? speakerName(snapshot.speakers.find(s => s.id === u.speakerId)!.name).charAt(0) : t("Г")}</div><div className="utterance-content"><div className="utterance-meta"><SpeakerName name={speakerName(snapshot.speakers.find(s => s.id === u.speakerId)?.name ?? t("Участник"))} isSelf={snapshot.speakers.find(s => s.id === u.speakerId)?.isSelf ?? false} editable={snapshot.meeting.status !== 'ended' && !u.speakerId.endsWith(':elevenlabs:unknown')} onSave={(name, isSelf) => void run(async () => { await api(`/meetings/${snapshot.meeting.id}/speakers/${encodeURIComponent(u.speakerId)}`, 'PUT', { name, isSelf }); })}/><time>{formatTime(u.start)}</time>{!u.final && <span className="interim-label">{t("уточняется")}</span>}</div><p>{snapshot.meeting.demo ? demoText(u.text) : u.text}</p></div></article>)}
        </div>{!follow && <button className="follow-button" onClick={() => { setFollow(true); if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }}>{t("К новым репликам")}<ArrowRight size={14}/></button>}<div className="transcript-footer"><span className={active ? 'live-dot' : 'quiet-dot'}/>{active ? t("Речь обрабатывается непрерывно") : t("Аудио не сохраняется")}</div></section>
        <section className="hints-panel"><div className="panel-heading"><h2>{t("Подсказки")}</h2><span className="hint-count">{hints.length}/3</span></div><div className="hint-list">{hints.length ? hints.map(hint => <HintCard key={hint.id} hint={snapshot.meeting.demo ? { ...hint, title: demoText(hint.title), body: demoText(hint.body) } : hint} editable={snapshot?.meeting.status !== 'ended'} onPin={() => void run(async () => { await api(`/meetings/${snapshot!.meeting.id}/hints/${hint.id}`, 'PUT', { pinned: !hint.pinned }); })} onSource={source => void openSource(source)}/>) : <div className="empty-hints"><span className="hint-symbol"><Waveform size={25}/></span><h3>{t("Нужная мысль вовремя")}</h3><p>{t("Здесь появятся короткие ответы, объяснения и возможные вопросы.")}</p></div>}</div>{!!archivedHints.length && <details className="hint-archive"><summary>{t("Ранее в разговоре · ")}{archivedHints.length}</summary><div className="hint-list">{archivedHints.map(hint => <HintCard key={hint.id} hint={snapshot.meeting.demo ? { ...hint, title: demoText(hint.title), body: demoText(hint.body) } : hint} editable={snapshot?.meeting.status !== 'ended'} onPin={() => void run(async () => { await api(`/meetings/${snapshot!.meeting.id}/hints/${hint.id}`, 'PUT', { pinned: !hint.pinned }); })} onSource={source => void openSource(source)}/>)}</div></details>}<div className="hint-footer">{snapshot?.metrics.samples ? <details className="metrics-details"><summary>{t("Подсказка: p50 ")}{snapshot.metrics.hintP50}{t(" мс · p95 ")}{snapshot.metrics.hintP95}{t(" мс")}{snapshot.meeting.demo ? t(" · пример") : ''}</summary><p>{t("Модель: p50 ")}{snapshot.metrics.modelP50 ?? '—'}{t(" мс · p95 ")}{snapshot.metrics.modelP95 ?? '—'}{t(" мс")}</p><p>{t("Распознавание, последняя реплика: ")}{snapshot.metrics.sttLastMs === null ? '—' : t("{p0} мс", { p0: snapshot.metrics.sttLastMs })}</p><p>{t("От конца реплики до ответа: p50 ")}{snapshot.metrics.questionP50 ?? '—'}{t(" мс · p95 ")}{snapshot.metrics.questionP95 ?? '—'}{t(" мс")}</p><p>{t("Подсказок в замере: ")}{snapshot.metrics.samples}{t(". До первого законченного предложения.")}</p></details> : t("Предварительные ответы требуют проверки.")}</div></section></div><aside id="meeting-context" className="context-sidebar" hidden={!contextOpen}><div className="context-heading"><h2>{t("Контекст и расход")}</h2><button className="icon-button" aria-label={t("Закрыть контекст")} onClick={() => setContextOpen(false)}><X size={18}/></button></div><MeetingOverview snapshot={snapshot} busy={memoryBusy} onRefresh={async () => { setMemoryBusy(true); try { await run(async () => setSnapshot(await api<Snapshot>(`/meetings/${snapshot.meeting.id}/memory`, 'POST'))); } finally { setMemoryBusy(false); } }} onGoal={goal => void run(async () => { const brief = { ...snapshot.meeting.brief, goal }; await api(`/meetings/${snapshot.meeting.id}/brief`, 'PUT', brief); setSnapshot(old => old ? { ...old, meeting: { ...old.meeting, brief } } : old); })} onResolve={(id, resolved) => void run(async () => { await api(`/meetings/${snapshot.meeting.id}/memory/${id}`, 'PUT', { resolved }); })} onJump={id => { setFollow(false); if (window.innerWidth < 1000) setContextOpen(false); document.getElementById('utterance-' + id)?.scrollIntoView({ block: 'center', behavior: 'instant' }); }}/><UsagePanel usage={snapshot.usage} demo={snapshot.meeting.demo}/></aside></div>}
      </>}
      {view === 'settings' && config && <SettingsPanel config={config} totalUsage={totalUsage} onSave={async value => { await run(async () => { setConfig(await api<PublicConfig>('/config', 'PUT', value)); setView('meeting'); }); }} busy={busy}/>}
      {view === 'documents' && <section className="content-page">
        {documentView ? <><button className="text-button" onClick={() => setDocumentView(null)}><ArrowLeft size={17}/>{t("Все документы")}</button><h2>{documentView.document.name}</h2><div className="document-reader">{documentView.chunks.map(c => <article id={c.id} key={c.id}><h3>{message(c.location)}</h3><p>{c.text}</p></article>)}</div></> : <><label className={'upload-zone ' + (uploading ? 'uploading' : '')}><UploadSimple size={30}/><strong>{uploading ? t("Индексирую документ…") : t("Добавить документ")}</strong><span>{t("PDF с текстом, TXT или Markdown · до 20 МБ")}</span><input type="file" accept=".pdf,.txt,.md" disabled={uploading} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ''; }}/></label><p className="helper">{t("Индекс строится заранее. Для смыслового поиска используются embeddings API; без ключа работает поиск по словам.")}</p><div className="document-list">{documents.map(d => <div key={d.id} className="document-row"><Files size={24}/><div><strong>{d.name}</strong><span>{d.status === 'indexing' ? t("Индексирование…") : d.status === 'error' ? message(d.error ?? '') : t("{p0} фрагментов · {p1}", { p0: d.chunks, p1: d.semantic ? t('смысловой поиск') : t('поиск по словам') })}</span>{d.status !== 'error' && d.error && <span className="warning-text">{message(d.error)}</span>}</div><button className="icon-button" aria-label={t("Открыть {p0}", { p0: d.name })} disabled={d.status !== 'ready'} onClick={() => void run(async () => { setDocumentView(await api(`/documents/${d.id}`)); })}><ArrowRight size={19}/></button><button className="icon-button" aria-label={t("Удалить {p0}", { p0: d.name })} disabled={uploading} onClick={() => void run(async () => { await api(`/documents/${d.id}`, 'DELETE'); setDocuments(await api('/documents')); setBrief(old => ({ ...old, documents: old.documents.filter(id => id !== d.id) })); })}><Trash size={18}/></button></div>)}</div>{!documents.length && <p className="empty-page-note">{t("Материалы пока не добавлены. Выберите файл с вводными, описанием технологии или заметками.")}</p>}</>}
      </section>}
      {view === 'history' && <section className="content-page"><div className="history-list">{history.map(m => <article className="history-row" key={m.id}><span className="history-icon"><ClockCounterClockwise size={25}/></span><div><h2>{m.brief.title}</h2><p>{dateTime(m.createdAt)} · {m.demo ? t("Демонстрация") : m.status === 'ended' ? t("Завершена") : t("В процессе")}</p></div><button className="button secondary" onClick={() => void loadHistory(m.id)} disabled={busy || !canNew}>{t("Открыть")}<ArrowRight size={16}/></button><button className="icon-button" aria-label={t("Удалить встречу {p0}", { p0: m.brief.title })} disabled={busy || m.status !== 'ended'} onClick={() => void run(async () => { await api(`/meetings/${m.id}`, 'DELETE'); setHistory(await api('/meetings')); if (snapshot?.meeting.id === m.id) setSnapshot(null); })}><Trash size={18}/></button></article>)}</div>{!history.length && <div className="empty-page"><ClockCounterClockwise size={36}/><h2>{t("Здесь будут ваши встречи")}</h2><p>{t("После завершения сохранятся реплики, подсказки и использованные источники.")}</p></div>}</section>}
    </main>
    {mini.target && snapshot && createPortal(<MiniPanel hints={hints} snapshot={snapshot} status={statusText} elapsed={elapsed} busy={busy} error={error} floating={mini.target.floating} onPause={() => void pause()} onResume={() => void start(snapshot.meeting.demo)} onBack={() => { window.focus(); setView('meeting'); mini.close(); }} onPin={hint => void run(async () => { await api(`/meetings/${snapshot.meeting.id}/hints/${hint.id}`, 'PUT', { pinned: !hint.pinned }); })} onSource={source => { window.focus(); void openSource(source); }}/>, mini.target.container)}
  </div>;
}
function MiniPanel({ hints, snapshot, status, elapsed, busy, error, floating, onPause, onResume, onBack, onPin, onSource }: { hints: Hint[]; snapshot: Snapshot; status: string; elapsed: number; busy: boolean; error: string; floating: boolean; onPause: () => void; onResume: () => void; onBack: () => void; onPin: (hint: Hint) => void; onSource: (source: Source) => void }) {
  return <div className="mini-panel"><header className="mini-header"><div><img src="/brand/breather-symbol.png" alt=""/><strong>{t("суфлёр")}</strong></div><button className="icon-button" onClick={onBack} aria-label={t("Вернуться к встрече")}><ArrowSquareOut size={18}/></button></header><div className="mini-status"><span role="status">{status}</span><time>{formatTime(elapsed)}</time>{snapshot.meeting.status === 'active' ? <button className="text-button" disabled={busy} onClick={onPause}><Pause size={14}/>{t("Пауза")}</button> : snapshot.meeting.status === 'paused' ? <button className="text-button" disabled={busy} onClick={onResume}><Play size={14}/>{t("Продолжить")}</button> : null}</div>{snapshot.meeting.demo && <p className="mini-demo">{t("Демонстрация · вымышленные ответы")}</p>}{error && <p className="mini-error" role="alert">{message(error)}</p>}<div className="mini-hints">{hints.length ? hints.map(hint => <HintCard key={hint.id} hint={snapshot.meeting.demo ? { ...hint, title: demoText(hint.title), body: demoText(hint.body) } : hint} editable={snapshot.meeting.status !== 'ended'} onPin={() => onPin(hint)} onSource={onSource}/>) : <div className="mini-empty"><Waveform size={28}/><h2>{t("Слушайте собеседника")}</h2><p>{t("Ответы появятся здесь по ходу разговора.")}</p></div>}</div><footer>{floating ? t("Ответы поверх других окон") : t("Обычное окно · закрепление поверх окон доступно в Chrome")}<span>{t("Основная вкладка должна оставаться открытой.")}</span></footer></div>;
}

function UsagePanel({ usage, demo = false, global = false }: { usage?: UsageTotals; demo?: boolean; global?: boolean }) {
  if (demo) return <p className="usage-demo">{t("Демонстрация · платных запросов нет")}</p>;
  if (!usage) return <p className="helper">{t("Учёт расхода начинается после обновления приложения.")}</p>;
  return <details className="usage-panel"><summary><span>{global ? t("За сохранённые встречи и проверки API") : t("Расход встречи")}<CaretDown className="disclosure-caret" size={14}/></span><span>≈ ${number(usage.estimatedCostUsd, 4)}{usage.unpriced > 0 ? t(" + неизвестная часть") : ''} · {usage.modelRequests} {plural(usage.modelRequests, 'запрос модели', 'запроса модели', 'запросов модели')}</span></summary>
    <dl><div><dt>{t("Отправлено аудио")}</dt><dd>{number(usage.audioSeconds / 60, 1)}{t(" мин")}</dd></div><div><dt>{t("Подключений речи")}</dt><dd>{usage.speechConnections}</dd></div><div><dt>{t("Входные токены")}</dt><dd>{number(usage.inputTokens)}</dd></div><div><dt>{t("Из них из кэша")}</dt><dd>{number(usage.cachedTokens)}</dd></div><div><dt>{t("Выходные токены")}</dt><dd>{number(usage.outputTokens)}</dd></div><div><dt>{t("Ошибки / отмены / в работе")}</dt><dd>{usage.failed} / {usage.cancelled} / {usage.pending}</dd></div></dl>
    <p className="helper">{t("Токены — из usage API; для ")}{usage.unknownTokens}{t(" запросов данные не получены и в сумму токенов не входят. Стоимость — оценка по сохранённым тарифам, без налогов, округления и скидок плана; счёт провайдера может отличаться. Embeddings и веб-поиск пока не включены. Старая история до включения учёта не восстановлена.")}</p>
  </details>;
}
function MeetingOverview({ snapshot, busy, onRefresh, onGoal, onResolve, onJump }: { snapshot: Snapshot; busy: boolean; onRefresh: () => void; onGoal: (goal: string) => void; onResolve: (id: string, resolved: boolean) => void; onJump: (id: string) => void }) {
  const [tab, setTab] = useState<'focus' | 'question' | 'decision'>('question');
  const [editing, setEditing] = useState(false); const [goal, setGoal] = useState(snapshot.meeting.brief.goal);
  useEffect(() => setGoal(snapshot.meeting.brief.goal), [snapshot.meeting.brief.goal]);
  const items = snapshot.meeting.memory?.items ?? []; const openQuestions = items.filter(i=>i.kind==='question' && !i.resolved).length; const selected = items.filter(i=>i.kind===tab); const editable = snapshot.meeting.status !== 'ended';
  return <details className="memory-panel" open><summary><span>{t("Фокус встречи")}<CaretDown className="disclosure-caret" size={14}/></span><span>{openQuestions} {plural(openQuestions, 'открытый вопрос', 'открытых вопроса', 'открытых вопросов')}</span></summary>
    <div className="goal-line">{editing ? <form onSubmit={e=>{e.preventDefault();onGoal(goal.trim());setEditing(false);}}><label>{t("Цель встречи")}<input autoFocus maxLength={3000} value={goal} onChange={e=>setGoal(e.target.value)} placeholder={t("Какой результат нужен к концу разговора?")}/></label><button className="button primary">{t("Сохранить цель")}</button><button type="button" className="text-button" onClick={()=>setEditing(false)}>{t("Отмена")}</button></form> : <><div><span className="helper">{t("Цель встречи")}</span><p>{snapshot.meeting.brief.goal || t("Задайте результат, к которому хотите прийти.")}</p></div>{editable && <button className="text-button" onClick={()=>setEditing(true)}>{snapshot.meeting.brief.goal ? t("Изменить цель") : t("Задать цель")}</button>}</>}</div>
    <div className="memory-toolbar"><div className="memory-tabs" role="group" aria-label={t("Раздел конспекта")}>{(['question','focus','decision'] as const).map(kind=><button key={kind} aria-pressed={tab===kind} onClick={()=>setTab(kind)}>{({question:t("Вопросы"),focus:t("Фокусы"),decision:t("Решения")})[kind]}<span>{items.filter(i=>i.kind===kind).length}</span></button>)}</div><button className="text-button" disabled={busy || !editable} onClick={onRefresh}>{busy ? t("Обновляю…") : t("Обновить конспект")}</button></div>
    {snapshot.meeting.memory?.error && <p role="status" className="helper">{message(snapshot.meeting.memory.error)}</p>}
    {!selected.length ? <p className="memory-empty">{t("Здесь появятся ")}{({question:t("поставленные вопросы"),focus:t("основные темы"),decision:t("принятые решения")})[tab]}{t(" со ссылками на реплики. Конспект обновляется примерно раз в минуту и при завершении встречи.")}</p> : <ul className="memory-list">{selected.map(item=><li key={item.id} className={item.resolved ? 'resolved' : ''}><span>{snapshot.meeting.demo ? t(item.text) : item.text}</span><div>{item.utteranceIds.slice(-2).map(id=>{const u=snapshot.utterances.find(u=>u.id===id);return u ? <button key={id} className="text-button" aria-label={t("К реплике ") + formatTime(u.start)} onClick={()=>onJump(id)}>{formatTime(u.start)}<ArrowRight size={12}/></button> : null;})}{item.kind==='question' && editable ? <button className="text-button" onClick={()=>onResolve(item.id,!item.resolved)}>{item.resolved ? t("Открыть снова") : t("Отметить отвеченным")}</button> : item.resolved && <span className="helper">{t("Отвечен")}</span>}</div></li>)}</ul>}
    {!!snapshot.meeting.summary && <details className="memory-summary"><summary>{t("Краткий конспект")}</summary><p>{snapshot.meeting.demo ? t(snapshot.meeting.summary) : snapshot.meeting.summary}</p></details>}
  </details>;
}
function SpeakerName({ name, isSelf, editable, onSave }: { name: string; isSelf: boolean; editable: boolean; onSave: (name: string, self: boolean) => void }) {
  const [editing, setEditing] = useState(false); const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  if (editing) return <form className="speaker-edit" onSubmit={e => { e.preventDefault(); if (value.trim()) { onSave(value.trim(), isSelf); setEditing(false); } }}><input aria-label={t("Имя участника")} value={value} onChange={e => setValue(e.target.value)} maxLength={80} autoFocus/><button aria-label={t("Сохранить имя")}><Check size={14}/></button><button type="button" onClick={() => setEditing(false)} aria-label={t("Отменить переименование")}><X size={14}/></button><label><input type="checkbox" checked={isSelf} onChange={e => onSave(value.trim() || name, e.target.checked)}/>{t("Это я")}</label></form>;
  return <button disabled={!editable} className="speaker-name" onClick={() => setEditing(true)} title={editable ? t("Переименовать или отметить «Это я»") : undefined}>{name}{isSelf && <span>{t("вы")}</span>}</button>;
}
function HintCard({ hint, editable, onPin, onSource }: { hint: Hint; editable: boolean; onPin: () => void; onSource: (s: Source) => void }) {
  return <article className={'hint-card ' + (hint.pinned ? 'pinned' : '')}><div className="hint-meta"><span>{t(hintLabels[hint.kind])}</span><button className={'icon-button ' + (hint.pinned ? 'is-pinned' : '')} disabled={!editable} onClick={onPin} aria-label={hint.pinned ? t("Открепить подсказку") : t("Закрепить подсказку")} aria-pressed={hint.pinned}><PushPin size={17} weight={hint.pinned ? 'fill' : 'regular'}/></button></div><h3>{hint.title}</h3><p className={!hint.complete ? 'streaming-text' : ''}>{hint.body}</p><div className="hint-stage"><span className={'stage-dot ' + (hint.stage === 'grounded' ? 'grounded' : '')}/>{hint.stage === 'grounded' ? t("Дополнено по источникам") : t("Предварительно")}{hint.stale && t(" · из предыдущего контекста")}</div>{!!hint.sources.length && <details className="sources"><summary>{t("Источники · ")}{hint.sources.length}</summary>{hint.sources.map((s, i) => <div className="source" key={s.id}><strong>[{i + 1}] {s.title}</strong><span>{message(s.location)}</span><details><summary>{t("Показать фрагмент")}</summary><p>{s.excerpt}</p></details>{s.kind === 'web' ? <a href={s.url} target="_blank" rel="noreferrer">{t("Открыть источник")}<ArrowSquareOut size={14}/></a> : <button onClick={() => onSource(s)}>{t("Открыть документ")}<ArrowRight size={14}/></button>}</div>)}</details>}</article>;
}
function SettingsPanel({ config, onSave, busy, totalUsage }: { config: PublicConfig; onSave: (value: unknown) => Promise<void>; busy: boolean; totalUsage: UsageTotals | null }) {
  const initial = () => ({ generation: { ...config.generation, apiKey: '' }, billing: { ...(config.billing ?? { deepgramHour: 0.468, elevenlabsHour: 0.39, inputMillion: null, outputMillion: null, cachedMillion: null }) }, speechOptions: { ...(config.speechOptions ?? { language: 'auto' as const, silenceMs: 500 }) }, speechProvider: config.speechProvider ?? 'deepgram', elevenlabsKey: '', deepgramKey: '', tavilyKey: '', embedding: { baseURL: config.embedding.baseURL, model: config.embedding.model, apiKey: '' } });
  const [values, setValues] = useState(initial);
  useEffect(() => setValues(initial()), [config]);
  return <form className="settings-page" onInvalidCapture={event => { let details = (event.target as HTMLElement).closest('details'); while (details) { details.open = true; details = details.parentElement?.closest('details') ?? null; } }} onSubmit={async e => { e.preventDefault(); await onSave({ ...values, generation: { ...values.generation, apiKey: values.generation.apiKey || undefined }, deepgramKey: values.deepgramKey || undefined, elevenlabsKey: values.elevenlabsKey || undefined, tavilyKey: values.tavilyKey || undefined, embedding: { ...values.embedding, apiKey: values.embedding.apiKey || undefined } }); }}>
    <p className="settings-lead">{t("Для начала нужны два ключа. Они сохранятся на этом Mac.")}</p>
    <section className="settings-section">
      <div className="settings-intro"><h2>{t("Распознавание речи")}</h2></div>
      <div className="settings-fields">
        <label className="wide">{t("Сервис распознавания")}<select aria-label={t("Сервис распознавания")} value={values.speechProvider} onChange={e => setValues({ ...values, speechProvider: e.target.value as 'deepgram' | 'elevenlabs' })}><option value="deepgram">Deepgram · Nova-3</option><option value="elevenlabs">ElevenLabs · Scribe v2 Realtime</option></select></label>
        {values.speechProvider === 'elevenlabs' ? <label className="wide">{t("ElevenLabs API-ключ")}{config.hasElevenlabsKey && <span className="configured">{t("Сохранён")}</span>}<input aria-label={t("ElevenLabs API-ключ")} type="password" autoComplete="new-password" value={values.elevenlabsKey} placeholder={config.hasElevenlabsKey ? t("Пустое поле сохраняет текущий ключ") : t("Введите ключ ElevenLabs")} onChange={e => setValues({ ...values, elevenlabsKey: e.target.value })}/></label> : <label className="wide">{t("Deepgram API-ключ")}{config.hasDeepgramKey && <span className="configured">{t("Сохранён")}</span>}<input aria-label={t("Deepgram API-ключ")} type="password" autoComplete="new-password" value={values.deepgramKey} placeholder={config.hasDeepgramKey ? t("Пустое поле сохраняет текущий ключ") : t("Введите ключ Deepgram")} onChange={e => setValues({ ...values, deepgramKey: e.target.value })}/></label>}
        <details className="connection-options wide"><summary>{t("Язык и скорость распознавания")}</summary><div className="settings-fields">
          <label>{t("Язык встречи")}<select aria-label={t("Язык встречи")} value={values.speechOptions.language} onChange={e => setValues({ ...values, speechOptions: { ...values.speechOptions, language: e.target.value as 'auto' | 'ru' } })}><option value="auto">{t("Авто · смешанная речь")}</option><option value="ru">{t("Русский")}</option></select></label>
          <label>{t("Пауза для завершения реплики")}<select aria-label={t("Пауза для завершения реплики")} value={values.speechOptions.silenceMs} onChange={e => setValues({ ...values, speechOptions: { ...values.speechOptions, silenceMs: Number(e.target.value) } })}><option value={500}>{t("500 мс · сбалансированно")}</option><option value={300}>{t("300 мс · быстрее")}</option><option value={1000}>{t("1000 мс · длинные реплики")}</option></select></label>
          <p className="helper wide">{t("Короткая пауза быстрее завершает текст, но может разбивать одну фразу на части. Проверьте на своей речи. Пауза встречи останавливает передачу аудио и новые расходы на распознавание.")}</p>
        </div></details>
        <p className="helper wide">{t("Аудио передаётся в ")}{values.speechProvider === 'elevenlabs' ? 'ElevenLabs' : 'Deepgram'}{t(" и не записывается на диск этого Mac. ")}{values.speechProvider === 'elevenlabs' ? t("Реплики идут общей лентой без разделения участников.") : t("Каждый голос получает свою метку.")}{t(" Подключение речи проверяется при начале встречи. Для смены сервиса во время встречи нажмите «Пауза».")}</p>
      </div>
    </section>
    <section className="settings-section">
      <div className="settings-intro"><h2>{t("Модель подсказок")}</h2></div>
      <div className="settings-fields"><label className="wide">{t("API-ключ модели")}{config.hasGenerationKey && <span className="configured">{t("Сохранён")}</span>}<input type="password" autoComplete="new-password" placeholder={config.hasGenerationKey ? t("Пустое поле сохраняет текущий ключ") : t("Введите ключ OpenAI или выбранного провайдера")} value={values.generation.apiKey} onChange={e => setValues({ ...values, generation: { ...values.generation, apiKey: e.target.value } })}/></label>
        <details className="connection-options wide"><summary>{t("Выбрать модель или API")}<span>{values.generation.provider === 'openai' ? 'OpenAI' : t("Совместимый API")} · {values.generation.model}</span></summary><div className="settings-fields">
          <label>{t("Провайдер")}<select value={values.generation.provider} onChange={e => setValues({ ...values, generation: { ...values.generation, provider: e.target.value as 'openai' | 'compatible' }, billing: { ...values.billing, inputMillion: null, outputMillion: null, cachedMillion: null } })}><option value="openai">OpenAI · Responses API</option><option value="compatible">{t("OpenAI-совместимый API")}</option></select></label>
          <label>Model ID<input required value={values.generation.model} onChange={e => setValues({ ...values, generation: { ...values.generation, model: e.target.value }, billing: { ...values.billing, inputMillion: null, outputMillion: null, cachedMillion: null } })}/></label>
          <label className="wide">{t("Адрес API")}<input type="url" required value={values.generation.baseURL} onChange={e => setValues({ ...values, generation: { ...values.generation, baseURL: e.target.value }, billing: { ...values.billing, inputMillion: null, outputMillion: null, cachedMillion: null } })}/></label>
          <p className="helper wide">{t("Новое подключение проверяется до сохранения. Во время встречи смена модели не прерывает речь.")}</p>
        </div></details>
      </div>
    </section>
    <details className="extra-connections"><summary>{t("Поиск по документам и в интернете")}<span>{t("Необязательно")}</span></summary>
      <section className="settings-section"><div className="settings-intro"><h2>{t("Смысловой поиск")}</h2></div><div className="settings-fields">
        <label>Model ID<input required value={values.embedding.model} onChange={e => setValues({ ...values, embedding: { ...values.embedding, model: e.target.value } })}/></label>
        <label>{t("Адрес API")}<input type="url" required value={values.embedding.baseURL} onChange={e => setValues({ ...values, embedding: { ...values.embedding, baseURL: e.target.value } })}/></label>
        <label className="wide">{t("API-ключ embeddings")}{config.embedding.hasKey && <span className="configured">{t("Сохранён")}</span>}<input type="password" autoComplete="new-password" placeholder={t("Можно оставить пустым для ключа OpenAI")} value={values.embedding.apiKey} onChange={e => setValues({ ...values, embedding: { ...values.embedding, apiKey: e.target.value } })}/></label>
        <p className="helper wide">{t("Текст документов передаётся в embeddings API при индексировании. Без ключа работает поиск по словам. При смене embeddings загрузите документы заново.")}</p>
      </div></section>
      <section className="settings-section"><div className="settings-intro"><h2>{t("Веб-поиск")}</h2></div><div className="settings-fields"><label className="wide">{t("Tavily API-ключ")}{config.hasTavilyKey && <span className="configured">{t("Сохранён")}</span>}<input type="password" autoComplete="new-password" placeholder={t("Необязательно")} value={values.tavilyKey} onChange={e => setValues({ ...values, tavilyKey: e.target.value })}/></label></div></section>
    </details>
    <details className="extra-connections billing-options"><summary>{t("Расход и тарифы")}<span>{t("USD · оценка по вашему тарифу")}</span></summary>
      <div className="settings-fields">
        {(['deepgramHour','elevenlabsHour','inputMillion','outputMillion','cachedMillion'] as const).map(key => <label key={key}>{({ deepgramHour: t("Deepgram · $ за час"), elevenlabsHour: t("ElevenLabs · $ за час"), inputMillion: t("Модель · $ за 1 млн входных токенов"), outputMillion: t("Модель · $ за 1 млн выходных токенов"), cachedMillion: t("Модель · $ за 1 млн токенов из кэша") })[key]}<input type="number" min="0" step="any" value={values.billing[key] ?? ''} placeholder={t("Не задан")} onChange={e => setValues({ ...values, billing: { ...values.billing, [key]: e.target.value === '' && key !== 'deepgramHour' && key !== 'elevenlabsHour' ? null : Number(e.target.value) } })}/></label>)}
        <p className="helper wide">{t("Стартовые ставки речи — публичные цены API на 11.10.2026; Deepgram включает временную цену Nova-3 Multilingual и диаризацию. Введите цены своего плана. Тарифы модели привязаны к текущей модели и адресу: при смене перепроверьте их. Без тарифов стоимость модели неизвестна; токены всё равно считаются. Исторические оценки сохраняются с прежними ставками.")}</p>
      </div>
      <UsagePanel usage={totalUsage ?? undefined} global/>
    </details>
    <div className="settings-actions"><span>{busy ? t("Проверяю модель…") : t("После сохранения вернёмся к встрече")}</span><button className="button primary" type="submit" disabled={busy}>{busy ? <CircleNotch size={17} className="spin"/> : <Check size={17}/>}{t("Проверить и сохранить")}</button></div>
  </form>;
}
createRoot(document.getElementById('root')!).render(<App/>);
