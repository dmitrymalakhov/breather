import english from './locales/en.json';

export type Language = 'en' | 'ru';
const messages: Record<string, string> = english;
let language: Language = 'en';
try { if (localStorage.getItem('breather.language') === 'ru') language = 'ru'; } catch { /* Storage may be disabled. */ }
export const getLanguage = () => language;
export function setLanguage(next: Language) {
  language = next;
  try { localStorage.setItem('breather.language', next); } catch { /* Keep the session preference. */ }
}
/** Source-language keys keep existing server errors compatible with old histories. */
export function t(source: string, params: Record<string, string | number> = {}): string {
  const key = source.trim();
  const branded: Record<string, string> = { 'суфлёр': 'breather', 'Суфлёр, встреча': 'Breather, встреча', 'Суфлёр · мини-режим': 'Breather · мини-режим', 'Суфлёр покажет реплики и поможет с ответами.': 'Breather покажет реплики и поможет с ответами.', 'Разрешите всплывающие окна для Суфлёра и повторите запуск мини-режима.': 'Разрешите всплывающие окна для Breather и повторите запуск мини-режима.', 'Браузер не открыл окно поверх приложений. Попробуйте обычное окно или откройте Суфлёр в Chrome.': 'Браузер не открыл окно поверх приложений. Попробуйте обычное окно или откройте Breather в Chrome.' };
  const translated = language === 'en' ? messages[key] ?? key : branded[key] ?? key;
  const padded = source.slice(0, source.indexOf(key)) + translated + source.slice(source.indexOf(key) + key.length);
  return padded.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match));
}
export function message(source: string): string {
  if (messages[source.trim()]) return t(source);
  const original = Object.keys(messages).find(key => messages[key] === source.trim());
  if (original) return t(original);
  if (source === 'Failed to fetch' || source === 'Load failed') return t('Не удалось подключиться к локальному серверу.');
  const page = /^Страница (\d+)$/.exec(source);
  if (page) return language === 'en' ? 'Page ' + page[1] : source;
  // Validation errors append field paths. Do not translate arbitrary user content.
  const prefix = 'Проверьте поля формы: ';
  if (source.startsWith(prefix)) return t(prefix) + source.slice(prefix.length);
  return source;
}
export function speakerName(name: string): string {
  const match = /^Говорящий (\d+)$/.exec(name);
  return match ? t('Говорящий {p0}', { p0: match[1] }) : name === 'Разговор' ? t(name) : name;
}
export function plural(count: number, singular: string, few: string, many: string): string {
  const category = new Intl.PluralRules(language).select(count);
  return t(category === 'one' ? singular : category === 'few' ? few : many);
}
export const number = (value: number, digits?: number) => new Intl.NumberFormat(language, digits === undefined ? {} : { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
export const dateTime = (value: number) => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(value);

/** Translate only canned demo text, including partial streaming updates. */
export function demoText(source: string): string {
  if (messages[source]) return t(source);
  const complete = Object.keys(messages).find(key => !key.includes('{') && key.startsWith(source) && source.length > 0);
  if (complete) {
    const translated = t(complete);
    return translated.slice(0, Math.max(1, Math.round(translated.length * source.length / complete.length)));
  }
  return source;
}
