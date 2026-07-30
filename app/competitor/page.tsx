'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const EXAMPLES = [
  { c1: 'Shopify', c2: 'WooCommerce', c3: 'PrestaShop', ctx: 'Szukam platformy e-commerce dla małego, lokalnego sklepu z odzieżą. Budżet na start jest mały, a zależy mi na prostocie obsługi.' },
  { c1: 'Notion', c2: 'Obsidian', c3: 'Evernote', ctx: 'Szukam systemu do prowadzenia notatek ze studiów i organizacji zadań. Zależy mi na dobrej wyszukiwarce oraz możliwości łączenia notatek.' },
  { c1: 'Vercel', c2: 'Netlify', c3: 'Railway', ctx: 'Szukam hostingu dla małej aplikacji Next.js połączonej z bazą danych PostgreSQL.' },
  { c1: 'ChatGPT', c2: 'Claude', c3: 'Gemini', ctx: 'Szukam asystenta AI do codziennego pisania maili biznesowych oraz analizowania długich dokumentów PDF.' }
];

export default function CompetitorPage() {
  const [company1, setCompany1] = useState('');
  const [company2, setCompany2] = useState('');
  const [company3, setCompany3] = useState('');
  const [context, setContext] = useState('');
  
  const [rawResult, setRawResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleExampleClick = (ex: typeof EXAMPLES[0]) => {
    setCompany1(ex.c1);
    setCompany2(ex.c2);
    setCompany3(ex.c3);
    setContext(ex.ctx);
    setRawResult('');
    setErrorMsg(null);
  };

  const handleGenerate = async () => {
    if (!company1.trim() || !company2.trim() || !company3.trim() || isLoading) return;
    setIsLoading(true);
    setRawResult('');
    setErrorMsg(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const activeToken = session?.access_token ?? null;

      const response = await fetch('/api/competitor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          company1: company1.trim(),
          company2: company2.trim(),
          company3: company3.trim(),
          context: context.trim()
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
      setErrorMsg(err.message || 'Wystąpił błąd podczas analizowania konkurencji.');
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

  return (
    <div className="competitor-page-container">
      <style jsx>{`
        .competitor-page-container {
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

        .inputs-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
        }

        @media(max-width: 768px) {
          .inputs-grid {
            grid-template-columns: 1fr;
          }
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
          min-height: 80px;
          transition: border-color 0.2s;
          font-family: inherit;
        }

        .textarea-input:focus {
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
        <h1 className="header-title">🏢 Analiza konkurencji</h1>
        <p className="header-subtitle">Podaj firmy — agent porówna je za Ciebie</p>
      </div>

      <div className="input-card">
        <div className="inputs-grid">
          <div className="input-group">
            <label className="input-label">Firma 1</label>
            <input
              type="text"
              className="text-input"
              value={company1}
              onChange={(e) => setCompany1(e.target.value)}
              placeholder="Np. Shopify"
              disabled={isLoading}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Firma 2</label>
            <input
              type="text"
              className="text-input"
              value={company2}
              onChange={(e) => setCompany2(e.target.value)}
              placeholder="Np. WooCommerce"
              disabled={isLoading}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Firma 3</label>
            <input
              type="text"
              className="text-input"
              value={company3}
              onChange={(e) => setCompany3(e.target.value)}
              placeholder="Np. PrestaShop"
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Kontekst (opcjonalnie)</label>
          <textarea
            className="textarea-input"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Opisz swoje potrzeby, np. Szukam platformy e-commerce dla małego sklepu z odzieżą..."
            disabled={isLoading}
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={isLoading || !company1.trim() || !company2.trim() || !company3.trim()}
        >
          {isLoading ? '⏳ Szukanie i analizowanie...' : '🔍 Porównaj konkurencję'}
        </button>

        <div className="examples-wrap">
          <span className="examples-title">Szybkie porównania:</span>
          <div className="examples-list">
            {EXAMPLES.map((ex, idx) => (
              <button
                key={idx}
                className="example-pill"
                onClick={() => handleExampleClick(ex)}
                disabled={isLoading}
              >
                {ex.c1} vs {ex.c2} vs {ex.c3}
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
        <div className="report-card">
          <div className="card-toolbar">
            <button
              className={`btn-toolbar ${isCopied ? 'success' : ''}`}
              onClick={handleCopy}
            >
              {isCopied ? '✓ Skopiowano' : '📋 Kopiuj analizę'}
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
