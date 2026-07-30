'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Briefing {
  id: string;
  created_at: string;
  date: string;
  content: string;
  user_id: string | null;
}

export default function BriefingsPage() {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [selectedBriefing, setSelectedBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pobranie listy briefingów z bazy danych
  const fetchBriefings = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('briefings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (fetchError) {
        throw fetchError;
      }

      setBriefings(data || []);
    } catch (err: any) {
      console.error('Error fetching briefings:', err);
      setError('Nie udało się wczytać briefingów: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBriefings();
  }, []);

  // Ręczne wygenerowanie nowego briefingu
  const handleGenerateNow = async () => {
    try {
      setGenerating(true);
      setError(null);

      // Pobieramy token sesji użytkownika
      const { data: { session } } = await supabase.auth.getSession();
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/cron/morning', {
        method: 'GET',
        headers: headers,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Nieznany błąd podczas generowania');
      }

      // Odświeżamy listę i wybieramy nowo wygenerowany briefing
      await fetchBriefings();
      
      // Spróbuj znaleźć nowy briefing na liście (będzie na samej górze)
      if (result.preview) {
        // Tworzymy tymczasowy obiekt do natychmiastowego podglądu
        const newBriefing: Briefing = {
          id: 'temp',
          created_at: new Date().toISOString(),
          date: result.date,
          content: result.preview,
          user_id: session?.user?.id || null,
        };
        setSelectedBriefing(newBriefing);
      }
    } catch (err: any) {
      console.error('Error generating briefing:', err);
      setError('Generowanie nie powiodło się: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  // Kopiowanie treści briefingu do schowka
  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Formatowanie daty na czytelny format po polsku
  const formatDate = (dateStr: string, createdAtStr: string) => {
    try {
      const date = new Date(createdAtStr);
      // Upewniamy się, że data jest prawidłowa
      if (isNaN(date.getTime())) {
        return dateStr;
      }
      return date.toLocaleDateString('pl-PL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        weekday: 'long',
      });
    } catch (e) {
      return dateStr;
    }
  };

  // Pobranie pierwszych 150 znaków z tekstu w celach podglądu (bez znaków markdown)
  const getPreviewText = (text: string) => {
    const cleanText = text
      .replace(/[#*`_-]/g, '') // Usuń znaki markdown
      .replace(/\s+/g, ' ')    // Ujednolić spakowane spacje
      .trim();
    return cleanText.length > 150 ? cleanText.substring(0, 150) + '...' : cleanText;
  };

  return (
    <div className="briefings-container">
      <style jsx>{`
        .briefings-container {
          width: 100%;
          max-width: 850px;
          height: 90vh;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--border);
          background: var(--glass-bg);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-radius: 20px;
          box-shadow: var(--card-shadow);
          overflow: hidden;
          animation: fadeIn 0.4s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 900px) {
          .briefings-container {
            height: 100vh;
            border-radius: 0;
            border: none;
          }
        }

        .header {
          padding: 1.5rem 2rem;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(13, 13, 20, 0.4);
        }

        .header-titles h1 {
          font-size: 1.6rem;
          font-weight: 700;
          margin: 0;
          background: linear-gradient(to right, #ffffff, #a5b4fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: -0.02em;
        }

        .header-titles p {
          font-size: 0.85rem;
          color: #94a3b8;
          margin-top: 0.25rem;
        }

        .btn {
          background: var(--user-bg);
          color: white;
          border: none;
          padding: 0.6rem 1.2rem;
          border-radius: 10px;
          font-size: 0.88rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
          opacity: 0.95;
        }

        .btn:disabled {
          background: #334155;
          color: #64748b;
          cursor: not-allowed;
          box-shadow: none;
        }

        .content-area {
          flex: 1;
          overflow-y: auto;
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .error-banner {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #fca5a5;
          padding: 1rem;
          border-radius: 12px;
          font-size: 0.9rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .error-banner button {
          background: transparent;
          border: none;
          color: #fca5a5;
          cursor: pointer;
          font-size: 1.1rem;
        }

        /* Widok Listy Kart */
        .cards-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }

        .card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 14px;
          padding: 1.25rem 1.5rem;
          cursor: pointer;
          transition: all 0.2s ease-in-out;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          position: relative;
        }

        .card:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(99, 102, 241, 0.3);
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .card-date {
          font-size: 1.05rem;
          font-weight: 600;
          color: #ffffff;
        }

        .tag {
          font-size: 0.72rem;
          font-weight: 600;
          padding: 0.25rem 0.6rem;
          border-radius: 9999px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .tag-auto {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .tag-manual {
          background: rgba(99, 102, 241, 0.15);
          color: #a5b4fc;
          border: 1px solid rgba(99, 102, 241, 0.3);
        }

        .card-preview {
          font-size: 0.88rem;
          color: #94a3b8;
          line-height: 1.5;
        }

        .card-footer {
          display: flex;
          justify-content: flex-end;
          font-size: 0.8rem;
          color: #64748b;
        }

        /* Widok Szczegółowy Briefingu */
        .detail-view {
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid rgba(255, 255, 255, 0.03);
          border-radius: 16px;
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }

        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border);
          padding-bottom: 1rem;
        }

        .detail-meta h2 {
          font-size: 1.4rem;
          font-weight: 700;
          color: #ffffff;
        }

        .detail-meta-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-top: 0.5rem;
        }

        .detail-actions {
          display: flex;
          gap: 0.75rem;
        }

        .btn-secondary {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #e2e8f0;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .markdown-body {
          font-size: 0.95rem;
          line-height: 1.6;
          color: #cbd5e1;
        }

        .markdown-body :global(h2) {
          font-size: 1.2rem;
          font-weight: 600;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          color: #ffffff;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 0.25rem;
        }

        .markdown-body :global(p) {
          margin-bottom: 1rem;
        }

        .markdown-body :global(ul) {
          margin-left: 1.5rem;
          margin-bottom: 1rem;
        }

        .markdown-body :global(li) {
          margin-bottom: 0.35rem;
        }

        /* Stany puste i ładowania */
        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex: 1;
          gap: 1rem;
          color: #94a3b8;
        }

        .spinner {
          width: 35px;
          height: 35px;
          border: 3px solid rgba(255,255,255,0.05);
          border-top: 3px solid #6366f1;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex: 1;
          gap: 1.5rem;
          padding: 3rem;
          text-align: center;
          color: #94a3b8;
        }

        .empty-icon {
          font-size: 3rem;
          margin-bottom: 0.5rem;
        }

        .empty-state p {
          max-width: 450px;
          line-height: 1.5;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* NAGŁÓWEK */}
      <div className="header">
        <div className="header-titles">
          <h1>{selectedBriefing ? '📄 Podgląd briefingu' : '📰 Briefingi'}</h1>
          <p>
            {selectedBriefing
              ? 'Szczegółowy raport wygenerowany przez Twojego agenta'
              : 'Automatyczne podsumowania dnia od Twojego agenta'}
          </p>
        </div>
        {!selectedBriefing && (
          <button
            className="btn"
            onClick={handleGenerateNow}
            disabled={generating || loading}
          >
            {generating ? (
              <>
                <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div>
                Generowanie...
              </>
            ) : (
              <>
                <span>🔄</span> Wygeneruj teraz
              </>
            )}
          </button>
        )}
      </div>

      {/* TREŚĆ GLÓWNA */}
      <div className="content-area">
        {error && (
          <div className="error-banner">
            <span>⚠️ {error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {loading && briefings.length === 0 ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <span>Wczytywanie briefingów...</span>
          </div>
        ) : selectedBriefing ? (
          /* WIDOK SZCZEGÓŁOWY */
          <div className="detail-view">
            <div className="detail-header">
              <div className="detail-meta">
                <h2>{formatDate(selectedBriefing.date, selectedBriefing.created_at)}</h2>
                <div className="detail-meta-row">
                  <span className={`tag ${selectedBriefing.user_id ? 'tag-manual' : 'tag-auto'}`}>
                    {selectedBriefing.user_id ? '🔄 Ręczny' : '✅ Cron Job'}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    Wygenerowano: {new Date(selectedBriefing.created_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
              <div className="detail-actions">
                <button
                  className="btn-secondary"
                  onClick={() => handleCopyToClipboard(selectedBriefing.content)}
                >
                  {copied ? '✅ Skopiowano!' : '📋 Kopiuj treść'}
                </button>
                <button
                  className="btn-secondary"
                  style={{ background: 'rgba(99, 102, 241, 0.1)', borderColor: 'rgba(99, 102, 241, 0.3)', color: '#a5b4fc' }}
                  onClick={() => setSelectedBriefing(null)}
                >
                  ← Wróć do listy
                </button>
              </div>
            </div>
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {selectedBriefing.content}
              </ReactMarkdown>
            </div>
          </div>
        ) : briefings.length === 0 ? (
          /* STAN PUSTY */
          <div className="empty-state">
            <div className="empty-icon">📰</div>
            <h3>Brak briefingów</h3>
            <p>
              Baza danych jest pusta. Twój automatyczny cron job wygeneruje pierwszy raport jutro rano o 7:00.
              Możesz też wygenerować go natychmiast, klikając poniższy przycisk.
            </p>
            <button
              className="btn"
              onClick={handleGenerateNow}
              disabled={generating}
              style={{ marginTop: '0.5rem' }}
            >
              {generating ? 'Generowanie raportu...' : '🔄 Wygeneruj pierwszy raport teraz'}
            </button>
          </div>
        ) : (
          /* LISTA KART */
          <div className="cards-grid">
            {briefings.map((b) => (
              <div
                key={b.id}
                className="card"
                onClick={() => setSelectedBriefing(b)}
              >
                <div className="card-header">
                  <span className="card-date">
                    {formatDate(b.date, b.created_at)}
                  </span>
                  <span className={`tag ${b.user_id ? 'tag-manual' : 'tag-auto'}`}>
                    {b.user_id ? 'Ręczny' : 'Automatyczny'}
                  </span>
                </div>
                <p className="card-preview">{getPreviewText(b.content)}</p>
                <div className="card-footer">
                  <span>Kliknij, aby przeczytać pełny raport →</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
