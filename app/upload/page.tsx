'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface DocumentInfo {
  title: string;
  count: number;
  created_at: string;
}

interface ChunkInfo {
  id: string;
  title: string;
  content: string;
  created_at: string;
  metdata?: any;
}

const PRESETS = [
  {
    name: '💰 Cennik',
    title: 'Cennik Usług 2026',
    content: `CENNIK USŁUG 2026

Pakiet Basic: 99 zł/miesiąc
- 5 użytkowników
- 10 GB miejsca
- Wsparcie email

Pakiet Premium: 299 zł/miesiąc
- 25 użytkowników
- 100 GB miejsca
- Wsparcie email + telefon
- Priorytetowa obsługa

Pakiet VIP: 599 zł/miesiąc
- Nielimitowani użytkownicy
- 1 TB miejsca
- Wsparcie 24/7
- Dedykowany opiekun
- Szkolenie wdrożeniowe

Wszystkie pakiety z 14-dniowym okresem próbnym.
Faktura VAT wystawiana automatycznie.
Rezygnacja możliwa w dowolnym momencie.`,
  },
  {
    name: '❓ FAQ',
    title: 'FAQ - Najczęściej zadawane pytania',
    content: `FAQ - NAJCZĘŚCIEJ ZADAWANE PYTANIA

Q: Jak mogę anulować subskrypcję?
A: Możesz anulować subskrypcję w dowolnym momencie w panelu użytkownika w zakładce Ustawienia -> Subskrypcja, lub pisząc do nas maila na bok@firma.pl.

Q: Jakie metody płatności obsługujecie?
A: Akceptujemy karty płatnicze (Visa, Mastercard), Blik, przelewy natychmiastowe PayU oraz tradycyjne przelewy bankowe.

Q: Czy wystawiacie faktury VAT?
A: Tak, faktura VAT jest generowana automatycznie po każdej płatności i wysyłana na podany adres e-mail. Można ją również pobrać z historii zamówień.

Q: Ile trwa okres próbny?
A: Każdy nowy użytkownik otrzymuje 14-dniowy bezpłatny okres próbny dla pakietu Basic lub Premium. Po tym czasie następuje przejście na pakiet płatny.`,
  },
  {
    name: '⚖️ Regulamin',
    title: 'Regulamin świadczenia usług',
    content: `REGULAMIN ŚWIADCZENIA USŁUG

§1. Postanowienia ogólne
1.1 Niniejszy regulamin określa zasady korzystania z platformy SaaS firmy.
1.2 Usługodawcą jest firma XYZ Sp. z o.o. z siedzibą w Warszawie przy ul. Nowej 12.

§2. Rejestracja i konto użytkownika
2.1 Do korzystania z usług wymagana jest rejestracja konta i podanie prawdziwych danych.
2.2 Użytkownik jest zobowiązany do zabezpieczenia hasła przed dostępem osób trzecich.

§3. Reklamacje i zwroty
3.1 Reklamacje można zgłaszać drogą elektroniczną na adres support@firma.pl.
3.2 Rozpatrzenie reklamacji następuje w terminie 14 dni od momentu zgłoszenia.`,
  },
];

export default function UploadKnowledgePage() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  // Ingestion status states
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Search Test States
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchError, setSearchError] = useState('');

  // Preview Modal States
  const [previewDocTitle, setPreviewDocTitle] = useState<string | null>(null);
  const [docChunks, setDocChunks] = useState<ChunkInfo[]>([]);
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);

  // Fetch all documents on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setToken(session.access_token);
        fetchDocuments(session.access_token);

        const params = new URLSearchParams(window.location.search);
        const docParam = params.get('doc');
        if (docParam) {
          handlePreviewDoc(docParam, session.access_token);
        }
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setToken(session.access_token);
      } else {
        setToken(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchDocuments = async (activeToken = token) => {
    if (!activeToken) return;
    setIsLoadingList(true);
    try {
      const res = await fetch('/api/upload-knowledge', {
        headers: {
          'Authorization': `Bearer ${activeToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error('Error fetching documents:', err);
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleApplyPreset = (preset: typeof PRESETS[0]) => {
    setTitle(preset.title);
    setContent(preset.content);
    setSuccessMessage('');
    setErrorMessage('');
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || isProcessing || !token) return;

    setIsProcessing(true);
    setProgressCurrent(0);
    setProgressTotal(0);
    setSuccessMessage('');
    setErrorMessage('');

    try {
      const response = await fetch('/api/upload-knowledge', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, content }),
      });

      if (!response.body) {
        throw new Error('ReadableStream not supported by browser.');
      }

      const reader = response.body.getReader();
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
              setProgressCurrent(data.current);
              setProgressTotal(data.total);
            } else if (data.status === 'done') {
              setSuccessMessage(`✅ Zapisano pomyślnie ${data.chunks_saved} fragmentów w bazie wiedzy!`);
              setTitle('');
              setContent('');
              fetchDocuments(token);
            } else if (data.status === 'error') {
              setErrorMessage(`❌ Błąd: ${data.message}`);
            }
          } catch (e) {
            console.error('Failed to parse line:', line, e);
          }
        }
      }
    } catch (err: any) {
      setErrorMessage(`❌ Błąd połączenia: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (docTitle: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering document preview click
    const confirmed = window.confirm(`Czy na pewno chcesz usunąć dokument "${docTitle}" ze wszystkimi jego fragmentami?`);
    if (!confirmed || !token) return;

    try {
      const res = await fetch(`/api/upload-knowledge?title=${encodeURIComponent(docTitle)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        fetchDocuments(token);
        if (previewDocTitle === docTitle) {
          setPreviewDocTitle(null);
        }
      } else {
        const data = await res.json();
        alert(`Błąd: ${data.error || 'Nie udało się usunąć dokumentu'}`);
      }
    } catch (err) {
      alert(`Błąd połączenia podczas usuwania.`);
    }
  };

  const handlePreviewDoc = async (docTitle: string, activeToken = token) => {
    if (!activeToken) return;
    setPreviewDocTitle(docTitle);
    setIsLoadingChunks(true);
    setDocChunks([]);
    try {
      const res = await fetch(`/api/upload-knowledge?title=${encodeURIComponent(docTitle)}`, {
        headers: {
          'Authorization': `Bearer ${activeToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setDocChunks(data.chunks || []);
      } else {
        console.error('Failed to fetch chunks');
      }
    } catch (err) {
      console.error('Error fetching doc chunks:', err);
    } finally {
      setIsLoadingChunks(false);
    }
  };

  const handleSearchTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || isSearching || !token) return;

    setIsSearching(true);
    setSearchResults([]);
    setSearchError('');

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ query: searchQuery }),
      });

      const data = await res.json();
      if (res.ok) {
        setSearchResults(data.results || []);
        if (!data.results || data.results.length === 0) {
          setSearchError('Nie mam takich informacji w mojej bazie wiedzy. Skontaktuj się z konsultantem.');
        }
      } else {
        setSearchError(data.error || 'Wystąpił błąd podczas wyszukiwania.');
      }
    } catch (err: any) {
      setSearchError(`Błąd połączenia: ${err.message || err}`);
    } finally {
      setIsSearching(false);
    }
  };

  const totalChunks = documents.reduce((acc, doc) => acc + doc.count, 0);

  return (
    <div className="upload-container">
      <style jsx>{`
        .upload-container {
          width: 100%;
          max-width: 1100px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 2rem;
          padding: 1rem 0;
        }

        .header-section {
          text-align: center;
          margin-bottom: 0.5rem;
        }

        .header-section h1 {
          font-size: 2.2rem;
          font-weight: 800;
          margin-bottom: 0.5rem;
          background: linear-gradient(90deg, #818cf8, #c084fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .header-section p {
          color: #94a3b8;
          font-size: 1rem;
        }

        .content-grid {
          display: grid;
          grid-template-columns: 1.3fr 1fr;
          gap: 2rem;
        }

        @media (max-width: 850px) {
          .content-grid {
            grid-template-columns: 1fr;
          }
        }

        .card {
          background: rgba(13, 13, 22, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(24px);
          border-radius: 16px;
          padding: 1.75rem;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
        }

        .card-title {
          font-size: 1.2rem;
          font-weight: 700;
          color: #fff;
          margin-bottom: 1.25rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 0.75rem;
        }

        .presets-row {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          align-items: center;
        }

        .preset-btn {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.07);
          color: #cbd5e1;
          padding: 0.4rem 0.8rem;
          border-radius: 8px;
          font-size: 0.82rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .preset-btn:hover {
          background: rgba(99, 102, 241, 0.15);
          border-color: rgba(99, 102, 241, 0.4);
          color: #fff;
          transform: translateY(-1px);
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 1.25rem;
        }

        .form-group label {
          font-size: 0.85rem;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .form-input {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 0.75rem 1rem;
          color: #f4f4f7;
          font-size: 0.92rem;
          outline: none;
          transition: all 0.2s ease;
        }

        .form-input:focus {
          border-color: rgba(99, 102, 241, 0.5);
          background: rgba(255, 255, 255, 0.04);
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.15);
        }

        .form-textarea {
          min-height: 250px;
          font-family: inherit;
          resize: vertical;
          line-height: 1.5;
        }

        .submit-btn {
          width: 100%;
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          border: none;
          color: white;
          padding: 0.85rem;
          border-radius: 8px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        }

        .submit-btn:hover:not(:disabled) {
          opacity: 0.95;
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(79, 70, 229, 0.4);
        }

        .submit-btn:disabled {
          background: #334155;
          color: #64748b;
          cursor: not-allowed;
          box-shadow: none;
        }

        .progress-box {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 1rem;
          margin-top: 1rem;
        }

        .progress-text {
          font-size: 0.85rem;
          color: #cbd5e1;
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.5rem;
          font-weight: 500;
        }

        .progress-bar {
          height: 6px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 3px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #6366f1, #10b981);
          transition: width 0.3s ease;
        }

        .alert {
          border-radius: 8px;
          padding: 0.85rem 1rem;
          font-size: 0.88rem;
          margin-top: 1rem;
          line-height: 1.4;
        }

        .alert-success {
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.2);
          color: #34d399;
        }

        .alert-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #f87171;
        }

        .stats-summary {
          background: rgba(99, 102, 241, 0.05);
          border: 1px solid rgba(99, 102, 241, 0.15);
          color: #a5b4fc;
          padding: 0.75rem 1rem;
          border-radius: 10px;
          font-size: 0.88rem;
          font-weight: 500;
          margin-bottom: 1.25rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .docs-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .doc-item {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 8px;
          padding: 0.85rem 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .doc-item:hover {
          background: rgba(99, 102, 241, 0.06);
          border-color: rgba(99, 102, 241, 0.2);
          transform: translateX(2px);
        }

        .doc-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          flex: 1;
        }

        .doc-title {
          font-size: 0.9rem;
          font-weight: 600;
          color: #f8fafc;
        }

        .doc-meta {
          font-size: 0.75rem;
          color: #64748b;
          display: flex;
          gap: 0.75rem;
        }

        .doc-meta-item {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .delete-btn {
          background: transparent;
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #f87171;
          width: 32px;
          height: 32px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.85rem;
          transition: all 0.2s ease;
        }

        .delete-btn:hover {
          background: rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.4);
          transform: scale(1.05);
        }

        .empty-state {
          text-align: center;
          color: #64748b;
          font-size: 0.88rem;
          padding: 2rem 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }

        .empty-icon {
          font-size: 1.8rem;
          opacity: 0.7;
        }

        /* Modal Overlay and Content Styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(3, 3, 5, 0.8);
          backdrop-filter: blur(12px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modal-content {
          background: #0f1016;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          width: 90%;
          max-width: 750px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          animation: modalAppear 0.3s ease;
        }

        @keyframes modalAppear {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .modal-header {
          padding: 1.25rem 1.75rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .modal-header h3 {
          margin: 0;
          font-size: 1.15rem;
          font-weight: 700;
          color: #fff;
        }

        .modal-close-btn {
          background: none;
          border: none;
          color: #94a3b8;
          font-size: 1.5rem;
          cursor: pointer;
          transition: color 0.2s ease;
        }

        .modal-close-btn:hover {
          color: #fff;
        }

        .modal-body {
          padding: 1.75rem;
          overflow-y: auto;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .chunk-box {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 10px;
          padding: 1rem;
        }

        .chunk-header {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          color: #64748b;
          margin-bottom: 0.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          padding-bottom: 0.25rem;
        }

        .chunk-text {
          font-size: 0.88rem;
          color: #cbd5e1;
          line-height: 1.55;
          white-space: pre-wrap;
        }

        /* Search Results Styles */
        .search-results-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-top: 1.25rem;
        }

        .search-result-item {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 12px;
          padding: 1.25rem;
          transition: all 0.2s ease;
        }

        .search-result-item:hover {
          border-color: rgba(99, 102, 241, 0.25);
          background: rgba(99, 102, 241, 0.02);
        }

        .search-result-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.78rem;
          margin-bottom: 0.75rem;
          color: #94a3b8;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 0.5rem;
        }

        .search-result-title {
          font-weight: 700;
          color: #a5b4fc;
        }

        .similarity-badge {
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.3);
          color: #34d399;
          font-weight: 700;
          font-size: 0.75rem;
          padding: 0.2rem 0.5rem;
          border-radius: 6px;
        }
      `}</style>

      <div className="header-section">
        <h1>📚 Baza wiedzy</h1>
        <p>Wklej tekst dokumentów — twój agent AI automatycznie uzyska do nich dostęp, by precyzyjnie odpowiadać.</p>
      </div>

      <div className="content-grid">
        {/* Left Side: Upload Knowledge */}
        <div className="card">
          <div className="card-title">
            <span>📤</span> Wgraj nową wiedzę
          </div>

          <div className="presets-row">
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Szablony:</span>
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="preset-btn"
                onClick={() => handleApplyPreset(preset)}
                disabled={isProcessing}
              >
                {preset.name}
              </button>
            ))}
          </div>

          <form onSubmit={handleUpload}>
            <div className="form-group">
              <label htmlFor="doc-title">Tytuł dokumentu</label>
              <input
                id="doc-title"
                type="text"
                className="form-input"
                placeholder="Np. Cennik 2026, FAQ, Regulamin firmy"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isProcessing}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="doc-content">Treść dokumentu</label>
              <textarea
                id="doc-content"
                className="form-input form-textarea"
                placeholder="Wklej tutaj pełną treść dokumentu..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={isProcessing}
                required
              />
            </div>

            <button type="submit" className="submit-btn" disabled={isProcessing || !title.trim() || !content.trim()}>
              {isProcessing ? '⚙️ Ingestia danych...' : '📤 Zapisz w bazie wiedzy'}
            </button>
          </form>

          {isProcessing && progressTotal > 0 && (
            <div className="progress-box">
              <div className="progress-text">
                <span>Przetwarzam fragmenty wiedzy...</span>
                <span>{progressCurrent} z {progressTotal}</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${(progressCurrent / progressTotal) * 100}%` }}
                />
              </div>
            </div>
          )}

          {successMessage && <div className="alert alert-success">{successMessage}</div>}
          {errorMessage && <div className="alert alert-error">{errorMessage}</div>}
        </div>

        {/* Right Side: Documents List */}
        <div className="card">
          <div className="card-title">
            <span>🗂️</span> Zapisane dokumenty
          </div>

          {documents.length > 0 && (
            <div className="stats-summary">
              <span>📊 Status:</span>
              <span>{totalChunks} {totalChunks === 1 ? 'fragment' : totalChunks < 5 ? 'fragmenty' : 'fragmentów'} z {documents.length} {documents.length === 1 ? 'dokumentu' : 'dokumentów'}</span>
            </div>
          )}

          {isLoadingList ? (
            <div className="empty-state">
              <div className="spinner" style={{ width: '20px', height: '20px', border: '2px solid rgba(99, 102, 241, 0.3)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span>Ładowanie bazy wiedzy...</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📭</span>
              <span>Brak wgranych dokumentów.</span>
              <span style={{ fontSize: '0.78rem' }}>Użyj szablonów po lewej stronie, aby szybko dodać dane testowe.</span>
            </div>
          ) : (
            <div className="docs-list">
              {documents.map((doc) => (
                <div key={doc.title} className="doc-item" onClick={() => handlePreviewDoc(doc.title)}>
                  <div className="doc-info">
                    <span className="doc-title">{doc.title}</span>
                    <div className="doc-meta">
                      <span className="doc-meta-item">📦 {doc.count} {doc.count === 1 ? 'fragment' : doc.count < 5 ? 'fragmenty' : 'fragmentów'}</span>
                      <span className="doc-meta-item">📅 {new Date(doc.created_at).toLocaleDateString('pl-PL')}</span>
                    </div>
                  </div>
                  <button
                    className="delete-btn"
                    title="Usuń dokument"
                    onClick={(e) => handleDelete(doc.title, e)}
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Direct Search Test Section */}
      <div className="card">
        <div className="card-title">
          <span>🔍</span> Testuj wyszukiwanie w bazie wiedzy (bez agenta)
        </div>
        <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '-0.5rem', marginBottom: '1.25rem' }}>
          Pozwala sprawdzić RAG przed rozmową z agentem. Wpisz pytanie, aby zobaczyć najbardziej dopasowane fragmenty i ich wskaźnik podobieństwa (similarity score).
        </p>

        <form onSubmit={handleSearchTest} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <input
            type="text"
            className="form-input"
            style={{ flex: 1 }}
            placeholder="Szukaj w bazie wiedzy (np. Ile kosztuje pakiet VIP?)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isSearching}
            required
          />
          <button type="submit" className="submit-btn" style={{ width: 'auto', padding: '0.75rem 1.5rem' }} disabled={isSearching || !searchQuery.trim()}>
            {isSearching ? '🔍 Szukam...' : 'Szukaj'}
          </button>
        </form>

        {searchError && <div className="alert alert-error" style={{ marginTop: '0.5rem' }}>{searchError}</div>}

        {searchResults.length > 0 && (
          <div className="search-results-list">
            {searchResults.map((res, idx) => (
              <div key={idx} className="search-result-item">
                <div className="search-result-meta">
                  <span className="search-result-title">📄 {res.title}</span>
                  <span className="similarity-badge">Similarity: {(res.similarity * 100).toFixed(1)}%</span>
                </div>
                <div className="chunk-text">{res.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Document Chunks Preview Modal */}
      {previewDocTitle && (
        <div className="modal-overlay" onClick={() => setPreviewDocTitle(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📄 Podgląd dokumentu: {previewDocTitle}</h3>
              <button className="modal-close-btn" onClick={() => setPreviewDocTitle(null)}>&times;</button>
            </div>
            <div className="modal-body">
              {isLoadingChunks ? (
                <div className="empty-state">
                  <div className="spinner" style={{ width: '20px', height: '20px', border: '2px solid rgba(99, 102, 241, 0.3)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <span>Wczytywanie fragmentów...</span>
                </div>
              ) : docChunks.length === 0 ? (
                <div className="empty-state">
                  <span>Brak fragmentów dla tego dokumentu.</span>
                </div>
              ) : (
                docChunks.map((chunk, idx) => (
                  <div key={chunk.id || idx} className="chunk-box">
                    <div className="chunk-header">
                      <span>Fragment #{idx + 1}</span>
                      <span>Utworzono: {new Date(chunk.created_at).toLocaleDateString('pl-PL')}</span>
                    </div>
                    <div className="chunk-text">{chunk.content}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
