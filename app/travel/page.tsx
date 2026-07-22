'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState, useCallback, Fragment } from 'react';
import { usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const NAV_LINKS = [
  { href: '/agent', label: '🤖 Agent' },
  { href: '/react', label: '🔄 ReAct' },
  { href: '/travel', label: '✈️ Podróże', main: true },
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
  getWeather: '🌤️',
  getExchangeRate: '💶',
  getHolidays: '📅',
  searchWikipedia: '📖',
  saveNote: '📝',
  getNotes: '🗒️',
  readWebPage: '📄',
};

const TOOL_NAMES: Record<string, string> = {
  calculator: 'Kalkulator',
  currentDateTime: 'Czas i data',
  getWeather: 'Pogoda',
  getExchangeRate: 'Kursy walut NBP',
  getHolidays: 'Święta państwowe',
  searchWikipedia: 'Wikipedia',
  saveNote: 'Zapisz notatkę',
  getNotes: 'Pobierz notatki',
  readWebPage: 'Odczyt strony WWW',
};

const SCENARIOS = [
  {
    title: 'Weekend w Berlinie',
    desc: 'Planuje wyjazd z budżetem 2000 PLN.',
    prompt: 'Planuję weekend w Berlinie. Budżet: 2000 PLN',
  },
  {
    title: 'Tydzień w Paryżu',
    desc: 'Układa szczegółowy tygodniowy plan w sierpniu.',
    prompt: 'Lecę do Paryża na tydzień w sierpniu',
  },
  {
    title: '3 dni w Pradze',
    desc: 'Organizuje wycieczkę rodzinną do Pragi.',
    prompt: 'Wycieczka do Pragi z rodziną na 3 dni',
  },
  {
    title: 'Londyn służbowo',
    desc: 'Szybkie planowanie podróży służbowej w przyszłym tygodniu.',
    prompt: 'Podróż służbowa do Londynu w przyszłym tygodniu',
  },
  {
    title: 'Barcelona vs Lizbona',
    desc: 'Porównuje te dwa miasta i tworzy tabelę.',
    prompt: 'Porównaj Barcelonę i Lizbonę na wakacje',
  },
];

function formatData(data: any): string {
  if (data === null || data === undefined) return '';
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return data;
    }
  }
  return JSON.stringify(data, null, 2);
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
  const icon = TOOL_ICONS[toolName] || '⚙️';
  const name = TOOL_NAMES[toolName] || toolName;

  return (
    <div className="tool-step-card">
      <div className="tool-step-header">
        <div className="tool-badge">
          <span className="tool-icon">{icon}</span>
          <span className="tool-name">Krok {stepIndex}: {name}</span>
        </div>
        {isLoading && <span className="tool-loader">Wywoływanie...</span>}
      </div>
      <div className="tool-step-details">
        <div className="detail-section">
          <div className="detail-label">Argumenty:</div>
          <pre className="detail-code">{formatData(args)}</pre>
        </div>
        {result !== undefined && (
          <div className="detail-section">
            <div className="detail-label">Wynik:</div>
            <pre className="detail-code result">{formatData(result)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

// Custom parser to split markdown plan into beautiful cards
function TravelPlanRenderer({ text }: { text: string }) {
  // If the output contains a comparison table, render it directly with nice table formatting
  if (text.includes('|') && text.includes('---')) {
    return (
      <div className="travel-card travel-card-comparison">
        <div className="travel-card-title">📊 Porównanie destynacji</div>
        <div className="travel-card-body markdown-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      </div>
    );
  }

  // Split text by markdown headings
  const blocks = text.split(/(?=###\s*)/g);
  let mainTitle = '';
  const firstBlock = blocks[0] || '';
  const titleMatch = firstBlock.match(/##\s*🗺️?\s*Plan podróży:\s*([^\n]+)/i);
  if (titleMatch) {
    mainTitle = titleMatch[1].trim();
  }

  return (
    <div className="travel-plan-container">
      {mainTitle && <h2 className="travel-plan-header">🗺️ Plan podróży dla: {mainTitle}</h2>}
      
      <div className="travel-grid">
        {blocks.map((block, idx) => {
          const trimmed = block.trim();
          if (!trimmed) return null;

          // Skip the main title in blocks
          if (trimmed.startsWith('## ')) return null;

          let type: 'summary' | 'weather' | 'budget' | 'dates' | 'sights' | 'checklist' | 'general' = 'general';
          let title = '';
          let cleanContent = trimmed;

          if (/###\s*📋?\s*Podsumowanie/i.test(trimmed)) {
            type = 'summary';
            title = '📋 Podsumowanie wyjazdu';
            cleanContent = trimmed.replace(/^###\s*📋?\s*Podsumowanie[^\n]*\n?/i, '');
          } else if (/###\s*🌤️?\s*Pogoda/i.test(trimmed)) {
            type = 'weather';
            title = '🌤️ Prognoza pogody';
            cleanContent = trimmed.replace(/^###\s*🌤️?\s*Pogoda[^\n]*\n?/i, '');
          } else if (/###\s*💰?\s*Budżet/i.test(trimmed)) {
            type = 'budget';
            title = '💰 Budżet i waluta';
            cleanContent = trimmed.replace(/^###\s*💰?\s*Budżet[^\n]*\n?/i, '');
          } else if (/###\s*📅?\s*Ważne daty/i.test(trimmed)) {
            type = 'dates';
            title = '📅 Ważne daty i święta';
            cleanContent = trimmed.replace(/^###\s*📅?\s*Ważne daty[^\n]*\n?/i, '');
          } else if (/###\s*🏛️?\s*Co zobaczyć/i.test(trimmed)) {
            type = 'sights';
            title = '🏛️ Co warto zobaczyć';
            cleanContent = trimmed.replace(/^###\s*🏛️?\s*Co zobaczyć[^\n]*\n?/i, '');
          } else if (/###\s*✅?\s*Checklist/i.test(trimmed)) {
            type = 'checklist';
            title = '✅ Checklist przed wyjazdem';
            cleanContent = trimmed.replace(/^###\s*✅?\s*Checklist[^\n]*\n?/i, '');
          }

          if (type === 'general' && trimmed.startsWith('###')) {
            const headingMatch = trimmed.match(/^###\s*([^\n]+)/);
            title = headingMatch ? headingMatch[1] : '';
            cleanContent = trimmed.replace(/^###[^\n]*\n?/i, '');
          }

          const sourceRegex = /(?:^|\n)(📎 Źródł[oa]:\s*[^\n]+)/;
          const match = cleanContent.match(sourceRegex);
          let finalCleanContent = cleanContent;
          let citationElement = null;

          if (match) {
            finalCleanContent = cleanContent.replace(match[0], '');
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
            <div key={idx} className={`travel-card travel-card-${type}`}>
              {title && <div className="travel-card-title">{title}</div>}
              <div className="travel-card-body markdown-content" style={{ display: 'flex', flexDirection: 'column' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{finalCleanContent}</ReactMarkdown>
                {citationElement}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TravelPage() {
  const pathname = usePathname();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [model, setModel] = useState<'flash' | 'pro'>('flash');
  const [elapsed, setElapsed] = useState<number>(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [showExportSuccess, setShowExportSuccess] = useState(false);
  const [input, setInput] = useState('');
  const [lastDuration, setLastDuration] = useState<number | null>(null);

  const { messages, sendMessage, setMessages, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/travel' }),
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (isLoading && startTime) {
      const interval = setInterval(() => {
        setElapsed((Date.now() - startTime) / 1000);
      }, 100);
      return () => clearInterval(interval);
    } else if (!isLoading) {
      if (elapsed > 0) {
        setLastDuration(elapsed);
      }
      setElapsed(0);
    }
  }, [isLoading, startTime]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setStartTime(Date.now());
    setLastDuration(null);
    sendMessage({ text: input }, { body: { model } });
    setInput('');
  };

  const handleScenarioClick = (promptText: string) => {
    if (isLoading) return;
    setStartTime(Date.now());
    setLastDuration(null);
    setInput('');
    sendMessage({ text: promptText }, { body: { model } });
  };

  const handleClear = () => {
    setMessages([]);
    setStartTime(null);
    setElapsed(0);
    setLastDuration(null);
  };

  const handleExport = () => {
    const formatted = messages
      .map((m) => {
        const textParts = m.parts.filter((p) => p.type === 'text') as any[];
        const text = textParts.map((p) => p.text).join('\n');
        return `[${m.role.toUpperCase()}]\n${text}\n`;
      })
      .join('\n---\n\n');
    navigator.clipboard.writeText(formatted);
    setShowExportSuccess(true);
    setTimeout(() => setShowExportSuccess(false), 2000);
  };

  const activeMessage = messages[messages.length - 1];
  const toolParts = activeMessage?.parts.filter((p) => p.type === 'tool-invocation') || [];
  const currentStepNum = toolParts.length;

  return (
    <div className="agent-shell">
      <style jsx global>{`
        /* Travel Assistant Dashboard Theme */
        .agent-shell {
          display: grid;
          grid-template-columns: 280px 1fr;
          grid-template-rows: 56px 1fr;
          height: 100vh;
          background: #090d16;
          color: #e2e8f0;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        .agent-nav {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          gap: 1.5rem;
          padding: 0 2rem;
          background: rgba(15, 23, 42, 0.9);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          z-index: 10;
        }
        .nav-link {
          color: #64748b;
          text-decoration: none;
          font-size: 0.88rem;
          font-weight: 500;
          transition: all 0.2s;
          padding: 0.5rem 0.25rem;
          border-bottom: 2px solid transparent;
        }
        .nav-link:hover { color: #cbd5e1; }
        .nav-link.active {
          color: #10b981;
          border-bottom-color: #10b981;
        }
        .nav-link.main-link {
          font-weight: 700;
          color: #34d399;
        }

        .agent-sidebar {
          background: rgba(15, 23, 42, 0.4);
          border-right: 1px solid rgba(255, 255, 255, 0.04);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 2rem;
          overflow-y: auto;
        }
        .sidebar-title {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #475569;
          margin-bottom: 0.8rem;
        }
        .tool-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .tool-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0.75rem;
          border-radius: 0.4rem;
          background: rgba(255, 255, 255, 0.015);
          border: 1px solid rgba(255, 255, 255, 0.03);
          font-size: 0.8rem;
          color: #94a3b8;
        }
        .tool-item .icon { font-size: 1.1rem; }

        .agent-main {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 56px);
          overflow: hidden;
        }

        .scenarios-container {
          padding: 1.25rem 2rem;
          background: rgba(15, 23, 42, 0.15);
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }
        .scenarios-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.75rem;
          margin-top: 0.5rem;
        }
        .scenario-card {
          padding: 0.75rem 1rem;
          border-radius: 0.5rem;
          background: rgba(255, 255, 255, 0.015);
          border: 1px solid rgba(255, 255, 255, 0.03);
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }
        .scenario-card:hover:not(:disabled) {
          background: rgba(16, 185, 129, 0.08);
          border-color: rgba(16, 185, 129, 0.3);
          transform: translateY(-1px);
        }
        .scenario-title {
          font-size: 0.82rem;
          font-weight: 600;
          color: #34d399;
          margin-bottom: 0.25rem;
        }
        .scenario-desc {
          font-size: 0.72rem;
          color: #475569;
          line-height: 1.3;
        }

        .chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 2rem;
          background: rgba(15, 23, 42, 0.25);
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }
        .header-title-area {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .header-title { font-size: 0.95rem; font-weight: 700; color: #f1f5f9; }
        .header-subtitle { font-size: 0.75rem; color: #475569; }
        .model-select {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #e2e8f0;
          padding: 0.35rem 0.75rem;
          border-radius: 0.4rem;
          font-size: 0.8rem;
          outline: none;
          cursor: pointer;
        }

        /* Diagnostics Panel styling */
        .diagnostics-panel {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 0.75rem;
          padding: 1.25rem;
          margin-top: 1.5rem;
          box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        }
        .diagnostics-title {
          font-size: 0.82rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #94a3b8;
          margin-bottom: 0.85rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .diagnostics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1rem;
        }
        .diag-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .diag-label {
          font-size: 0.72rem;
          color: #64748b;
          font-weight: 700;
          text-transform: uppercase;
        }
        .diag-value {
          font-size: 0.88rem;
          font-weight: 600;
          color: #cbd5e1;
        }
        .diag-value.text-red { color: #f43f5e; }
        .progress-bar-container {
          width: 100%;
          height: 8px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
          overflow: hidden;
          margin-top: 0.25rem;
        }
        .progress-bar-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.3s ease;
        }
        .progress-bar-fill.green { background: #10b981; }
        .progress-bar-fill.yellow { background: #f59e0b; }
        .progress-bar-fill.red { background: #ef4444; }

        .status-badge {
          display: inline-block;
          padding: 0.15rem 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.78rem;
          font-weight: 700;
        }
        .status-running { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
        .status-limit { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .status-done { background: rgba(16, 185, 129, 0.1); color: #10b981; }

        .diagnostics-alerts {
          margin-top: 1rem;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding-top: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .diag-alert {
          font-size: 0.8rem;
          color: #f87171;
          background: rgba(239, 68, 68, 0.05);
          border: 1px solid rgba(239, 68, 68, 0.15);
          padding: 0.5rem 0.75rem;
          border-radius: 0.4rem;
        }

        .react-progress-indicator {
          background: rgba(16, 185, 129, 0.08);
          border-bottom: 1px solid rgba(16, 185, 129, 0.2);
          padding: 0.5rem 2rem;
          font-size: 0.78rem;
          color: #34d399;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-weight: 600;
        }

        .messages-area {
          flex: 1;
          overflow-y: auto;
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .msg-wrapper {
          display: flex;
          flex-direction: column;
          width: 100%;
        }
        .msg-wrapper.user {
          align-self: flex-end;
          max-width: 80%;
        }
        .msg-wrapper.assistant {
          align-self: flex-start;
        }

        .msg-bubble {
          padding: 0.85rem 1.15rem;
          border-radius: 0.75rem;
          font-size: 0.88rem;
          line-height: 1.5;
        }
        .msg-bubble.user {
          background: linear-gradient(135deg, #059669, #10b981);
          color: #ffffff;
          border-bottom-right-radius: 0.2rem;
          align-self: flex-end;
        }
        .msg-bubble.assistant {
          background: transparent;
          border: none;
          padding: 0;
          width: 100%;
        }

        /* Travel Grid & Cards styling */
        .travel-plan-container {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          width: 100%;
        }
        .travel-plan-header {
          font-size: 1.3rem;
          font-weight: 800;
          color: #f8fafc;
          margin: 0;
          text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .travel-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 1.25rem;
          width: 100%;
        }
        .travel-card {
          border-radius: 0.75rem;
          border: 1px solid rgba(255, 255, 255, 0.05);
          overflow: hidden;
          background: rgba(15, 23, 42, 0.3);
          backdrop-filter: blur(8px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          display: flex;
          flex-direction: column;
        }
        .travel-card-title {
          font-size: 0.85rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 0.6rem 1rem;
          background: rgba(0, 0, 0, 0.2);
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }
        .travel-card-body {
          padding: 1rem 1.25rem;
          font-size: 0.88rem;
          color: #cbd5e1;
          line-height: 1.6;
        }

        /* Summary card */
        .travel-card-summary {
          border-color: rgba(99, 102, 241, 0.3);
          grid-column: 1 / -1;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(15, 23, 42, 0.3));
        }
        .travel-card-summary .travel-card-title { color: #a5b4fc; }

        /* Weather card */
        .travel-card-weather {
          border-color: rgba(14, 165, 233, 0.3);
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.05), rgba(15, 23, 42, 0.3));
        }
        .travel-card-weather .travel-card-title { color: #38bdf8; }

        /* Budget card */
        .travel-card-budget {
          border-color: rgba(16, 185, 129, 0.3);
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(15, 23, 42, 0.3));
        }
        .travel-card-budget .travel-card-title { color: #34d399; }

        /* Dates card */
        .travel-card-dates {
          border-color: rgba(244, 63, 94, 0.3);
          background: linear-gradient(135deg, rgba(244, 63, 94, 0.05), rgba(15, 23, 42, 0.3));
        }
        .travel-card-dates .travel-card-title { color: #fb7185; }

        /* Sights card */
        .travel-card-sights {
          border-color: rgba(139, 92, 246, 0.3);
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.05), rgba(15, 23, 42, 0.3));
          grid-column: 1 / -1;
        }
        .travel-card-sights .travel-card-title { color: #c084fc; }

        /* Checklist card */
        .travel-card-checklist {
          border-color: rgba(20, 184, 166, 0.3);
          background: linear-gradient(135deg, rgba(20, 184, 166, 0.05), rgba(15, 23, 42, 0.3));
          grid-column: 1 / -1;
        }
        .travel-card-checklist .travel-card-title { color: #2dd4bf; }

        /* Comparison card */
        .travel-card-comparison {
          border-color: rgba(245, 158, 11, 0.3);
          grid-column: 1 / -1;
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.05), rgba(15, 23, 42, 0.3));
        }
        .travel-card-comparison .travel-card-title { color: #fbbf24; }

        /* General / Other cards */
        .travel-card-general {
          border-color: rgba(255, 255, 255, 0.08);
        }
        .travel-card-general .travel-card-title { color: #94a3b8; }

        /* Tables inside markdown (comparison tables) */
        .markdown-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 1rem 0;
          font-size: 0.85rem;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 0.5rem;
          overflow: hidden;
        }
        .markdown-content th {
          background: rgba(255, 255, 255, 0.06);
          color: #f1f5f9;
          font-weight: 700;
          text-align: left;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .markdown-content td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          color: #cbd5e1;
        }
        .markdown-content tr:last-child td {
          border-bottom: none;
        }
        .markdown-content tr:hover td {
          background: rgba(255, 255, 255, 0.02);
        }

        .react-separator {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent);
          margin: 1.5rem 0;
        }

        .timeline-container {
          margin: 0.5rem 0 1.5rem 0;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .timeline-header {
          font-size: 0.75rem;
          font-weight: 700;
          color: #64748b;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .tool-step-card {
          background: rgba(255, 255, 255, 0.012);
          border: 1px solid rgba(255, 255, 255, 0.02);
          border-radius: 0.5rem;
          overflow: hidden;
        }
        .tool-step-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0.85rem;
          background: rgba(0, 0, 0, 0.2);
          border-bottom: 1px solid rgba(255, 255, 255, 0.02);
        }
        .tool-badge { display: flex; align-items: center; gap: 0.5rem; }
        .tool-icon { font-size: 1rem; }
        .tool-name { font-size: 0.78rem; font-weight: 600; color: #cbd5e1; }
        .tool-loader {
          font-size: 0.72rem;
          color: #34d399;
          animation: pulse 1.5s infinite;
        }
        .tool-step-details {
          padding: 0.75rem 1rem;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
        }
        .detail-section { display: flex; flex-direction: column; gap: 0.25rem; }
        .detail-label { font-size: 0.68rem; color: #475569; font-weight: 700; text-transform: uppercase; }
        .detail-code {
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.03);
          padding: 0.5rem 0.75rem;
          border-radius: 0.3rem;
          font-family: Menlo, Monaco, Consolas, Courier, monospace;
          font-size: 0.72rem;
          color: #e2e8f0;
          margin: 0;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .detail-code.result {
          color: #34d399;
          background: rgba(52, 211, 153, 0.02);
          border-color: rgba(52, 211, 153, 0.08);
        }

        .loading-bar-wrap { height: 2px; background: rgba(16, 185, 129, 0.1); overflow: hidden; }
        .loading-bar {
          height: 100%;
          background: linear-gradient(90deg, #10b981, #059669, #047857);
          animation: loadingSlide 1.5s ease-in-out infinite;
          width: 60%;
        }
        @keyframes loadingSlide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

        .msg-meta {
          font-size: 0.72rem;
          color: #475569;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.5rem;
          padding: 0 0.25rem;
        }
        .meta-chip {
          padding: 0.15rem 0.5rem;
          border-radius: 0.25rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

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
          border: 2px solid rgba(16, 185, 129, 0.3);
          border-top-color: #10b981;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        .input-area {
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          padding: 1rem 2rem;
          background: rgba(0, 0, 0, 0.15);
        }
        .input-row { display: flex; gap: 0.6rem; align-items: center; }
        .chat-input {
          flex: 1;
          padding: 0.75rem 1rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 0.6rem;
          color: #e2e8f0;
          font-size: 0.9rem;
          font-family: inherit;
          outline: none;
          transition: border-color 0.15s;
        }
        .chat-input:focus { border-color: rgba(16, 185, 129, 0.5); }
        .chat-input::placeholder { color: #475569; }
        
        .send-btn {
          padding: 0.75rem 1.25rem;
          border-radius: 0.6rem;
          border: none;
          background: linear-gradient(135deg, #10b981, #059669);
          color: #fff;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s;
          white-space: nowrap;
        }
        .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .send-btn:hover:not(:disabled) { opacity: 0.9; }

        .input-hint { font-size: 0.72rem; color: #475569; margin-top: 0.4rem; padding: 0 0.25rem; }

        .context-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.4rem 2rem;
          border-top: 1px solid rgba(255, 255, 255, 0.04);
          background: rgba(0, 0, 0, 0.1);
        }
        .ctx-left { font-size: 0.72rem; color: #475569; }
        .ctx-btns { display: flex; gap: 0.4rem; }
        .ctx-btn {
          padding: 0.25rem 0.6rem;
          border-radius: 0.35rem;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: transparent;
          color: #64748b;
          font-size: 0.72rem;
          cursor: pointer;
          transition: all 0.15s;
        }
        .ctx-btn:hover { background: rgba(255, 255, 255, 0.04); color: #cbd5e1; }
        .ctx-btn:disabled { opacity: 0.3; cursor: not-allowed; }

        /* Markdown lists and typography inside card bodies */
        .markdown-content p { margin: 0 0 0.75rem 0; }
        .markdown-content p:last-child { margin-bottom: 0; }
        .markdown-content ul, .markdown-content ol { margin: 0 0 0.75rem 0; padding-left: 1.2rem; }
        .markdown-content li { margin-bottom: 0.25rem; }
        .markdown-content strong { color: #f8fafc; }

        @media (max-width: 900px) {
          .agent-shell { grid-template-columns: 1fr; }
          .agent-sidebar { display: none; }
          .chat-header { padding: 1rem; }
          .messages-area { padding: 1rem; }
          .input-area { padding: 0.75rem 1rem; }
          .context-bar { padding: 0.4rem 1rem; }
        }
      `}</style>


      {/* Sidebar with active tools list */}
      <aside className="agent-sidebar">
        <div>
          <div className="sidebar-title">Narzędzia planowania</div>
          <div className="tool-list">
            {Object.keys(TOOL_NAMES).map((key) => (
              <div key={key} className="tool-item">
                <span className="icon">{TOOL_ICONS[key] || '⚙️'}</span>
                <span>{TOOL_NAMES[key]}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main workspace area */}
      <main className="agent-main">
        {/* Scenarios Header selection */}
        <div className="scenarios-container">
          <div className="sidebar-title" style={{ marginBottom: '0.4rem' }}>Zaplanuj Podróż (Szybki Wybór)</div>
          <div className="scenarios-grid">
            {SCENARIOS.map((s, idx) => (
              <button
                key={idx}
                className="scenario-card"
                onClick={() => handleScenarioClick(s.prompt)}
                disabled={isLoading}
              >
                <div className="scenario-title">{s.title}</div>
                <div className="scenario-desc">{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Model and execution header bar */}
        <div className="chat-header">
          <div className="header-title-area">
            <span className="header-title">✈️ Asystent Podróży AI</span>
            <span className="header-subtitle">Powiedz dokąd jedziesz — agent zaplanuje wszystko</span>
          </div>
          <div>
            <select
              className="model-select"
              value={model}
              onChange={(e) => setModel(e.target.value as 'flash' | 'pro')}
              disabled={isLoading}
            >
              <option value="flash">Gemini 2.5 Flash</option>
              <option value="pro">Gemini 2.5 Pro</option>
            </select>
          </div>
        </div>

        {/* ReAct step-by-step progress tracking */}
        {isLoading && currentStepNum > 0 && (
          <div className="react-progress-indicator">
            <span>Pozyskiwanie informacji z API: {currentStepNum} z 10 max</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 'normal' }}>
              Czas: {elapsed.toFixed(1)}s
            </span>
          </div>
        )}

        {/* Progress loading animation bar */}
        {isLoading && (
          <div className="loading-bar-wrap">
            <div className="loading-bar" />
          </div>
        )}

        {/* Chat message rendering history */}
        <div className="messages-area">
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#475569', paddingTop: '3rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>✈️</div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#64748b', marginBottom: '0.4rem' }}>
                Asystent podróży gotowy do startu
              </div>
              <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                Wpisz np. "Planuję weekend w Berlinie. Budżet: 2000 PLN." a agent sam pobierze pogodę, waluty, święta i atrakcje.
              </div>
            </div>
          )}

          {messages.map((m) => {
            const modelNamePart = m.parts.find((p) => p.type === 'data-model-name') as any;
            const modelName = modelNamePart?.data as string | undefined;

            // Collect tool invocations
            const toolParts = m.parts.filter((p) => p.type === 'tool-invocation') as any[];

            // Collect text parts
            const textParts = m.parts.filter((p) => p.type === 'text') as any[];

            if (m.role === 'user') {
              return (
                <div key={m.id} className="msg-wrapper user">
                  <div className="msg-bubble user">
                    {textParts.map((p, i) => <div key={i}>{p.text}</div>)}
                  </div>
                </div>
              );
            }

            // Assistant Travel plan rendering
            return (
              <div key={m.id} className="msg-wrapper assistant">
                <div className="msg-bubble assistant">
                  {/* Visualizer card blocks for Travel plan format */}
                  {textParts.map((p, i) => (
                    <TravelPlanRenderer key={i} text={p.text} />
                  ))}

                  {/* Separator before tools list */}
                  {toolParts.length > 0 && <div className="react-separator" />}

                  {/* Tool execution timeline list */}
                  {toolParts.length > 0 && (
                    <div className="timeline-container">
                      <div className="timeline-header">
                        <span>⚡</span> Autonomiczne zbieranie danych w tle:
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
                </div>

                {/* Response meta tags details */}
                {(modelName || toolParts.length > 0) && (
                  <div className="msg-meta">
                    {toolParts.length > 0 && (
                      <span className="meta-chip">
                        🔧 Iteracje: {toolParts.length} kroków ReAct
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
              <span>Analizuję destynację i odpytuję bazy danych...</span>
            </div>
          )}

          {/* Diagnostics Panel */}
          {messages.length > 0 && (
            (() => {
              const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
              const activeToolParts = lastAssistantMessage?.parts.filter((p) => p.type === 'tool-invocation') as any[] || [];
              const stepsCount = activeToolParts.length;
              const maxSteps = 10;
              
              const toolsUsed = activeToolParts.reduce((acc: Record<string, number>, tp) => {
                const name = tp.toolInvocation?.toolName;
                if (name) acc[name] = (acc[name] || 0) + 1;
                return acc;
              }, {});

              const toolAlerts = activeToolParts
                .filter((tp) => tp.toolInvocation?.state === 'result' && tp.toolInvocation.result && (tp.toolInvocation.result.error || tp.toolInvocation.result.err))
                .map((tp) => ({
                  toolName: tp.toolInvocation.toolName,
                  args: tp.toolInvocation.args,
                  error: tp.toolInvocation.result.error || tp.toolInvocation.result.err,
                }));

              const errorCount = toolAlerts.length;

              return (
                <div className="diagnostics-panel" style={{ marginTop: '2rem' }}>
                  <div className="diagnostics-title">🛡️ Diagnostyka agenta</div>
                  <div className="diagnostics-grid">
                    <div className="diag-item">
                      <span className="diag-label">Kroki:</span>
                      <div className="progress-bar-container">
                        <div 
                          className={`progress-bar-fill ${
                            stepsCount <= 3 ? 'green' : stepsCount === 4 ? 'yellow' : 'red'
                          }`} 
                          style={{ width: `${Math.min((stepsCount / maxSteps) * 100, 100)}%` }} 
                        />
                      </div>
                      <span className="diag-value" style={{ marginTop: '0.25rem', display: 'inline-block' }}>
                        {stepsCount} / {maxSteps}
                      </span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Wywołane narzędzia:</span>
                      <span className="diag-value" style={{ marginTop: '0.25rem', display: 'inline-block' }}>
                        {Object.entries(toolsUsed).map(([name, count]) => `${name}(${count})`).join(', ') || 'brak'}
                      </span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Błędy:</span>
                      <span className={`diag-value ${errorCount > 0 ? 'text-red' : ''}`} style={{ marginTop: '0.25rem', display: 'inline-block' }}>
                        {errorCount}
                      </span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Czas wykonania:</span>
                      <span className="diag-value" style={{ marginTop: '0.25rem', display: 'inline-block' }}>
                        {isLoading ? `${elapsed.toFixed(1)}s` : lastDuration ? `${lastDuration.toFixed(1)}s` : '—'}
                      </span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Status:</span>
                      <span style={{ marginTop: '0.25rem', display: 'inline-block' }}>
                        <span className={`status-badge ${
                          isLoading ? 'status-running' : stepsCount >= maxSteps ? 'status-limit' : 'status-done'
                        }`}>
                          {isLoading ? 'W trakcie...' : stepsCount >= maxSteps ? '⚠️ Limit kroków' : '✅ Ukończone'}
                        </span>
                      </span>
                    </div>
                  </div>

                  {toolAlerts.length > 0 && (
                    <div className="diagnostics-alerts">
                      {toolAlerts.map((alert, idx) => (
                        <div key={idx} className="diag-alert">
                          🔴 <strong>{alert.toolName}({JSON.stringify(alert.args)})</strong> — {alert.error}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Export and clear session controller */}
        {messages.length > 0 && (
          <div className="context-bar">
            <span className="ctx-left">{messages.length} wiadomości w historii</span>
            <div className="ctx-btns">
              <button className="ctx-btn" onClick={handleExport} disabled={messages.length === 0}>
                {showExportSuccess ? '✅ Skopiowano!' : '📋 Eksportuj logi'}
              </button>
              <button className="ctx-btn" onClick={handleClear} disabled={isLoading}>
                🗑️ Wyczyść
              </button>
            </div>
          </div>
        )}

        {/* Input input typing area form */}
        <div className="input-area">
          <form onSubmit={handleSubmit}>
            <div className="input-row">
              <input
                className="chat-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Dokąd chcesz pojechać? (np. 'Planuję urlop w Rzymie z budżetem 4000 PLN')"
                disabled={isLoading}
              />
              <button
                className="send-btn"
                type="submit"
                disabled={isLoading || !input.trim()}
              >
                Zaplanuj podróż
              </button>
            </div>
          </form>
          <div className="input-hint">
            Asystent automatycznie sprawdzi pogodę, waluty, święta państwowe, informacje turystyczne i przeliczy budżet.
          </div>
        </div>
      </main>
    </div>
  );
}
