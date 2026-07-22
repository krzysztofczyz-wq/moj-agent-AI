'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { DefaultChatTransport } from 'ai';

export default function FewShotPage() {
  const [model, setModel] = useState<'flash' | 'pro'>('flash');
  const [showExportSuccess, setShowExportSuccess] = useState(false);
  const [isContextCollapsed, setIsContextCollapsed] = useState(true);
  
  // Point to the /api/fewshot endpoint using DefaultChatTransport
  const { messages, sendMessage, setMessages, status } = useChat({ 
    transport: new DefaultChatTransport({ api: '/api/fewshot' }) 
  });
  
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isLoading = status === 'submitted' || status === 'streaming';
  const pathname = usePathname();

  const suggestions = [
    "Sztuczna inteligencja",
    "Agent AI",
    "Prompt",
    "Halucynacja AI",
    "RAG",
    "API"
  ];

  // Auto-scroll to the bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    sendMessage({ text: input }, { body: { model } });
    setInput('');
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (isLoading) return;
    setInput(suggestion);
  };

  const totalChars = messages.reduce((acc, m) => 
    acc + m.parts.reduce((partAcc, part) => 
      partAcc + (part.type === 'text' ? part.text.length : 0), 0
    ), 0
  );

  const handleExport = () => {
    const text = messages.map(m => {
      const sender = m.role === 'user' ? 'User' : 'Słownik (Agent)';
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
        <h1>📚 Słownik AI 📖</h1>
        <p className="chat-subheader">Wyjaśniam trudne pojęcia prostym językiem</p>
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
          const modelTypePart = m.parts.find((part) => part.type === 'data-model-type') as any;
          const msgModelType = modelTypePart?.data as 'flash' | 'pro' | undefined;

          const modelNamePart = m.parts.find((part) => part.type === 'data-model-name') as any;
          const msgModelName = modelNamePart?.data as string | undefined;

          return (
            <div key={m.id} className={`message-wrapper ${m.role}`}>
              <div className={`message ${m.role}`} style={{ display: 'flex', flexDirection: 'column' }}>
                {m.role === 'assistant' && (
                  <div className="badges-row">
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
                    return <span key={index} style={{ whiteSpace: 'pre-wrap' }}>{part.text}</span>;
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
              <span>Szukam definicji...</span>
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
      </div>

      <div style={{ padding: '0 2rem' }}>
        {/* Suggestion Buttons */}
        <div className="suggestions-list" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {suggestions.map((s, idx) => (
            <button 
              key={idx} 
              onClick={() => handleSuggestionClick(s)} 
              disabled={isLoading}
              className="suggestion-btn"
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="chat-form">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Wpisz pojęcie do wyjaśnienia..."
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
