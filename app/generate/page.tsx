'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';

export default function GeneratePage() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ image: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();

  const examples = [
    "Minimalistyczne logo kawiarni w stylu japońskim",
    "Post na Instagram: kawa latte art, ciepłe światło, widok z góry",
    "Kreacja reklamowa: wyprzedaż letnia -50%, nowoczesny design",
    "Ikona aplikacji: robot AI, gradient fioletowo-niebieski, flat design",
    "Infografika: 5 kroków do produktywności, pastelowe kolory",
    "Zdjęcie produktowe: elegancki zegarek na ciemnym tle"
  ];

  const handleGenerate = async (targetPrompt?: string) => {
    const finalPrompt = targetPrompt || prompt;
    if (!finalPrompt.trim() || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: finalPrompt }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Wystąpił błąd podczas generowania obrazu.');
      }

      setResult({
        image: data.image,
        text: data.text,
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Nie udało się połączyć z API.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!result?.image) return;
    const link = document.createElement('a');
    link.href = result.image;
    link.download = 'ai-generated.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExampleClick = (ex: string) => {
    setPrompt(ex);
    handleGenerate(ex);
  };

  return (
    <div className="chat-container">

      <header className="chat-header">
        <h1>🎨 Generator grafik AI</h1>
        <p className="chat-subheader">Opisz co chcesz – AI stworzy obraz w kilka sekund</p>

        {/* Klikalne przykłady promptów */}
        <div className="suggestions-list">
          {examples.map((ex, idx) => (
            <button
              key={idx}
              onClick={() => handleExampleClick(ex)}
              disabled={loading}
              className="suggestion-btn"
              style={{ textAlign: 'left' }}
            >
              {ex}
            </button>
          ))}
        </div>
      </header>

      <main className="messages-list" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem', width: '100%', maxWidth: '800px', margin: '0 auto' }}>
        
        {/* Stan ładowania */}
        {loading && (
          <div className="loading-placeholder pulsating" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            aspectRatio: '1/1',
            maxHeight: '400px',
            maxWidth: '400px',
            borderRadius: '16px',
            border: '2px dashed #9333ea',
            background: 'rgba(147, 51, 234, 0.05)',
            color: '#9333ea',
            fontSize: '1.2rem',
            fontWeight: '600',
            gap: '1rem'
          }}>
            <div className="spinner" style={{
              width: '40px',
              height: '40px',
              border: '4px solid rgba(147, 51, 234, 0.1)',
              borderTop: '4px solid #9333ea',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            <span>Generuję... (5-15 sekund)</span>
          </div>
        )}

        {/* Błąd */}
        {error && (
          <div className="error-message" style={{
            padding: '1rem 1.5rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '12px',
            color: '#ef4444',
            width: '100%',
            maxWidth: '500px',
            textAlign: 'center',
            marginBottom: '1rem'
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Wynik */}
        {result && (
          <div className="result-container" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            maxWidth: '500px',
            background: 'var(--card-bg, #ffffff)',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            border: '1px solid var(--border-color, #e2e8f0)',
            borderRadius: '20px',
            padding: '1.5rem',
            gap: '1.5rem',
            animation: 'fadeIn 0.5s ease-out'
          }}>
            <div className="image-wrapper" style={{
              width: '100%',
              aspectRatio: '1/1',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)'
            }}>
              <img
                src={result.image}
                alt={prompt}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>

            {result.text && (
              <p className="image-commentary" style={{
                fontSize: '0.95rem',
                color: 'var(--text-muted, #4a5568)',
                textAlign: 'center',
                lineHeight: '1.5',
                padding: '0 0.5rem',
                margin: 0
              }}>
                💬 {result.text}
              </p>
            )}

            <div className="action-buttons" style={{
              display: 'flex',
              gap: '1rem',
              width: '100%'
            }}>
              <button
                onClick={handleDownload}
                className="action-btn download-btn"
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#22c55e',
                  color: '#ffffff',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  transition: 'background 0.2s'
                }}
              >
                💾 Pobierz (.png)
              </button>
              <button
                onClick={() => handleGenerate()}
                className="action-btn retry-btn"
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  background: 'transparent',
                  color: 'var(--text-color, #1e293b)',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  transition: 'background 0.2s'
                }}
              >
                🔄 Ponownie
              </button>
            </div>
          </div>
        )}
      </main>

      <form onSubmit={(e) => { e.preventDefault(); handleGenerate(); }} className="chat-form">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Opisz obraz który chcesz wygenerować..."
          className="chat-input"
          disabled={loading}
          rows={2}
          style={{
            resize: 'none',
            fontFamily: 'inherit',
            fontSize: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: '12px',
            border: '1px solid var(--border-color, #cbd5e1)',
            outline: 'none',
            flex: 1
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleGenerate();
            }
          }}
        />
        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="chat-button"
          style={{
            alignSelf: 'stretch',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 1.5rem'
          }}
        >
          🎨 Generuj
        </button>
      </form>

      {/* Embedded CSS for custom keyframes */}
      <style jsx global>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .pulsating {
          animation: pulse 2s infinite ease-in-out;
        }
        @keyframes pulse {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
