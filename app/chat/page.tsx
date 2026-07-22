'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState, Fragment } from 'react';
import { supabase } from '../../lib/supabase';

export default function ChatPage() {
  const [mode, setMode] = useState<'casual' | 'ekspert' | 'kreatywny'>('casual');
  const [model, setModel] = useState<'flash' | 'pro'>('flash');
  const [showExportSuccess, setShowExportSuccess] = useState(false);
  const [isContextCollapsed, setIsContextCollapsed] = useState(true);
  
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isDbLoading, setIsDbLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  const convIdRef = useRef<string | null>(null);
  convIdRef.current = currentConversationId;

  const { messages, sendMessage, setMessages, status } = useChat({
    onFinish: async ({ message }) => {
      const activeId = convIdRef.current;
      if (activeId) {
        try {
          // Extract text content from parts
          const assistantContent = message.parts
            .filter((p: any) => p.type === 'text')
            .map((p: any) => p.text)
            .join('\n');

          // Save assistant message to Supabase
          await supabase.from('messages').insert({
            conversation_id: activeId,
            role: 'assistant',
            content: assistantContent
          });
          
          // Update updated_at of the conversation
          await supabase.from('conversations').update({
            updated_at: new Date().toISOString()
          }).eq('id', activeId);

          // If name is not set on client yet, check if it was updated in DB
          if (!userName && userId) {
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('name')
              .eq('id', userId)
              .single();
            if (profile?.name) {
              setUserName(profile.name);
            }
          }
        } catch (err) {
          console.error('Error saving assistant response:', err);
        }
      }
    }
  });
  
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isLoading = status === 'submitted' || status === 'streaming';

  const suggestions = [
    "Jak zbudować zdywersyfikowany portfel ETF-ów?",
    "Co oznacza wskaźnik C/Z (Cena do Zysku) przy wycenie akcji?",
    "Czy warto teraz inwestować w obligacje skarbowe?",
    "Jak zabezpieczyć portfel przed inflacją?"
  ];

  // Load last session and initialize user_id on mount
  useEffect(() => {
    const initializeUserAndSession = async () => {
      setIsDbLoading(true);
      try {
        // 1. Get user session from Supabase Auth
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setIsDbLoading(false);
          return;
        }

        const activeUser = session.user;
        setUserId(activeUser.id);
        setToken(session.access_token);

        // Verify/Create profile
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id, name')
          .eq('id', activeUser.id)
          .single();
        
        if (profile) {
          setUserName(profile.name);
        } else {
          await supabase.from('user_profiles').insert({
            id: activeUser.id,
            name: null,
            preferences: {}
          });
        }

        // 2. Determine which conversation to load
        let targetConvId: string | null = null;
        
        // Read "id" query parameter from URL (safe inside client-side useEffect)
        const params = new URLSearchParams(window.location.search);
        const queryId = params.get('id');
        
        if (queryId) {
          // Verify if this conversation exists for this user
          const { data: conv } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', queryId)
            .eq('user_id', activeUser.id)
            .single();
          if (conv) {
            targetConvId = queryId;
          }
        }

        if (!targetConvId) {
          // Fetch last conversation ordered by updated_at desc, filtered by user_id!
          const { data: conversations, error: convError } = await supabase
            .from('conversations')
            .select('*')
            .eq('user_id', activeUser.id)
            .order('updated_at', { ascending: false })
            .limit(1);

          if (convError) throw convError;
          if (conversations && conversations.length > 0) {
            targetConvId = conversations[0].id;
          }
        }

        if (targetConvId) {
          setCurrentConversationId(targetConvId);
          convIdRef.current = targetConvId;

          // Fetch all messages for this conversation ordered by created_at asc
          const { data: dbMessages, error: msgError } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', targetConvId)
            .order('created_at', { ascending: true });

          if (msgError) throw msgError;

          if (dbMessages) {
            setMessages(dbMessages.map((m: any) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              parts: [{ type: 'text', text: m.content }]
            })));
          }
        }
      } catch (err) {
        console.error('Error in initializeUserAndSession:', err);
      } finally {
        setIsDbLoading(false);
      }
    };

    initializeUserAndSession();
  }, [setMessages]);

  // Auto-scroll to the bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !userId) return;

    let convId = currentConversationId;
    const userText = input.trim();

    try {
      if (!convId) {
        const title = userText.slice(0, 50);
        const { data: newConv, error: newConvError } = await supabase
          .from('conversations')
          .insert({ title, user_id: userId })
          .select()
          .single();

        if (newConvError) throw newConvError;
        convId = newConv.id;
        setCurrentConversationId(convId);
        convIdRef.current = convId;
      }

      // Save user message in background
      supabase.from('messages')
        .insert({ conversation_id: convId, role: 'user', content: userText })
        .then(({ error }) => {
          if (error) console.error('Error saving user message:', error);
        });

      // Update updated_at in background
      supabase.from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', convId)
        .then(({ error }) => {
          if (error) console.error('Error updating conversation updated_at:', error);
        });

      sendMessage({ text: userText }, { 
        body: { mode, model, userId },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      setInput('');
    } catch (err) {
      console.error('Failed to submit message:', err);
    }
  };

  const handleSuggestionClick = async (suggestion: string) => {
    if (isLoading || !userId) return;

    let convId = currentConversationId;
    const userText = suggestion.trim();

    try {
      if (!convId) {
        const title = userText.slice(0, 50);
        const { data: newConv, error: newConvError } = await supabase
          .from('conversations')
          .insert({ title, user_id: userId })
          .select()
          .single();

        if (newConvError) throw newConvError;
        convId = newConv.id;
        setCurrentConversationId(convId);
        convIdRef.current = convId;
      }

      // Save user message in background
      supabase.from('messages')
        .insert({ conversation_id: convId, role: 'user', content: userText })
        .then(({ error }) => {
          if (error) console.error('Error saving user message:', error);
        });

      // Update updated_at in background
      supabase.from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', convId)
        .then(({ error }) => {
          if (error) console.error('Error updating conversation updated_at:', error);
        });

      sendMessage({ text: userText }, { 
        body: { mode, model, userId },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
    } catch (err) {
      console.error('Failed to submit suggestion:', err);
    }
  };

  const totalChars = messages.reduce((acc, m) => 
    acc + m.parts.reduce((partAcc, part) => 
      partAcc + (part.type === 'text' ? part.text.length : 0), 0
    ), 0
  );

  const handleNewChat = () => {
    setMessages([]);
    setCurrentConversationId(null);
    convIdRef.current = null;
  };

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
        <h1>Oskar – Licencjonowany Makler Giełdowy 📈</h1>
        <p className="chat-subheader">Ekspert od rynków kapitałowych i portfela. Zapytaj mnie o analizę spółek, ETF-y czy optymalizację inwestycji.</p>
        
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
            <button 
              onClick={handleNewChat} 
              disabled={messages.length === 0 && !currentConversationId} 
              className="context-btn clear-btn"
            >
              ➕ Nowa rozmowa
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
        {isDbLoading ? (
          <div className="db-loading-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', gap: '1rem', minHeight: '200px' }}>
            <div className="db-spinner" style={{ width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.1)', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>Wczytywanie historii rozmowy...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="welcome-card" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '3rem 2rem',
            margin: '2rem auto',
            maxWidth: '600px',
            background: 'rgba(255, 255, 255, 0.015)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(10px)',
            borderRadius: '20px',
            color: '#f4f4f7',
            animation: 'fadeIn 0.5s ease'
          }}>
            <span style={{ fontSize: '3rem', marginBottom: '1.25rem' }}>👋</span>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.75rem 0', background: 'linear-gradient(135deg, #ffffff, #a5b4fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {userName ? `Cześć, ${userName}!` : 'Witaj w Antigravity Agent!'}
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.6', margin: 0, maxWidth: '480px' }}>
              {userName 
                ? 'Miło Cię widzieć ponownie! O czym chciałbyś dzisiaj porozmawiać? Możesz zadać mi pytanie finansowe, poprosić o analizę ETF lub optymalizację portfela.'
                : 'Jestem Oskar – Twój doradca inwestycyjny. Zanim zaczniemy analizować rynek, zdradzisz mi jak masz na imię?'}
            </p>
          </div>
        ) : (
          messages.map((m) => {
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
                      const text = part.text;
                      const sourceRegex = /(?:^|\n)(📎 Źródł[oa]:\s*[^\n]+)/;
                      const match = text.match(sourceRegex);
                      
                      if (match) {
                        const cleanText = text.replace(match[0], '');
                        const sourceStr = match[1];
                        const labelPart = sourceStr.includes('Źródła:') ? '📎 Źródła:' : '📎 Źródło:';
                        const titlesStr = sourceStr.replace(labelPart, '').trim();
                        const titles = titlesStr.split(',').map((t: string) => t.trim());

                        return (
                          <div key={index} style={{ display: 'flex', flexDirection: 'column' }}>
                            <span>{cleanText}</span>
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
                          </div>
                        );
                      }
                      return <span key={index}>{part.text}</span>;
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
          })
        )}
        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="message-wrapper assistant">
            <div className="message assistant loading-indicator">
              <span>Myślę...</span>
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
            className={`model-button casual ${mode === 'casual' ? 'active' : ''}`}
          >
            💬 Casual
          </button>
          <button
            type="button"
            onClick={() => setMode('ekspert')}
            className={`model-button ekspert ${mode === 'ekspert' ? 'active' : ''}`}
          >
            🎓 Ekspert
          </button>
          <button
            type="button"
            onClick={() => setMode('kreatywny')}
            className={`model-button kreatywny ${mode === 'kreatywny' ? 'active' : ''}`}
          >
            🎨 Kreatywny
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="chat-form">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Napisz wiadomość..."
          className="chat-input"
          required
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()} className="chat-button">
          Wyślij
        </button>
      </form>
    </div>
  );
}
