import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { UI } from './i18n.js';
import FarmForm, { EMPTY_FORM, formToPayload, scenarioToForm } from './components/FarmForm.jsx';
import Dashboard from './components/Dashboard.jsx';
import Chat from './components/Chat.jsx';

const KEY = 'cia.saved.v1';
const readSaved = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };

export default function App() {
  const saved = readSaved();
  const [lang, setLang] = useState(saved?.lang || 'en');
  const ui = UI[lang];
  const [health, setHealth] = useState(null);
  const [healthFailed, setHealthFailed] = useState(false);
  const [sample, setSample] = useState(null);
  const [form, setForm] = useState(saved?.form || EMPTY_FORM);
  const [advisory, setAdvisory] = useState(saved?.advisory || null);
  const [savedCopy, setSavedCopy] = useState(Boolean(saved));
  const [savedAt, setSavedAt] = useState(saved?.saved_at || null);
  const [remember, setRemember] = useState(Boolean(saved));
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [copyMsg, setCopyMsg] = useState('');

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealthFailed(true));
    api.sample().then(setSample).catch(() => {});
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => { if (!remember) { try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ } } }, [remember]);

  const run = useCallback(async (f, language) => {
    setLoading(true); setError(''); setFieldErrors({}); setOffline(false); setCopyMsg('');
    try {
      const a = await api.advisory(formToPayload(f, language));
      setAdvisory(a); setSavedCopy(false);
      if (remember) {
        const stamp = new Date().toISOString();
        try { localStorage.setItem(KEY, JSON.stringify({ form: f, advisory: a, lang: language, saved_at: stamp })); setSavedAt(stamp); } catch { /* storage full or blocked */ }
      }
    } catch (e) {
      // Keep whatever result is already on screen; a failed refresh must not wipe it.
      if (e.message === 'network') setOffline(true);
      else if (e.errors && e.errors.length) setFieldErrors(Object.fromEntries(e.errors.map((x) => [x.field, x.message])));
      else setError(e.message);
      if (e.errors?.length) setError(e.message);
    } finally { setLoading(false); }
  }, [remember]);

  const onSubmit = (e) => { e.preventDefault(); run(form, lang); };
  const onLoadDemo = () => {
    const s = sample && sample.scenarios[0];
    if (!s) { setError(ui.serverDown); return; }
    const f = scenarioToForm(s); setForm(f); run(f, lang);
  };
  const switchLang = (l) => { setLang(l); if (advisory && !savedCopy && !offline) run(form, l); };
  const onDeleteSaved = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } setRemember(false); setSavedAt(null); setSavedCopy(false); };
  const onCopy = async () => {
    try {
      const text = await api.exportReport(advisory.session_id);
      await navigator.clipboard.writeText(text); setCopyMsg(ui.copied);
    } catch { setCopyMsg(ui.copyFail); }
  };

  const modeLabel = healthFailed ? ui.serverDown : !health ? ui.modeChecking : health.mode === 'live' ? ui.modeLive : health.mode === 'partial' ? ui.modePartial : ui.modeDemo;
  const showDemo = advisory ? advisory.data_mode === 'demo' : !health || health.mode === 'demo';

  return (
    <>
      <header className="top">
        <div><h1>{ui.appName}</h1><p className="tag">{ui.tagline}</p></div>
        <div className="lang" role="group" aria-label={ui.language}>
          <button type="button" aria-pressed={lang === 'en'} onClick={() => switchLang('en')} lang="en">English</button>
          <button type="button" aria-pressed={lang === 'hi'} onClick={() => switchLang('hi')} lang="hi">हिन्दी</button>
        </div>
      </header>
      <div className="statusbar" role="status">
        <span className={`pill ${health?.mode === 'live' ? 'live' : 'demo'}`}>{modeLabel}</span>
        {showDemo && <span className="pill demo">{ui.demoBadge}</span>}
      </div>

      <main className="layout">
        <div className="formcol">
          <FarmForm ui={ui} lang={lang} form={form} setForm={setForm} sample={sample} health={health} onSubmit={onSubmit} onLoadDemo={onLoadDemo}
            loading={loading} fieldErrors={fieldErrors} remember={remember} setRemember={setRemember} hasSaved={Boolean(savedAt)} onDeleteSaved={onDeleteSaved} />
        </div>
        <div>
          {offline && <div className="banner warn" role="alert">{ui.offline}</div>}
          {error && <div className="banner err" role="alert"><b>{ui.error}.</b> {error}</div>}
          {savedCopy && advisory && <div className="banner warn" role="status"><b>{ui.savedCopy} {savedAt ? savedAt.slice(0, 16).replace('T', ' ') : ''}.</b> {ui.savedCopyNote}</div>}
          {advisory
            ? <Dashboard a={advisory} ui={ui} onCopy={onCopy} copyMsg={copyMsg} />
            : <div className="empty"><h2>{ui.emptyTitle}</h2><p>{ui.emptyBody}</p></div>}
          <Chat ui={ui} lang={lang} sessionId={advisory && !savedCopy ? advisory.session_id : null} />
        </div>
      </main>
    </>
  );
}
