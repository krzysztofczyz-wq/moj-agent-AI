'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const EXAMPLES = [
  {
    title: '🚀 Premiera nowego projektu AI',
    topic: 'Wdrożenie nowego agenta AI opartego o model Gemini 3.1 i Next.js 16 do automatyzacji raportów biznesowych w firmie.',
    tone: 'Entuzjastyczny / Edukacyjny',
    audience: 'Programiści, startupowcy, CTO'
  },
  {
    title: '📈 Produktywność pracy zdalnej',
    topic: 'Kluczowe nawyki poprawiające produktywność podczas pracy zdalnej w IT na podstawie badań z 2026 roku.',
    tone: 'Profesjonalny / Poradnikowy',
    audience: 'Pracownicy biurowi, freelancerzy, menedżerowie'
  },
  {
    title: '⚠️ Cyberbezpieczeństwo i Phishing',
    topic: 'Ostrzeżenie przed nową falą ataków phishingowych udających maile od urzędów skarbowych w Polsce.',
    tone: 'Poważny / Ostrzegawczy',
    audience: 'Wszyscy użytkownicy internetu, mikroprzedsiębiorcy'
  }
];

export default function SocialMediaPage() {
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('Profesjonalny');
  const [audience, setAudience] = useState('Ogólna społeczność biznesowa');
  
  const [rawResult, setRawResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'linkedin' | 'twitter' | 'instagram' | 'full'>('full');
  
  const [copiedStates, setCopiedStates] = useState<{ [key: string]: boolean }>({
    linkedin: false,
    twitter: false,
    instagram: false,
    full: false
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleExampleClick = (ex: typeof EXAMPLES[0]) => {
    setTopic(ex.topic);
    setTone(ex.tone);
    setAudience(ex.audience);
    setRawResult('');
    setErrorMsg(null);
  };

  const handleGenerate = async () => {
    if (!topic.trim() || isLoading) return;
    setIsLoading(true);
    setRawResult('');
    setErrorMsg(null);
    setActiveTab('full'); // Default to full markdown view during generation

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const activeToken = session?.access_token ?? null;

      const response = await fetch('/api/social-media', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          topic: topic.trim(),
          tone: tone.trim(),
          audience: audience.trim()
        })
      });

      if (!response.ok) {
        const status = response.status;
        const statusText = response.statusText;
        let errorMessage = '';
        try {
          const errData = await response.json();
          errorMessage = errData.error || JSON.stringify(errData);
        } catch (e) {
          errorMessage = await response.text().catch(() => '');
        }
        
        throw new Error(
          `Błąd API (${status} ${statusText}): ${errorMessage || 'Nieznany błąd serwera.'}`
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Brak strumienia danych.');
      }

      const decoder = new TextDecoder();
      let resultText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resultText += decoder.decode(value, { stream: true });
        setRawResult(resultText);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Wystąpił błąd podczas generowania postów.');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to parse the streamed markdown text and extract code blocks
  const parsePosts = (text: string) => {
    const result = { linkedin: '', twitter: '', instagram: '', research: '' };
    if (!text) return result;

    // Use regex to find text inside code blocks
    // A robust way is splitting on ```text and ```
    const segments = text.split(/```text|```/);
    
    // Based on our route prompt, they should be in sequence:
    // segments[1] -> LinkedIn
    // segments[3] -> Twitter/X
    // segments[5] -> Instagram
    if (segments.length > 1) result.linkedin = segments[1].trim();
    if (segments.length > 3) result.twitter = segments[3].trim();
    if (segments.length > 5) result.instagram = segments[5].trim();

    // Extract research section if present
    const researchIdx = text.indexOf('## 🔍');
    if (researchIdx !== -1) {
      result.research = text.slice(researchIdx).trim();
    }

    return result;
  };

  const parsed = parsePosts(rawResult);

  const handleCopyText = (content: string, key: string) => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopiedStates(prev => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setCopiedStates(prev => ({ ...prev, [key]: false }));
    }, 2000);
  };

  return (
    <div className="social-page-container">
      <style jsx>{`
        .social-page-container {
          max-width: 1000px;
          width: 100%;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 2rem;
          padding: 1rem 0;
        }

        .header-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .header-title {
          font-size: 2.25rem;
          font-weight: 800;
          margin: 0;
          background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .header-subtitle {
          color: #94a3b8;
          font-size: 1rem;
          margin: 0;
        }

        .input-card {
          background: rgba(30, 30, 45, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 1.5rem;
          backdrop-filter: blur(12px);
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .input-label {
          font-size: 0.85rem;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .text-input {
          background: rgba(10, 10, 15, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: #e2e8f0;
          padding: 0.75rem 1rem;
          font-size: 0.95rem;
          outline: none;
          transition: border-color 0.2s;
        }

        .text-input:focus {
          border-color: #10b981;
        }

        .textarea-input {
          background: rgba(10, 10, 15, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: #e2e8f0;
          padding: 0.75rem 1rem;
          font-size: 0.95rem;
          outline: none;
          resize: vertical;
          min-height: 90px;
          transition: border-color 0.2s;
          font-family: inherit;
        }

        .textarea-input:focus {
          border-color: #10b981;
        }

        .inputs-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        @media(max-width: 640px) {
          .inputs-row {
            grid-template-columns: 1fr;
          }
        }

        .select-input {
          background: rgba(10, 10, 15, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: #e2e8f0;
          padding: 0.75rem 1rem;
          font-size: 0.95rem;
          outline: none;
          cursor: pointer;
        }

        .select-input:focus {
          border-color: #10b981;
        }

        .btn {
          padding: 0.75rem 1.5rem;
          border-radius: 12px;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .btn-primary {
          background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%);
          border: none;
          color: white;
          box-shadow: 0 4px 15px rgba(16, 185, 129, 0.2);
          width: 100%;
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(16, 185, 129, 0.3);
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .examples-wrap {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .examples-title {
          font-size: 0.75rem;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .examples-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .example-pill {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: #94a3b8;
          padding: 0.4rem 0.8rem;
          border-radius: 20px;
          font-size: 0.78rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .example-pill:hover {
          background: rgba(16, 185, 129, 0.1);
          color: #34d399;
          border-color: rgba(16, 185, 129, 0.3);
        }

        .loader-bar {
          height: 3px;
          width: 100%;
          background: rgba(255,255,255,0.05);
          border-radius: 2px;
          overflow: hidden;
        }

        .loader-fill {
          height: 100%;
          width: 40%;
          background: linear-gradient(90deg, #10b981, #3b82f6);
          animation: pulse-slide 1.5s infinite ease-in-out;
        }

        @keyframes pulse-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }

        .banner {
          padding: 1rem;
          border-radius: 12px;
          font-size: 0.9rem;
        }

        .banner-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #fca5a5;
        }

        .result-container {
          background: rgba(30, 30, 45, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: fadeIn 0.4s ease-out;
        }

        .tabs-header {
          display: flex;
          background: rgba(0, 0, 0, 0.2);
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          overflow-x: auto;
        }

        .tab-btn {
          flex: 1;
          min-width: 120px;
          background: none;
          border: none;
          padding: 1rem;
          color: #64748b;
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
          border-bottom: 2px solid transparent;
          white-space: nowrap;
        }

        .tab-btn:hover {
          color: #e2e8f0;
          background: rgba(255, 255, 255, 0.02);
        }

        .tab-btn.active {
          color: #10b981;
          border-bottom-color: #10b981;
          background: rgba(16, 185, 129, 0.03);
        }

        .tab-content {
          padding: 2rem;
          min-height: 250px;
          position: relative;
        }

        .post-card {
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 1.5rem;
          white-space: pre-wrap;
          font-family: inherit;
          font-size: 0.98rem;
          line-height: 1.6;
          color: #e2e8f0;
        }

        .btn-copy-float {
          position: absolute;
          top: 3rem;
          right: 3rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #94a3b8;
          padding: 0.4rem 0.8rem;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-copy-float:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
        }

        .btn-copy-float.success {
          background: rgba(16, 185, 129, 0.15);
          border-color: rgba(16, 185, 129, 0.3);
          color: #86efac;
        }

        .char-counter {
          font-size: 0.75rem;
          font-weight: 700;
          color: #64748b;
          text-align: right;
          margin-top: 0.5rem;
        }

        .char-counter.warning {
          color: #f59e0b;
        }

        .char-counter.danger {
          color: #ef4444;
        }

        .markdown-view {
          color: #cbd5e1;
          font-size: 0.98rem;
          line-height: 1.7;
        }

        .markdown-view :global(h2) {
          font-size: 1.3rem;
          color: #ffffff;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 0.3rem;
        }

        .markdown-view :global(pre) {
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 1rem;
          border-radius: 8px;
          margin: 1rem 0;
          overflow-x: auto;
        }

        .markdown-view :global(p) {
          margin-bottom: 1rem;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="header-section">
        <h1 className="header-title">📱 Generator postów social media</h1>
        <p className="header-subtitle">Podaj temat — agent przygotuje posty na LinkedIn, Twitter/X i Instagram</p>
      </div>

      <div className="input-card">
        <div className="input-group">
          <label className="input-label">O czym ma być post?</label>
          <textarea
            className="textarea-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Wpisz temat, wydarzenie, nowość produktową lub wklej notatki z artykułu..."
            disabled={isLoading}
          />
        </div>

        <div className="inputs-row">
          <div className="input-group">
            <label className="input-label">Ton wypowiedzi</label>
            <select
              className="select-input"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              disabled={isLoading}
            >
              <option value="Profesjonalny i merytoryczny">👔 Profesjonalny</option>
              <option value="Luźny, pełen humoru i emoji">😎 Luźny / Humorystyczny</option>
              <option value="Edukacyjny i ekspercki">🧠 Ekspercki</option>
              <option value="Entuzjastyczny i energetyczny">🔥 Entuzjastyczny</option>
              <option value="Kontrowersyjny i prowokujący do dyskusji">⚡ Kontrowersyjny</option>
            </select>
          </div>

          <div className="input-group">
            <label className="input-label">Grupa docelowa</label>
            <input
              type="text"
              className="text-input"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="Np. programiści, inwestorzy, klienci B2B..."
              disabled={isLoading}
            />
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={isLoading || !topic.trim()}
        >
          {isLoading ? '⏳ Opracowywanie i pisanie postów...' : '📱 Generuj posty'}
        </button>

        <div className="examples-wrap">
          <span className="examples-title">Szybkie przykłady:</span>
          <div className="examples-list">
            {EXAMPLES.map((ex, idx) => (
              <button
                key={idx}
                className="example-pill"
                onClick={() => handleExampleClick(ex)}
                disabled={isLoading}
              >
                {ex.title}
              </button>
            ))}
          </div>
        </div>

        {isLoading && (
          <div className="loader-bar">
            <div className="loader-fill"></div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="banner banner-error">
          ⚠️ {errorMsg}
        </div>
      )}

      {rawResult && (
        <div className="result-container">
          <div className="tabs-header">
            <button
              className={`tab-btn ${activeTab === 'full' ? 'active' : ''}`}
              onClick={() => setActiveTab('full')}
            >
              📑 Cały Raport
            </button>
            <button
              className={`tab-btn ${activeTab === 'linkedin' ? 'active' : ''}`}
              onClick={() => setActiveTab('linkedin')}
              disabled={!parsed.linkedin && isLoading}
            >
              🔗 LinkedIn
            </button>
            <button
              className={`tab-btn ${activeTab === 'twitter' ? 'active' : ''}`}
              onClick={() => setActiveTab('twitter')}
              disabled={!parsed.twitter && isLoading}
            >
              🐦 Twitter/X
            </button>
            <button
              className={`tab-btn ${activeTab === 'instagram' ? 'active' : ''}`}
              onClick={() => setActiveTab('instagram')}
              disabled={!parsed.instagram && isLoading}
            >
              📸 Instagram
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'full' && (
              <div className="markdown-view">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {rawResult}
                </ReactMarkdown>
                {rawResult && (
                  <button
                    className={`btn-copy-float ${copiedStates.full ? 'success' : ''}`}
                    onClick={() => handleCopyText(rawResult, 'full')}
                  >
                    {copiedStates.full ? '✓ Skopiowano' : '📋 Kopiuj raport'}
                  </button>
                )}
              </div>
            )}

            {activeTab === 'linkedin' && parsed.linkedin && (
              <div>
                <button
                  className={`btn-copy-float ${copiedStates.linkedin ? 'success' : ''}`}
                  onClick={() => handleCopyText(parsed.linkedin, 'linkedin')}
                >
                  {copiedStates.linkedin ? '✓ Skopiowano' : '📋 Kopiuj post'}
                </button>
                <div className="post-card">
                  {parsed.linkedin}
                </div>
              </div>
            )}

            {activeTab === 'twitter' && parsed.twitter && (
              <div>
                <button
                  className={`btn-copy-float ${copiedStates.twitter ? 'success' : ''}`}
                  onClick={() => handleCopyText(parsed.twitter, 'twitter')}
                >
                  {copiedStates.twitter ? '✓ Skopiowano' : '📋 Kopiuj Tweet'}
                </button>
                <div className="post-card">
                  {parsed.twitter}
                </div>
                <div className={`char-counter ${parsed.twitter.length > 280 ? 'danger' : parsed.twitter.length > 250 ? 'warning' : ''}`}>
                  Znaki: {parsed.twitter.length} / 280
                </div>
              </div>
            )}

            {activeTab === 'instagram' && parsed.instagram && (
              <div>
                <button
                  className={`btn-copy-float ${copiedStates.instagram ? 'success' : ''}`}
                  onClick={() => handleCopyText(parsed.instagram, 'instagram')}
                >
                  {copiedStates.instagram ? '✓ Skopiowano' : '📋 Kopiuj post'}
                </button>
                <div className="post-card">
                  {parsed.instagram}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
