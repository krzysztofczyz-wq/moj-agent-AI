'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const EXAMPLE_EMAILS = `Mail 1 - PILNY:
Od: jan.kowalski@firma.pl
Temat: PILNE - Problem z fakturą
Treść: Dzień dobry, mam problem z fakturą FV/2026/001. Kwota jest nieprawidłowa — powinno być 5000 zł a jest 3000 zł. Proszę o PILNĄ korektę. Termin płatności mija jutro.

Mail 2 - SPAM:
Od: winner@lucky-prize.com
Temat: Congratulations! You won $1,000,000
Treść: Click here to claim your prize! Limited time offer. Act now!

Mail 3 - OFERTA:
Od: anna.nowak@partner.pl
Temat: Propozycja współpracy
Treść: Dzień dobry, reprezentuję firmę ABC Solutions. Chcielibyśmy omówić możliwość współpracy w zakresie dostarczania usług IT. Czy możemy umówić się na spotkanie w przyszłym tygodniu?

Mail 4 - REKLAMACJA:
Od: klient123@gmail.com
Temat: Nie działa usługa od 3 dni
Treść: Witam, od poniedziałku nie mogę się zalogować do panelu klienta. Próbowałem resetować hasło ale nie dostaje maila. To już trzeci dzień! Jeśli nie rozwiążecie tego dziś, zrezygnuję z usługi.

Mail 5 - INFO:
Od: newsletter@branżowy-portal.pl
Temat: Nowe trendy AI w biznesie - raport 2026
Treść: Zapraszamy do lektury naszego najnowszego raportu o zastosowaniach AI w polskich firmach. Pobierz za darmo na naszej stronie.`;

interface MailResult {
  number: string;
  subject: string;
  category: string;
  priority: string;
  justification: string;
  draft: string;
  statusColor: 'red' | 'yellow' | 'green' | 'default';
  rawText: string;
}

interface SummaryResult {
  urgentCount: number;
  mediumCount: number;
  lowCount: number;
  recommendation: string;
  rawText: string;
}

export default function EmailTriagePage() {
  const [inputText, setInputText] = useState('');
  const [rawResult, setRawResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Load session token on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setToken(session?.access_token ?? null);
    });
  }, []);

  const handlePasteExample = () => {
    setInputText(EXAMPLE_EMAILS);
    setErrorMsg(null);
  };

  const splitEmails = (text: string): string[] => {
    if (/(?:Mail\s+\d+|Od:)/i.test(text)) {
      const rawParts = text.split(/(?=Mail\s+\d+|Od:)/gi);
      return rawParts
        .map(p => p.trim())
        .filter(p => p.length > 5);
    }
    return text
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 5);
  };

  const handleAnalyze = async () => {
    if (!inputText.trim() || isLoading) return;
    setIsLoading(true);
    setRawResult('');
    setErrorMsg(null);

    const emails = splitEmails(inputText);
    if (emails.length === 0) {
      setErrorMsg('Nie wykryto żadnych wiadomości e-mail w polu tekstowym.');
      setIsLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const activeToken = session?.access_token ?? null;

      const response = await fetch('/api/email-triage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({ emails })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Nie udało się przeanalizować wiadomości.');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Nie udało się utworzyć strumienia danych.');
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
      setErrorMsg(err.message || 'Wystąpił nieoczekiwany błąd podczas analizy poczty.');
    } finally {
      setIsLoading(false);
    }
  };

  const parseResults = (text: string) => {
    const segments = text.split(/\n---\n|\n---\s*\n/);
    const mails: MailResult[] = [];
    let summary: SummaryResult | null = null;

    for (const segment of segments) {
      const trimmed = segment.trim();
      if (!trimmed) continue;

      if (trimmed.toLowerCase().includes('podsumowanie') || trimmed.toLowerCase().includes('rekomendacja:')) {
        const urgentMatch = trimmed.match(/🔴\s*(?:Pilne|Wysoki|Wysokie)?\s*:\s*(\d+)/i) || trimmed.match(/(?:Pilne|Wysoki):\s*(\d+)/i);
        const mediumMatch = trimmed.match(/🟡\s*(?:Średnie|Średni)?\s*:\s*(\d+)/i) || trimmed.match(/(?:Średnie|Średni):\s*(\d+)/i);
        const lowMatch = trimmed.match(/🟢\s*(?:Niskie|Niski)?\s*:\s*(\d+)/i) || trimmed.match(/(?:Niskie|Niski):\s*(\d+)/i);
        const recMatch = trimmed.match(/(?:Rekomendacja|rekomendacja)\s*:\s*(.*)/i);

        summary = {
          urgentCount: urgentMatch ? parseInt(urgentMatch[1]) : 0,
          mediumCount: mediumMatch ? parseInt(mediumMatch[1]) : 0,
          lowCount: lowMatch ? parseInt(lowMatch[1]) : 0,
          recommendation: recMatch ? recMatch[1].trim() : '',
          rawText: trimmed
        };
      } else {
        const titleMatch = trimmed.match(/^###\s*Mail\s*(\d+)\s*:\s*(.*)/i) || trimmed.match(/^###\s*(.*)/);
        const mailNum = titleMatch ? (titleMatch[1] || '') : '';
        const subject = titleMatch ? (titleMatch[2] || titleMatch[1] || '') : '';

        const catMatch = trimmed.match(/\|\s*Kategoria\s*\|\s*([^|]+)\|/i);
        const priMatch = trimmed.match(/\|\s*Priorytet\s*\|\s*([^|]+)\|/i);
        const uzasMatch = trimmed.match(/\|\s*Uzasadnienie\s*\|\s*([^|]+)\|/i);

        const category = catMatch ? catMatch[1].trim() : '';
        const priorityRaw = priMatch ? priMatch[1].trim() : '';
        const justification = uzasMatch ? uzasMatch[1].trim() : '';

        let draft = '';
        const draftIndex = trimmed.indexOf('**Proponowana odpowiedź:**');
        if (draftIndex !== -1) {
          draft = trimmed.substring(draftIndex + '**Proponowana odpowiedź:**'.length).trim();
        } else {
          const lines = trimmed.split('\n');
          const quoteLines = lines.filter(l => l.trim().startsWith('>'));
          if (quoteLines.length > 0) {
            draft = quoteLines.map(l => l.trim().replace(/^>\s*/, '').trim()).join('\n');
          }
        }
        draft = draft.replace(/^>\s*/gm, '').trim();

        let statusColor: 'red' | 'yellow' | 'green' | 'default' = 'default';
        if (priorityRaw.includes('🔴') || priorityRaw.toLowerCase().includes('wysoki') || priorityRaw.toLowerCase().includes('pilne')) {
          statusColor = 'red';
        } else if (priorityRaw.includes('🟡') || priorityRaw.toLowerCase().includes('średni')) {
          statusColor = 'yellow';
        } else if (priorityRaw.includes('🟢') || priorityRaw.toLowerCase().includes('niski') || priorityRaw.toLowerCase().includes('spam')) {
          statusColor = 'green';
        }

        mails.push({
          number: mailNum,
          subject: subject,
          category: category,
          priority: priorityRaw,
          justification: justification,
          draft: draft,
          statusColor,
          rawText: trimmed
        });
      }
    }

    return { mails, summary };
  };

  const handleCopyDraft = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const { mails, summary } = parseResults(rawResult);

  return (
    <div className="triage-page-container">
      <style jsx>{`
        .triage-page-container {
          max-width: 1100px;
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
          background: linear-gradient(135deg, #818cf8 0%, #c084fc 100%);
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
          gap: 1rem;
        }

        .input-textarea {
          width: 100%;
          min-height: 220px;
          background: rgba(10, 10, 15, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: #e2e8f0;
          padding: 1rem;
          font-family: inherit;
          font-size: 0.95rem;
          line-height: 1.5;
          resize: vertical;
          outline: none;
          transition: border-color 0.2s;
        }

        .input-textarea:focus {
          border-color: #6366f1;
        }

        .actions-row {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 1rem;
        }

        .btn {
          padding: 0.75rem 1.5rem;
          border-radius: 10px;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .btn-secondary {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
        }

        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #e2e8f0;
        }

        .btn-primary {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          border: none;
          color: white;
          box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4);
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .loader-bar {
          height: 3px;
          width: 100%;
          background: rgba(255,255,255,0.05);
          border-radius: 2px;
          overflow: hidden;
          position: relative;
        }

        .loader-fill {
          height: 100%;
          width: 50%;
          background: linear-gradient(90deg, #6366f1, #a855f7);
          animation: pulse-slide 1.5s infinite ease-in-out;
        }

        @keyframes pulse-slide {
          0% { left: -50%; }
          100% { left: 100%; }
        }

        .error-banner {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #fca5a5;
          padding: 1rem;
          border-radius: 12px;
          font-size: 0.9rem;
        }

        .summary-dashboard {
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 16px;
          padding: 1.5rem;
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: 2rem;
          align-items: center;
          animation: fadeIn 0.4s ease-out;
        }

        @media(max-width: 768px) {
          .summary-dashboard {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
        }

        .summary-counts {
          display: flex;
          gap: 1rem;
          align-items: center;
        }

        .count-pill {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(15, 15, 25, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 0.75rem 1.25rem;
          border-radius: 12px;
          min-width: 80px;
        }

        .count-num {
          font-size: 1.5rem;
          font-weight: 800;
        }

        .count-num.red { color: #f87171; }
        .count-num.yellow { color: #fbbf24; }
        .count-num.green { color: #34d399; }

        .count-label {
          font-size: 0.75rem;
          color: #64748b;
          font-weight: 600;
          text-transform: uppercase;
          margin-top: 0.25rem;
        }

        .recommendation-card {
          border-left: 3px solid #818cf8;
          padding-left: 1rem;
        }

        .recommendation-title {
          font-size: 0.8rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #818cf8;
          margin-bottom: 0.25rem;
        }

        .recommendation-text {
          font-size: 0.95rem;
          color: #e2e8f0;
          line-height: 1.4;
        }

        .results-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.5rem;
        }

        .mail-card {
          background: rgba(30, 30, 45, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          overflow: hidden;
          transition: all 0.3s;
          display: flex;
          flex-direction: column;
        }

        .mail-card.border-red {
          border-left: 4px solid #ef4444;
          box-shadow: 0 4px 15px rgba(239, 68, 68, 0.05);
        }

        .mail-card.border-yellow {
          border-left: 4px solid #f59e0b;
          box-shadow: 0 4px 15px rgba(245, 158, 11, 0.05);
        }

        .mail-card.border-green {
          border-left: 4px solid #10b981;
          box-shadow: 0 4px 15px rgba(16, 185, 129, 0.05);
        }

        .card-header {
          padding: 1.25rem 1.5rem;
          background: rgba(0, 0, 0, 0.15);
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .card-title {
          font-size: 1.1rem;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0;
        }

        .priority-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 700;
          text-transform: uppercase;
        }

        .priority-badge.red {
          background: rgba(239, 68, 68, 0.15);
          color: #fca5a5;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .priority-badge.yellow {
          background: rgba(245, 158, 11, 0.15);
          color: #fde047;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .priority-badge.green {
          background: rgba(16, 185, 129, 0.15);
          color: #86efac;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .card-body {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .metadata-grid {
          display: grid;
          grid-template-columns: max-content 1fr;
          gap: 0.5rem 1.5rem;
          font-size: 0.88rem;
        }

        .meta-label {
          color: #64748b;
          font-weight: 600;
        }

        .meta-value {
          color: #cbd5e1;
        }

        .draft-section {
          background: rgba(10, 10, 15, 0.4);
          border: 1px dashed rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 1.25rem;
          position: relative;
        }

        .draft-title {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #818cf8;
          margin-bottom: 0.75rem;
        }

        .draft-blockquote {
          margin: 0;
          font-size: 0.92rem;
          line-height: 1.6;
          color: #e2e8f0;
          white-space: pre-wrap;
          font-style: italic;
          border-left: 3px solid rgba(99, 102, 241, 0.4);
          padding-left: 1rem;
        }

        .copy-btn {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          padding: 0.35rem 0.75rem;
          border-radius: 6px;
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }

        .copy-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #e2e8f0;
          border-color: rgba(255, 255, 255, 0.15);
        }

        .copy-btn.copied {
          background: rgba(16, 185, 129, 0.1);
          border-color: rgba(16, 185, 129, 0.3);
          color: #86efac;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="header-section">
        <h1 className="header-title">📧 E-mail Triage</h1>
        <p className="header-subtitle">Wklej maile — agent posortuje i napisze odpowiedzi</p>
      </div>

      <div className="input-card">
        <textarea
          className="input-textarea"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Wklej maile tutaj — oddziel je pustą linią..."
          disabled={isLoading}
        />
        <div className="actions-row">
          <button className="btn btn-secondary" onClick={handlePasteExample} disabled={isLoading}>
            📋 Wklej przykład
          </button>
          <button className="btn btn-primary" onClick={handleAnalyze} disabled={isLoading || !inputText.trim()}>
            {isLoading ? '⏳ Analizowanie...' : '📧 Analizuj maile'}
          </button>
        </div>
        {isLoading && (
          <div className="loader-bar">
            <div className="loader-fill"></div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="error-banner">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Summary dashboard rendered on top */}
      {summary && (
        <div className="summary-dashboard">
          <div className="summary-counts">
            <div className="count-pill">
              <span className="count-num red">{summary.urgentCount}</span>
              <span className="count-label">Pilne</span>
            </div>
            <div className="count-pill">
              <span className="count-num yellow">{summary.mediumCount}</span>
              <span className="count-label">Średnie</span>
            </div>
            <div className="count-pill">
              <span className="count-num green">{summary.lowCount}</span>
              <span className="count-label">Niskie</span>
            </div>
          </div>
          <div className="recommendation-card">
            <div className="recommendation-title">Rekomendacja</div>
            <div className="recommendation-text">{summary.recommendation || 'Brak rekomendacji.'}</div>
          </div>
        </div>
      )}

      {/* Results grid */}
      {mails.length > 0 && (
        <div className="results-grid">
          {mails.map((mail, index) => (
            <div
              key={index}
              className={`mail-card border-${mail.statusColor} ${isLoading && index === mails.length - 1 ? 'streaming-card' : ''}`}
              style={{ animation: 'fadeIn 0.4s ease-out' }}
            >
              <div className="card-header">
                <h3 className="card-title">
                  Mail {mail.number || index + 1}: {mail.subject || 'Analizowanie...'}
                </h3>
                {mail.priority && (
                  <span className={`priority-badge ${mail.statusColor}`}>
                    {mail.priority}
                  </span>
                )}
              </div>
              <div className="card-body">
                <div className="metadata-grid">
                  <span className="meta-label">Kategoria:</span>
                  <span className="meta-value">{mail.category || 'Wykrywanie...'}</span>
                  
                  <span className="meta-label">Uzasadnienie:</span>
                  <span className="meta-value">{mail.justification || 'Generowanie...'}</span>
                </div>

                {mail.draft && (
                  <div className="draft-section">
                    <div className="draft-title">✍️ Proponowana odpowiedź</div>
                    <button
                      className={`copy-btn ${copiedIndex === index ? 'copied' : ''}`}
                      onClick={() => handleCopyDraft(mail.draft, index)}
                    >
                      {copiedIndex === index ? '✓ Skopiowano' : '📋 Kopiuj draft'}
                    </button>
                    <blockquote className="draft-blockquote">
                      {mail.draft}
                    </blockquote>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
