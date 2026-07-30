'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const EXAMPLES = [
  "Rynek AI w Polsce — trendy, firmy, prognozy na 2026",
  "Porównanie platform e-commerce: Shopify vs WooCommerce vs PrestaShop",
  "Wpływ pracy zdalnej na produktywność — badania i statystyki",
  "Rynek nieruchomości w Krakowie — ceny, trendy, prognozy"
];

export default function ReportPage() {
  const [topic, setTopic] = useState('');
  const [rawResult, setRawResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  
  const [isCopied, setIsCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setToken(session?.access_token ?? null);
    });
  }, []);

  const handleExampleClick = (ex: string) => {
    setTopic(ex);
    setRawResult('');
    setSuccessMsg(null);
    setErrorMsg(null);
  };

  const handleGenerate = async () => {
    if (!topic.trim() || isLoading) return;
    setIsLoading(true);
    setRawResult('');
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const activeToken = session?.access_token ?? null;

      const response = await fetch('/api/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({ topic })
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
          `Błąd API (${status} ${statusText}): ${errorMessage || 'Nieznany błąd serwera.'} ` +
          (status === 504 ? 'Prawdopodobnie przekroczono limit czasu (Timeout 10s) na darmowym planie Vercel.' : '')
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
      setErrorMsg(err.message || 'Wystąpił błąd podczas generowania raportu.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!rawResult) return;
    navigator.clipboard.writeText(rawResult);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSaveToDb = async () => {
    if (!rawResult || isSaving) return;
    setIsSaving(true);
    setSaveProgress('Inicjalizacja zapisu w bazie wiedzy...');
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const activeToken = session?.access_token ?? null;

      const response = await fetch('/api/upload-knowledge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          title: `Raport: ${topic.slice(0, 80)}`,
          content: rawResult
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Błąd zapisu do bazy.');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Brak strumienia postępu zapisu.');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.status === 'processing') {
              setSaveProgress(`Przetwarzanie raportu: fragment ${data.current}/${data.total}...`);
            } else if (data.status === 'done') {
              setSuccessMsg(`Raport został pomyślnie zapisany w bazie wiedzy i podzielony na ${data.chunks_saved} fragmentów!`);
            } else if (data.status === 'error') {
              throw new Error(data.message || 'Wystąpił błąd zapisu w Supabase.');
            }
          } catch (e) {
            // Ignore parse errors on partial streams
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Wystąpił błąd podczas zapisywania w bazie.');
    } finally {
      setIsSaving(false);
      setSaveProgress(null);
    }
  };

  return (
    <div className="report-page-container">
      <style jsx>{`
        .report-page-container {
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
          background: linear-gradient(135deg, #34d399 0%, #3b82f6 100%);
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

        .input-row {
          display: flex;
          gap: 1rem;
        }

        @media(max-width: 640px) {
          .input-row {
            flex-direction: column;
          }
        }

        .text-input {
          flex: 1;
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
          border-color: #34d399;
        }

        .btn {
          padding: 0.75rem 1.5rem;
          border-radius: 12px;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .btn-primary {
          background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%);
          border: none;
          color: white;
          box-shadow: 0 4px 15px rgba(16, 185, 129, 0.2);
          white-space: nowrap;
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

        .banner-success {
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.25);
          color: #86efac;
        }

        .banner-progress {
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.25);
          color: #93c5fd;
        }

        .report-card {
          background: rgba(30, 30, 45, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: fadeIn 0.4s ease-out;
        }

        .card-toolbar {
          padding: 1rem 1.5rem;
          background: rgba(0, 0, 0, 0.2);
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
        }

        .btn-toolbar {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        .btn-toolbar:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.08);
          color: #e2e8f0;
          border-color: rgba(255, 255, 255, 0.15);
        }

        .btn-toolbar.success {
          background: rgba(16, 185, 129, 0.1);
          border-color: rgba(16, 185, 129, 0.3);
          color: #86efac;
        }

        .report-body {
          padding: 2rem 2.5rem;
          color: #cbd5e1;
          font-size: 0.98rem;
          line-height: 1.7;
        }

        .report-body :global(h1) {
          font-size: 1.8rem;
          color: #ffffff;
          margin-top: 0;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-bottom: 0.5rem;
        }

        .report-body :global(h2) {
          font-size: 1.3rem;
          color: #f1f5f9;
          margin-top: 2rem;
          margin-bottom: 1rem;
        }

        .report-body :global(p) {
          margin-bottom: 1.25rem;
        }

        .report-body :global(ul), .report-body :global(ol) {
          margin-bottom: 1.25rem;
          padding-left: 1.5rem;
        }

        .report-body :global(li) {
          margin-bottom: 0.5rem;
        }

        .report-body :global(blockquote) {
          background: rgba(255, 255, 255, 0.02);
          border-left: 4px solid #10b981;
          padding: 1rem 1.5rem;
          border-radius: 8px;
          margin: 1.5rem 0;
          font-style: italic;
          color: #e2e8f0;
        }

        .report-body :global(table) {
          width: 100%;
          border-collapse: collapse;
          margin: 1.5rem 0;
        }

        .report-body :global(th), .report-body :global(td) {
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 0.75rem 1rem;
          text-align: left;
        }

        .report-body :global(th) {
          background: rgba(0, 0, 0, 0.2);
          font-weight: 700;
        }

        .report-body :global(a) {
          color: #34d399;
          text-decoration: underline;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="header-section">
        <h1 className="header-title">📊 Generator raportów</h1>
        <p className="header-subtitle">Opisz temat — agent napisze raport biznesowy</p>
      </div>

      <div className="input-card">
        <div className="input-group">
          <label className="input-label">O czym ma być raport?</label>
          <div className="input-row">
            <input
              type="text"
              className="text-input"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Np. Rynek AI w Polsce w 2026 roku..."
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleGenerate();
              }}
            />
            <button className="btn btn-primary" onClick={handleGenerate} disabled={isLoading || !topic.trim()}>
              {isLoading ? '⏳ Generowanie...' : '📊 Generuj raport'}
            </button>
          </div>
        </div>

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
                {ex}
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

      {saveProgress && (
        <div className="banner banner-progress">
          ⚙️ {saveProgress}
        </div>
      )}

      {successMsg && (
        <div className="banner banner-success">
          ✓ {successMsg}
        </div>
      )}

      {rawResult && (
        <div className="report-card">
          <div className="card-toolbar">
            <button
              className={`btn-toolbar ${isCopied ? 'success' : ''}`}
              onClick={handleCopy}
            >
              {isCopied ? '✓ Skopiowano' : '📋 Kopiuj do schowka'}
            </button>
            <button
              className="btn-toolbar"
              onClick={handleSaveToDb}
              disabled={isSaving}
            >
              💾 Zapisz w bazie
            </button>
          </div>
          <div className="report-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {rawResult}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
