'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../../lib/supabase';

export default function SearchPage() {
  const [mode, setMode] = useState<'casual' | 'ekspert' | 'kreatywny'>('casual');
  const [model, setModel] = useState<'flash' | 'pro'>('flash');
  const [showExportSuccess, setShowExportSuccess] = useState(false);
  const [isContextCollapsed, setIsContextCollapsed] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  
  const { messages, sendMessage, setMessages, status } = useChat();
  
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isLoading = status === 'submitted' || status === 'streaming';
  const pathname = usePathname();

  const suggestions = [
    "Jakie są najnowsze wiadomości o sztucznej inteligencji?",
    "Ile kosztuje iPhone 16 Pro w Polsce?",
    "Kto wygrał ostatni mecz reprezentacji Polski?",
    "Jakie filmy są teraz w kinach?"
  ];

  // Fetch session on mount
  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUserId(session.user.id);
        setToken(session.access_token);
      }
    };
    getSession();
  }, []);

  // Auto-scroll to the bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    sendMessage(
      { text: input },
      { 
        body: { mode, model, userId, isSearchPage: true },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      }
    );
    setInput('');
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (isLoading) return;
    sendMessage(
      { text: suggestion },
      { 
        body: { mode, model, userId, isSearchPage: true },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      }
    );
  };

  const totalChars = messages.reduce((acc, m) => 
    acc + m.parts.reduce((partAcc, part) => 
      partAcc + (part.type === 'text' ? part.text.length : 0), 0
    ), 0
  );

  const handleExport = () => {
    const text = messages.map(m => {
      const sender = m.role === 'user' ? 'User' : 'Oskar (Agent)';
      const textContent = m.parts
        .filter(part => part.type === 'text')
        .map(part => (part as any).text)
        .join('\n');
      return `${sender}:\n${textContent}`;
    }).join('\n\n');
    
    navigator.clipboard.writeText(text).then(() => {
      setShowExportSuccess(true);
      setTimeout(() => setShowExportSuccess(false), 2000);
    });
  };

  return (
    <div className="chat-container">

      <header className="chat-header">
        <h1>🌐 Agent z wyszukiwarką</h1>
        <p className="chat-subheader">Przeszukuję prawdziwy internet i czytam strony</p>
        
        {/* Suggestion Buttons */}
        <div className="suggestions-list">
          {suggestions.map((s, idx) => (
            <button 
              key={idx} 
              onClick={() => handleSuggestionClick(s)} 
              disabled={isLoading}
              className="suggestion-btn"
            >
              {s}
            </button>
          ))}
        </div>
      </header>

      {/* Accordion Context Panel */}
      <div className="context-panel">
        <div className="context-summary">
          <span 
            onClick={() => setIsContextCollapsed(!isContextCollapsed)} 
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', userSelect: 'none' }}
          >
            {isContextCollapsed ? '▶' : '▼'} Kontekst rozmowy ({messages.length} wiadomości)
          </span>
          <div className="context-buttons">
            <button onClick={handleExport} disabled={messages.length === 0} className="context-btn export-btn">
              {showExportSuccess ? '✅ Skopiowano!' : '📋 Eksportuj'}
            </button>
            <button onClick={() => setMessages([])} disabled={messages.length === 0} className="context-btn clear-btn">
              🗑 Nowa rozmowa
            </button>
          </div>
        </div>
        {!isContextCollapsed && (
          <div className="context-details">
            Wiadomości: {messages.length} | Szacowane tokeny: {Math.round(totalChars / 4)}
          </div>
        )}
      </div>

      <main className="messages-list">
        {messages.map((m) => {
          const modePart = m.parts.find((part) => part.type === 'data-mode') as any;
          const msgMode = modePart?.data as 'casual' | 'ekspert' | 'kreatywny' | undefined;

          const modelTypePart = m.parts.find((part) => part.type === 'data-model-type') as any;
          const msgModelType = modelTypePart?.data as 'flash' | 'pro' | undefined;

          const modelNamePart = m.parts.find((part) => part.type === 'data-model-name') as any;
          const msgModelName = modelNamePart?.data as string | undefined;

          return (
            <div key={m.id} className={`message-wrapper ${m.role}`}>
              <div className={`message ${m.role}`} style={{ display: 'flex', flexDirection: 'column' }}>
                {m.role === 'assistant' && (
                  <div className="badges-row">
                    {msgMode && (
                      <div className={`badge mode-badge ${msgMode}`}>
                        {msgMode === 'casual' && '💬 casual'}
                        {msgMode === 'ekspert' && '🎓 ekspert'}
                        {msgMode === 'kreatywny' && '🎨 kreatywny'}
                      </div>
                    )}
                    {msgModelType && (
                      <div className={`badge model-badge ${msgModelType}`}>
                        {msgModelType === 'flash' ? '⚡ Flash' : '🧠 Pro'}
                        {msgModelName && <span className="model-name-sub"> ({msgModelName})</span>}
                      </div>
                    )}
                  </div>
                )}
                {m.parts.map((part, index) => {
                  if (part.type === 'text') {
                    return (
                      <div key={index} className="markdown-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {part.text}
                        </ReactMarkdown>
                      </div>
                    );
                  }
                  if (part.type === 'reasoning') {
                    return (
                      <div key={index} className="reasoning">
                        {part.text}
                      </div>
                    );
                  }
                  if ((part as any).type === 'error') {
                    return (
                      <div key={index} className="error-message" style={{ color: '#ef4444', padding: '0.5rem', border: '1px solid #fee2e2', backgroundColor: '#fef2f2', borderRadius: '0.375rem', marginTop: '0.5rem' }}>
                        ⚠️ {(part as any).errorText || 'Wystąpił błąd w działaniu modelu.'}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          );
        })}
        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="message-wrapper assistant">
            <div className="message assistant loading-indicator">
              <span>Szukam informacji w internecie...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <div className="selectors-container">
        {/* Model Selector */}
        <div className="model-selector">
          <button
            type="button"
            onClick={() => setModel('flash')}
            className={`model-button flash-model ${model === 'flash' ? 'active' : ''}`}
          >
            ⚡ Flash (szybki)
          </button>
          <button
            type="button"
            onClick={() => setModel('pro')}
            className={`model-button pro-model ${model === 'pro' ? 'active' : ''}`}
          >
            🧠 Pro (zaawansowany)
          </button>
        </div>

        {/* Mode Selector */}
        <div className="mode-selector">
          <button
            type="button"
            onClick={() => setMode('casual')}
            className={`mode-button casual ${mode === 'casual' ? 'active' : ''}`}
          >
            💬 Casual
          </button>
          <button
            type="button"
            onClick={() => setMode('ekspert')}
            className={`mode-button ekspert ${mode === 'ekspert' ? 'active' : ''}`}
          >
            🎓 Ekspert
          </button>
          <button
            type="button"
            onClick={() => setMode('kreatywny')}
            className={`mode-button kreatywny ${mode === 'kreatywny' ? 'active' : ''}`}
          >
            🎨 Kreatywny
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="chat-form">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Zapytaj o cokolwiek aktualnego..."
          className="chat-input"
          required
        />
        <button type="submit" disabled={isLoading || !input.trim()} className="chat-button">
          Wyślij
        </button>
      </form>
    </div>
  );
}
