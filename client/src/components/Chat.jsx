import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const LOCALE = { en: 'en-IN', hi: 'hi-IN' };

export default function Chat({ ui, lang, sessionId }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState(-1);
  const [notice, setNotice] = useState('');
  const recRef = useRef(null);
  const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  useEffect(() => () => { window.speechSynthesis?.cancel(); recRef.current?.abort?.(); }, []);

  async function send(e) {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy || !sessionId) return;
    setMsgs((m) => [...m, { role: 'user', text: q }]); setText(''); setBusy(true);
    try {
      const r = await api.chat({ session_id: sessionId, question: q, language: lang });
      setMsgs((m) => [...m, { role: 'bot', text: r.answer, note: r.uncertainty_note, mode: r.mode }]);
    } catch (err) {
      setMsgs((m) => [...m, { role: 'bot', text: err.message === 'network' ? ui.offline : err.message, error: true }]);
    } finally { setBusy(false); }
  }

  function startVoice() {
    setNotice('');
    if (!SR) { setNotice(ui.noVoice); return; }
    const rec = new SR(); rec.lang = LOCALE[lang] || 'en-IN'; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (ev) => setText(ev.results[0][0].transcript); // the farmer reviews the text before sending
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); setNotice(ui.noVoice); };
    recRef.current = rec; setListening(true); rec.start();
  }

  function speak(i, t) {
    if (!canSpeak) { setNotice(ui.noSpeech); return; }
    window.speechSynthesis.cancel();
    if (speakingIdx === i) { setSpeakingIdx(-1); return; }
    const u = new SpeechSynthesisUtterance(t); u.lang = LOCALE[lang] || 'en-IN'; u.onend = () => setSpeakingIdx(-1);
    setSpeakingIdx(i); window.speechSynthesis.speak(u);
  }

  return (
    <section className="panel" aria-labelledby="chat-h">
      <h2 id="chat-h">{ui.chat}</h2>
      <p className="muted">{sessionId ? ui.chatHint : ui.needAdvisory}</p>
      <div className="chat-log" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.text}
            {m.role === 'bot' && !m.error && (
              <>
                {m.note && <p className="meta" style={{ marginTop: '.4rem' }}>{m.note}</p>}
                <p className="meta">{m.mode === 'ai' ? ui.modeAi : ui.modeTemplate}</p>
                <button type="button" className="btn secondary small" onClick={() => speak(i, m.text)}>{speakingIdx === i ? ui.stopListen : ui.listen}</button>
              </>
            )}
          </div>
        ))}
        {busy && <div className="msg bot">{ui.thinking}</div>}
      </div>
      <form onSubmit={send}>
        <label htmlFor="q" className="sr">{ui.chatPlaceholder}</label>
        <textarea id="q" rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={ui.chatPlaceholder} disabled={!sessionId} />
        <div className="row" style={{ marginTop: '.5rem' }}>
          <button type="button" className="btn secondary small" onClick={startVoice} disabled={!sessionId || listening}>{listening ? ui.listening : `🎤 ${ui.mic}`}</button>
          <button type="submit" className="btn small" disabled={!sessionId || busy || !text.trim()}>{ui.send}</button>
        </div>
      </form>
      {notice && <p className="field-error" role="status">{notice}</p>}
    </section>
  );
}
