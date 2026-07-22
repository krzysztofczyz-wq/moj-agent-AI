'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState, useCallback, Fragment } from 'react';
import { usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const NAV_LINKS = [
  { href: '/agent', label: '🤖 Agent', main: true },
  { href: '/react', label: '🔄 ReAct' },
  { href: '/travel', label: '✈️ Podróże' },
  { href: '/', label: '💬 Chat' },
  { href: '/think', label: '🧠 Myślenie' },
  { href: '/search', label: '🌐 Szukaj' },
  { href: '/generate', label: '🎨 Grafiki' },
  { href: '/format', label: '📐 Formater' },
  { href: '/fewshot', label: '📚 Słownik' },
];

const TOOL_ICONS: Record<string, string> = {
  calculator: '🧮',
  currentDateTime: '🕐',
  googleSearch: '🌐',
  readWebPage: '📄',
  generateImage: '🎨',
  analyzeImage: '👁️',
};

const TOOL_NAMES: Record<string, string> = {
  calculator: 'Kalkulator',
  currentDateTime: 'Data i czas',
  googleSearch: 'Google Search',
  readWebPage: 'Czytanie strony',
  generateImage: 'Generowanie obrazu',
  analyzeImage: 'Analiza obrazu',
};

const SCENARIOS = [
  'Znajdź w Google co robi firma Syntelligence i wygeneruj dla nich logo',
  'Przeczytaj stronę https://apple.com i opisz ich aktualną ofertę iPhone',
  'Ile to 23% VAT z 8500 PLN? Podaj kwotę brutto i netto',
  'Jakie są najnowsze wiadomości o AI? Wygeneruj grafikę do posta o tym',
  'Wyszukaj w Google "best coffee shops Kraków" i streszcz wyniki',
];

const ACTIVE_TOOLS = [
  { key: 'calculator', icon: '🧮', label: 'Kalkulator' },
  { key: 'currentDateTime', icon: '🕐', label: 'Data i czas' },
  { key: 'googleSearch', icon: '🌐', label: 'Google Search' },
  { key: 'readWebPage', icon: '📄', label: 'Czytanie stron' },
  { key: 'generateImage', icon: '🎨', label: 'Generowanie obrazów' },
  { key: 'analyzeImage', icon: '👁️', label: 'Analiza obrazów' },
];

function parseGeneratedImage(text: string): { image: string; text: string; prompt: string } | null {
  try {
    const data = JSON.parse(text);
    if (data.__type === 'generated_image' && data.image) return data;
  } catch {}
  return null;
}

function ToolStep({
  stepIndex,
  toolName,
  args,
  result,
  isLoading,
}: {
  stepIndex: number;
  toolName: string;
  args: any;
  result?: any;
  isLoading?: boolean;
}) {
  const icon = TOOL_ICONS[toolName] || '🔧';
  const name = TOOL_NAMES[toolName] || toolName;
  const argsStr = args ? JSON.stringify(args).slice(0, 120) : '';
  const resultStr = typeof result === 'string' ? result.slice(0, 200) : '';

  let parsedImage: { image: string; text: string; prompt: string } | null = null;
  if (typeof result === 'string') parsedImage = parseGeneratedImage(result);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '0.75rem',
        borderRadius: '0.5rem',
        background: isLoading ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.04)',
        border: '1px solid',
        borderColor: isLoading ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)',
        marginBottom: '0.5rem',
        animation: isLoading ? 'toolPulse 1.5s ease-in-out infinite' : 'none',
      }}
    >
      <div
        style={{
          minWidth: '28px',
          height: '28px',
          borderRadius: '50%',
          background: 'rgba(99,102,241,0.2)',
          border: '1px solid rgba(99,102,241,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.7rem',
          fontWeight: 700,
          color: '#a5b4fc',
          flexShrink: 0,
        }}
      >
        {stepIndex}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
          <span style={{ fontSize: '1rem' }}>{icon}</span>
          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#e2e8f0' }}>{name}</span>
          {isLoading && (
            <span style={{ fontSize: '0.7rem', color: '#a5b4fc', animation: 'dots 1.5s infinite' }}>
              Wykonuję...
            </span>
          )}
        </div>
        {argsStr && (
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace', marginBottom: '0.25rem' }}>
            → {argsStr}
          </div>
        )}
        {parsedImage ? (
          <div>
            <img
              src={parsedImage.image}
              alt={parsedImage.prompt}
              style={{ maxWidth: '200px', borderRadius: '0.5rem', marginTop: '0.25rem' }}
            />
          </div>
        ) : resultStr && !isLoading ? (
          <div style={{ fontSize: '0.75rem', color: '#64748b', borderLeft: '2px solid rgba(99,102,241,0.3)', paddingLeft: '0.5rem' }}>
            {resultStr}{result?.length > 200 ? '...' : ''}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AgentPage() {
  const [model, setModel] = useState<'flash' | 'pro'>('flash');
  const [input, setInput] = useState('');
  const [pastedImage, setPastedImage] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState<number>(0);
  const [showExportSuccess, setShowExportSuccess] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();

  const { messages, sendMessage, setMessages, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/agent' }),
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Elapsed timer
  useEffect(() => {
    if (isLoading && startTime) {
      const interval = setInterval(() => {
        setElapsed((Date.now() - startTime) / 1000);
      }, 100);
      return () => clearInterval(interval);
    } else if (!isLoading) {
      setElapsed(0);
    }
  }, [isLoading, startTime]);

  // Handle Ctrl+V paste of image
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = (ev) => {
          setPastedImage(ev.target?.result as string);
        };
        reader.readAsDataURL(file);
        e.preventDefault();
        break;
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !pastedImage) || isLoading) return;

    setStartTime(Date.now());

    if (pastedImage) {
      // Send multimodal message with image
      sendMessage(
        {
          parts: [
            ...(input.trim() ? [{ type: 'text' as const, text: input.trim() }] : [{ type: 'text' as const, text: 'Opisz ten obraz / screenshot.' }]),
            { type: 'file' as const, mediaType: 'image/png', url: pastedImage },
          ],
        },
        { body: { model } }
      );
      setPastedImage(null);
    } else {
      sendMessage({ text: input }, { body: { model } });
    }
    setInput('');
  };

  const handleSuggestion = (s: string) => {
    if (isLoading) return;
    setStartTime(Date.now());
    sendMessage({ text: s }, { body: { model } });
  };

  const handleExport = () => {
    const text = messages
      .map((m) => {
        const sender = m.role === 'user' ? 'Użytkownik' : 'Agent';
        const content = m.parts
          .filter((p) => p.type === 'text')
          .map((p) => (p as any).text)
          .join('\n');
        return `${sender}:\n${content}`;
      })
      .join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      setShowExportSuccess(true);
      setTimeout(() => setShowExportSuccess(false), 2000);
    });
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        * { box-sizing: border-box; }
        body { margin: 0; background: #0a0a14; font-family: 'Inter', sans-serif; }

        @keyframes toolPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        @keyframes dots {
          0% { content: '.'; }
          33% { content: '..'; }
          66% { content: '...'; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .agent-shell {
          display: grid;
          grid-template-columns: 220px 1fr;
          grid-template-rows: auto 1fr auto;
          height: 100dvh;
          overflow: hidden;
        }

        /* ── NAV BAR (top) ── */
        .agent-nav {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.6rem 1.25rem;
          background: rgba(255,255,255,0.03);
          border-bottom: 1px solid rgba(255,255,255,0.07);
          overflow-x: auto;
        }
        .nav-link {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.35rem 0.75rem;
          border-radius: 0.5rem;
          font-size: 0.8rem;
          font-weight: 500;
          color: #94a3b8;
          text-decoration: none;
          transition: background 0.15s, color 0.15s;
          white-space: nowrap;
        }
        .nav-link:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
        .nav-link.active { background: rgba(99,102,241,0.2); color: #a5b4fc; }
        .nav-link.main-link {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
          font-weight: 700;
        }
        .nav-link.main-link:hover { opacity: 0.9; }

        /* ── SIDEBAR ── */
        .agent-sidebar {
          background: rgba(255,255,255,0.02);
          border-right: 1px solid rgba(255,255,255,0.06);
          padding: 1rem 0.75rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .sidebar-title {
          font-size: 0.7rem;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 0 0.5rem;
        }
        .tool-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.6rem;
          border-radius: 0.4rem;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          font-size: 0.78rem;
          color: #94a3b8;
        }
        .tool-badge .dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #22c55e;
          flex-shrink: 0;
          box-shadow: 0 0 6px #22c55e;
        }
        .model-selector {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .model-btn {
          padding: 0.45rem 0.6rem;
          border-radius: 0.4rem;
          border: 1px solid rgba(255,255,255,0.1);
          background: transparent;
          color: #64748b;
          font-size: 0.78rem;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s;
        }
        .model-btn:hover { background: rgba(255,255,255,0.05); color: #94a3b8; }
        .model-btn.active { background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.4); color: #a5b4fc; }

        .sidebar-stats {
          font-size: 0.72rem;
          color: #334155;
          padding: 0 0.5rem;
          line-height: 1.6;
        }

        /* ── MAIN CHAT ── */
        .agent-main {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .chat-header {
          padding: 1.5rem 2rem 1rem;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .chat-header h1 {
          margin: 0 0 0.25rem;
          font-size: 1.4rem;
          font-weight: 800;
          background: linear-gradient(135deg, #6366f1, #a855f7, #ec4899);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .chat-header p {
          margin: 0 0 1rem;
          font-size: 0.82rem;
          color: #475569;
        }
        .scenarios-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .scenario-btn {
          padding: 0.4rem 0.75rem;
          border-radius: 0.4rem;
          border: 1px solid rgba(99,102,241,0.25);
          background: rgba(99,102,241,0.07);
          color: #94a3b8;
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.15s;
          text-align: left;
        }
        .scenario-btn:hover:not(:disabled) {
          background: rgba(99,102,241,0.15);
          color: #c7d2fe;
          border-color: rgba(99,102,241,0.4);
        }
        .scenario-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        /* Messages */
        .messages-area {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .messages-area::-webkit-scrollbar { width: 4px; }
        .messages-area::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 2px; }

        .msg-wrapper { animation: fadeIn 0.3s ease; }
        .msg-wrapper.user { display: flex; justify-content: flex-end; }
        .msg-wrapper.assistant { display: flex; flex-direction: column; gap: 0.5rem; }

        .msg-bubble {
          max-width: 75%;
          padding: 0.85rem 1.1rem;
          border-radius: 1rem;
          font-size: 0.9rem;
          line-height: 1.6;
        }
        .msg-bubble.user {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
          border-bottom-right-radius: 0.25rem;
        }
        .msg-bubble.assistant {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          color: #e2e8f0;
          border-bottom-left-radius: 0.25rem;
          width: 100%;
          max-width: none;
        }

        /* markdown in messages */
        .msg-bubble.assistant p { margin: 0 0 0.5rem; }
        .msg-bubble.assistant p:last-child { margin-bottom: 0; }
        .msg-bubble.assistant h1, .msg-bubble.assistant h2, .msg-bubble.assistant h3 {
          color: #c7d2fe; margin: 0.75rem 0 0.25rem;
        }
        .msg-bubble.assistant ul, .msg-bubble.assistant ol { padding-left: 1.25rem; margin: 0.25rem 0; }
        .msg-bubble.assistant li { margin-bottom: 0.2rem; }
        .msg-bubble.assistant code {
          background: rgba(99,102,241,0.15); padding: 0.1rem 0.3rem;
          border-radius: 0.25rem; font-family: monospace; font-size: 0.85em;
        }
        .msg-bubble.assistant pre {
          background: rgba(0,0,0,0.3); padding: 0.75rem; border-radius: 0.5rem;
          overflow-x: auto; margin: 0.5rem 0;
        }
        .msg-bubble.assistant table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
        .msg-bubble.assistant th, .msg-bubble.assistant td {
          border: 1px solid rgba(255,255,255,0.1); padding: 0.4rem 0.6rem;
        }
        .msg-bubble.assistant th { background: rgba(99,102,241,0.15); color: #c7d2fe; }

        /* Tool timeline */
        .timeline-container {
          background: rgba(0,0,0,0.2);
          border: 1px solid rgba(99,102,241,0.15);
          border-radius: 0.75rem;
          padding: 0.75rem;
        }
        .timeline-header {
          font-size: 0.75rem;
          font-weight: 600;
          color: #6366f1;
          margin-bottom: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        /* Generated image in chat */
        .generated-image-wrapper {
          margin-top: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          align-items: flex-start;
        }
        .generated-image-wrapper img {
          max-width: 400px;
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .download-btn {
          padding: 0.4rem 0.75rem;
          border-radius: 0.4rem;
          border: 1px solid rgba(99,102,241,0.4);
          background: rgba(99,102,241,0.1);
          color: #a5b4fc;
          font-size: 0.78rem;
          cursor: pointer;
          transition: all 0.15s;
          text-decoration: none;
        }
        .download-btn:hover { background: rgba(99,102,241,0.2); }

        /* Meta bar */
        .msg-meta {
          font-size: 0.72rem;
          color: #334155;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0 0.25rem;
          flex-wrap: wrap;
        }
        .meta-chip {
          padding: 0.15rem 0.5rem;
          border-radius: 0.25rem;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.06);
        }

        /* Pasted image preview */
        .pasted-preview {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          border-top: 1px solid rgba(255,255,255,0.05);
          background: rgba(255,255,255,0.02);
        }
        .pasted-preview img { height: 48px; border-radius: 0.3rem; }
        .pasted-preview .remove-img {
          padding: 0.2rem 0.5rem;
          border-radius: 0.3rem;
          background: rgba(239,68,68,0.15);
          color: #f87171;
          border: none;
          cursor: pointer;
          font-size: 0.75rem;
        }

        /* Input area */
        .input-area {
          border-top: 1px solid rgba(255,255,255,0.06);
          padding: 1rem 2rem;
          background: rgba(0,0,0,0.15);
        }
        .input-row {
          display: flex;
          gap: 0.6rem;
          align-items: center;
        }
        .chat-input {
          flex: 1;
          padding: 0.75rem 1rem;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 0.6rem;
          color: #e2e8f0;
          font-size: 0.9rem;
          font-family: inherit;
          outline: none;
          transition: border-color 0.15s;
        }
        .chat-input:focus { border-color: rgba(99,102,241,0.5); }
        .chat-input::placeholder { color: #334155; }
        .send-btn {
          padding: 0.75rem 1.25rem;
          border-radius: 0.6rem;
          border: none;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s;
          white-space: nowrap;
        }
        .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .send-btn:hover:not(:disabled) { opacity: 0.9; }

        .input-hint {
          font-size: 0.72rem;
          color: #334155;
          margin-top: 0.4rem;
          padding: 0 0.25rem;
        }

        /* Loading bar */
        .loading-bar-wrap {
          height: 2px;
          background: rgba(99,102,241,0.1);
          overflow: hidden;
        }
        .loading-bar {
          height: 100%;
          background: linear-gradient(90deg, #6366f1, #a855f7, #ec4899);
          animation: loadingSlide 1.5s ease-in-out infinite;
          width: 60%;
        }
        @keyframes loadingSlide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }

        /* Context controls */
        .context-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.4rem 2rem;
          border-top: 1px solid rgba(255,255,255,0.04);
          background: rgba(0,0,0,0.1);
        }
        .ctx-left { font-size: 0.72rem; color: #334155; }
        .ctx-btns { display: flex; gap: 0.4rem; }
        .ctx-btn {
          padding: 0.25rem 0.6rem;
          border-radius: 0.35rem;
          border: 1px solid rgba(255,255,255,0.08);
          background: transparent;
          color: #475569;
          font-size: 0.72rem;
          cursor: pointer;
          transition: all 0.15s;
        }
        .ctx-btn:hover { background: rgba(255,255,255,0.05); color: #64748b; }
        .ctx-btn:disabled { opacity: 0.3; cursor: not-allowed; }

        /* Loading placeholder */
        .loading-placeholder {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          color: #475569;
          font-size: 0.85rem;
          padding: 0.5rem;
        }
        .spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(99,102,241,0.3);
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @media (max-width: 768px) {
          .agent-shell { grid-template-columns: 1fr; }
          .agent-sidebar { display: none; }
          .chat-header { padding: 1rem; }
          .messages-area { padding: 1rem; }
          .input-area { padding: 0.75rem 1rem; }
          .context-bar { padding: 0.4rem 1rem; }
        }
      `}</style>

      <div className="agent-shell">

        {/* Sidebar */}
        <aside className="agent-sidebar">
          <div>
            <div className="sidebar-title">Moje narzędzia</div>
            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {ACTIVE_TOOLS.map((t) => (
                <div key={t.key} className="tool-badge">
                  <div className="dot" />
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="sidebar-title">Model</div>
            <div className="model-selector">
              <button className={`model-btn${model === 'flash' ? ' active' : ''}`} onClick={() => setModel('flash')}>
                ⚡ Flash (szybki)
              </button>
              <button className={`model-btn${model === 'pro' ? ' active' : ''}`} onClick={() => setModel('pro')}>
                🧠 Pro (zaawansowany)
              </button>
            </div>
          </div>

          <div>
            <div className="sidebar-title">Instrukcja</div>
            <div className="sidebar-stats">
              Wklej screenshot <kbd style={{ background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.3rem', borderRadius: '0.2rem', fontSize: '0.68rem' }}>Ctrl+V</kbd> lub <kbd style={{ background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.3rem', borderRadius: '0.2rem', fontSize: '0.68rem' }}>⌘+V</kbd> i zadaj pytanie.
            </div>
          </div>

          {messages.length > 0 && (
            <div className="sidebar-stats">
              Wiadomości: {messages.length}<br />
              ~{Math.round(messages.reduce((a, m) => a + m.parts.reduce((pa, p) => pa + ((p.type === 'text' ? (p as any).text?.length : 0) || 0), 0), 0) / 4)} tokenów
            </div>
          )}
        </aside>

        {/* Main area */}
        <main className="agent-main">
          {/* Header */}
          <div className="chat-header">
            <h1>🤖 Agent AI — Pełna moc</h1>
            <p>{ACTIVE_TOOLS.length} narzędzi • autonomiczne decyzje • multi-step reasoning</p>
            <div className="scenarios-grid">
              {SCENARIOS.map((s, i) => (
                <button key={i} className="scenario-btn" onClick={() => handleSuggestion(s)} disabled={isLoading}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Loading bar */}
          {isLoading && (
            <div className="loading-bar-wrap">
              <div className="loading-bar" />
            </div>
          )}

          {/* Messages */}
          <div className="messages-area">
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#334155', paddingTop: '3rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🤖</div>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>
                  Agent gotowy do działania
                </div>
                <div style={{ fontSize: '0.8rem', color: '#334155' }}>
                  Kliknij scenariusz powyżej lub wpisz własne polecenie
                </div>
              </div>
            )}

            {messages.map((m) => {
              const modelNamePart = m.parts.find((p) => p.type === 'data-model-name') as any;
              const modelName = modelNamePart?.data as string | undefined;

              // Collect tool invocations from all parts
              const toolParts = m.parts.filter((p) => p.type === 'tool-invocation') as any[];

              // Text parts
              const textParts = m.parts.filter((p) => p.type === 'text') as any[];

              // Count generated images in tool results
              const generatedImages: { image: string; text: string; prompt: string }[] = [];
              for (const tp of toolParts) {
                const inv = tp.toolInvocation;
                if (inv?.toolName === 'generateImage' && inv?.state === 'result') {
                  const parsed = parseGeneratedImage(inv.result);
                  if (parsed) generatedImages.push(parsed);
                }
              }

              if (m.role === 'user') {
                // Find image in user parts
                const imgPart = m.parts.find((p) => p.type === 'file') as any;
                return (
                  <div key={m.id} className="msg-wrapper user">
                    <div className="msg-bubble user">
                      {textParts.map((p, i) => <div key={i}>{p.text}</div>)}
                      {imgPart && (
                        <img
                          src={imgPart.url}
                          alt="Wklejony screenshot"
                          style={{ maxWidth: '200px', borderRadius: '0.5rem', marginTop: '0.4rem' }}
                        />
                      )}
                    </div>
                  </div>
                );
              }

              // assistant
              return (
                <div key={m.id} className="msg-wrapper assistant">
                  {/* Timeline */}
                  {toolParts.length > 0 && (
                    <div className="timeline-container">
                      <div className="timeline-header">
                        <span>⚡</span> Agent wykonuje zadanie...
                      </div>
                      {toolParts.map((tp, idx) => {
                        const inv = tp.toolInvocation;
                        if (!inv) return null;
                        return (
                          <ToolStep
                            key={idx}
                            stepIndex={idx + 1}
                            toolName={inv.toolName}
                            args={inv.args}
                            result={inv.state === 'result' ? inv.result : undefined}
                            isLoading={inv.state === 'call' || inv.state === 'partial-call'}
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* Text response */}
                  {textParts.length > 0 && (
                    <div className="msg-bubble assistant">
                      {textParts.map((p, i) => {
                        const text = p.text;
                        const sourceRegex = /(?:^|\n)(📎 Źródł[oa]:\s*[^\n]+)/;
                        const match = text.match(sourceRegex);
                        let cleanText = text;
                        let citationElement = null;

                        if (match) {
                          cleanText = text.replace(match[0], '');
                          const sourceStr = match[1];
                          const labelPart = sourceStr.includes('Źródła:') ? '📎 Źródła:' : '📎 Źródło:';
                          const titlesStr = sourceStr.replace(labelPart, '').trim();
                          const titles = titlesStr.split(',').map((t: string) => t.trim());
                          
                          citationElement = (
                            <div 
                              className="source-citation"
                              style={{
                                fontSize: '0.8rem',
                                color: '#94a3b8',
                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                border: '1px dashed rgba(255, 255, 255, 0.08)',
                                padding: '0.4rem 0.75rem',
                                borderRadius: '8px',
                                marginTop: '0.75rem',
                                display: 'inline-flex',
                                flexWrap: 'wrap',
                                alignItems: 'center',
                                gap: '0.4rem',
                                width: 'fit-content'
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>📄 {labelPart}</span>
                              {titles.map((title: string, tIdx: number) => (
                                <Fragment key={tIdx}>
                                  {tIdx > 0 && <span style={{ color: '#475569' }}>,</span>}
                                  <a 
                                    href={`/upload?doc=${encodeURIComponent(title)}`}
                                    style={{
                                      color: '#a5b4fc',
                                      textDecoration: 'underline',
                                      fontWeight: 600,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {title}
                                  </a>
                                </Fragment>
                              ))}
                            </div>
                          );
                        }

                        return (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                            <div className="markdown-content">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanText}</ReactMarkdown>
                            </div>
                            {citationElement}
                          </div>
                        );
                      })}

                      {/* Generated images displayed inline */}
                      {generatedImages.map((img, i) => (
                        <div key={i} className="generated-image-wrapper">
                          <img src={img.image} alt={img.prompt} />
                          <a
                            className="download-btn"
                            href={img.image}
                            download={`agent-image-${i + 1}.png`}
                          >
                            💾 Pobierz obraz
                          </a>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Meta info */}
                  {(modelName || toolParts.length > 0) && (
                    <div className="msg-meta">
                      {toolParts.length > 0 && (
                        <span className="meta-chip">
                          🔧 Użyto {toolParts.length} narzędzi
                        </span>
                      )}
                      {modelName && (
                        <span className="meta-chip">
                          ⚡ {modelName}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="loading-placeholder">
                <div className="spinner" />
                <span>Agent myśli i wykonuje narzędzia{elapsed > 0 ? ` (${elapsed.toFixed(1)}s)` : ''}...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Context bar */}
          {messages.length > 0 && (
            <div className="context-bar">
              <span className="ctx-left">{messages.length} wiadomości</span>
              <div className="ctx-btns">
                <button className="ctx-btn" onClick={handleExport} disabled={messages.length === 0}>
                  {showExportSuccess ? '✅ Skopiowano!' : '📋 Eksportuj'}
                </button>
                <button className="ctx-btn" onClick={() => setMessages([])}>
                  🗑 Nowa rozmowa
                </button>
              </div>
            </div>
          )}

          {/* Pasted image preview */}
          {pastedImage && (
            <div className="pasted-preview">
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>📎 Screenshot:</span>
              <img src={pastedImage} alt="Pasted" />
              <button className="remove-img" onClick={() => setPastedImage(null)}>✕ Usuń</button>
            </div>
          )}

          {/* Input area */}
          <div className="input-area">
            <form className="input-row" onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                className="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={pastedImage ? 'Zadaj pytanie o screenshot (lub wyślij puste)…' : 'Wpisz polecenie lub wklej screenshot Ctrl+V…'}
                disabled={isLoading}
              />
              <button className="send-btn" type="submit" disabled={isLoading || (!input.trim() && !pastedImage)}>
                {isLoading ? '⏳' : '▶ Wyślij'}
              </button>
            </form>
            <div className="input-hint">
              💡 Możesz wkleić screenshot obrazu (Ctrl+V / ⌘+V) i zapytać o jego zawartość
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
