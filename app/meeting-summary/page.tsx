'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const EXAMPLES = [
  {
    title: '💻 Sync zespołu produktowego',
    notes: `Sync zespołu produktowego - 30.07.2026.
Obecni: Janek (PM), Kasia (Dev), Michał (Design).
Temat: Migracja i RAG.
Janek zaczął od tego, że musimy podjąć decyzję o przejściu na Next.js 16 i sprawdzić stabilność Turbopacka. Kasia mówi, że na localhost działa super, ale na Vercel musimy uważać na Edge Runtime. Michał skończył mockupy nowego panelu historii rozmów.

Decyzje:
- Przechodzimy na Next.js 16 od przyszłego tygodnia.
- Projekt bazy wiedzy będzie oparty o Supabase wektorowy.

Zadania:
- Kasia: przygotować branch testowy z Next.js 16 do środy.
- Michał: wrzucić mockupy w Figmie do piątku rano.
- Janek: opisać wymagania do integracji z Shopify dla klienta do końca tygodnia.`
  },
  {
    title: '🎯 Kickoff kampanii Q3',
    notes: `Kickoff kampanii marketingowej Q3.
Uczestnicy: Ola (Marketing), Tomek (Sales), Anna (Content).
Tomek mówi, że potrzebujemy nowych leadów z LinkedIn, bo zimne maile mają słaby open rate. Ola proponuje serię krótkich filmów na TikTok oraz artykuły eksperckie na blogu.

Ustalenia:
- Budżet na reklamy LinkedIn zwiększamy o 15% kosztem Google Ads.
- Użyjemy HubSpot do automatyzacji follow-upów.

Action Items:
- Ola: skonfigurować piksel LinkedIn i odpalić kampanię do 10 sierpnia.
- Anna: napisać 3 artykuły blogowe o automatyzacji procesów w firmie (termin: 15.08).
- Tomek: przygotować szablony wiadomości w HubSpot do końca przyszłego tygodnia.`
  }
];

export default function MeetingSummaryPage() {
  const [notes, setNotes] = useState('');
  const [rawResult, setRawResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleExampleClick = (ex: typeof EXAMPLES[0]) => {
    setNotes(ex.notes);
    setRawResult('');
    setErrorMsg(null);
  };

  const handleGenerate = async () => {
    if (!notes.trim() || isLoading) return;
    setIsLoading(true);
    setRawResult('');
    setErrorMsg(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const activeToken = session?.access_token ?? null;

      const response = await fetch('/api/meeting-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({ notes: notes.trim() })
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
      setErrorMsg(err.message || 'Wystąpił błąd podczas generowania podsumowania.');
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
    <div className="meeting-page-container">
      <style jsx>{`
        .meeting-page-container {
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

        .notes-textarea {
          background: rgba(10, 10, 15, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: #e2e8f0;
          padding: 1rem;
          font-size: 0.95rem;
          outline: none;
          resize: vertical;
          min-height: 180px;
          transition: border-color 0.2s;
          font-family: inherit;
          line-height: 1.5;
        }

        .notes-textarea:focus {
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
        <h1 className="header-title">📋 Podsumowanie spotkań</h1>
        <p className="header-subtitle">Przekształć chaotyczne notatki w ustrukturyzowane action items</p>
      </div>

      <div className="input-card">
        <div className="input-group">
          <label className="input-label">Wklej notatki ze spotkania</label>
          <textarea
            className="notes-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Wklej surowe lub chaotyczne notatki ze spotkania, np. kto był obecny, co ustalono i kto jakie ma zadania..."
            disabled={isLoading}
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={isLoading || !notes.trim()}
        >
          {isLoading ? '⏳ Podsumowywanie...' : '📋 Podsumuj spotkanie'}
        </button>

        <div className="examples-wrap">
          <span className="examples-title">Wybierz przykładowe notatki:</span>
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
        <div className="report-card">
          <div className="card-toolbar">
            <button
              className={`btn-toolbar ${isCopied ? 'success' : ''}`}
              onClick={handleCopy}
            >
              {isCopied ? '✓ Skopiowano' : '📋 Kopiuj podsumowanie'}
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
