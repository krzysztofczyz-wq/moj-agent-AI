'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: Message[];
}

export default function ConversationDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  // Unwrap params using React.use()
  const resolvedParams = use(params);
  const conversationId = resolvedParams.id;

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConversationDetails = async () => {
      setLoading(true);
      try {
        // Fetch conversation and its messages
        const { data: convData, error: convErr } = await supabase
          .from('conversations')
          .select('id, title, created_at, updated_at')
          .eq('id', conversationId)
          .single();

        if (convErr) throw convErr;

        const { data: msgData, error: msgErr } = await supabase
          .from('messages')
          .select('id, role, content, created_at')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        if (msgErr) throw msgErr;

        setConversation({
          ...(convData as any),
          messages: (msgData as any) || []
        });
      } catch (err) {
        console.error('Error fetching conversation details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchConversationDetails();
  }, [conversationId]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('pl-PL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTimeOnly = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="detail-container" style={{ width: '100%', maxWidth: '800px', margin: '0 auto', padding: '1rem' }}>
      <style jsx>{`
        .detail-container {
          color: #f4f4f7;
          display: flex;
          flex-direction: column;
          height: calc(100vh - 4rem);
        }
        .header {
          margin-bottom: 1.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 1.5rem;
        }
        .nav-buttons {
          display: flex;
          justify-content: space-between;
          margin-bottom: 1.5rem;
        }
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 1.2rem;
          border-radius: 0.5rem;
          text-decoration: none;
          font-size: 0.88rem;
          font-weight: 600;
          transition: all 0.2s ease;
          border: 1px solid transparent;
        }
        .btn-back {
          background: rgba(30, 30, 45, 0.6);
          border-color: rgba(255, 255, 255, 0.05);
          color: #94a3b8;
        }
        .btn-back:hover {
          color: #fff;
          background: rgba(30, 30, 45, 0.9);
          border-color: rgba(255, 255, 255, 0.1);
        }
        .btn-continue {
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          color: #fff;
        }
        .btn-continue:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }
        .title-area h1 {
          font-size: 1.6rem;
          font-weight: 800;
          margin-bottom: 0.4rem;
          color: #fff;
        }
        .meta-text {
          font-size: 0.85rem;
          color: #94a3b8;
        }
        .messages-list {
          flex: 1;
          overflow-y: auto;
          padding-right: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          margin-bottom: 1rem;
        }
        .message-wrapper {
          display: flex;
          width: 100%;
        }
        .message-wrapper.user {
          justify-content: flex-end;
        }
        .message-wrapper.assistant {
          justify-content: flex-start;
        }
        .message-bubble {
          max-width: 70%;
          padding: 1rem 1.25rem;
          border-radius: 1rem;
          position: relative;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
          line-height: 1.5;
          font-size: 0.95rem;
        }
        .user .message-bubble {
          background: linear-gradient(135deg, #3b82f6, #1d4ed8);
          color: #ffffff;
          border-bottom-right-radius: 0.25rem;
        }
        .assistant .message-bubble {
          background: #1e1e2f;
          border: 1px solid rgba(255, 255, 255, 0.05);
          color: #f4f4f7;
          border-bottom-left-radius: 0.25rem;
        }
        .bubble-header {
          font-size: 0.72rem;
          color: rgba(255, 255, 255, 0.5);
          margin-bottom: 0.35rem;
          display: flex;
          justify-content: space-between;
          gap: 1rem;
        }
        .bubble-time {
          font-size: 0.72rem;
          color: rgba(255, 255, 255, 0.4);
          margin-top: 0.5rem;
          text-align: right;
          display: block;
        }
        .loading-spinner {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100%;
        }
        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(255,255,255,0.1);
          border-top: 4px solid #6366f1;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {loading ? (
        <div className="loading-spinner">
          <div className="spinner"></div>
        </div>
      ) : !conversation ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>Rozmowa nie została znaleziona.</p>
          <Link href="/history" className="btn btn-back">
            Wróć do listy
          </Link>
        </div>
      ) : (
        <>
          <header className="header">
            <div className="nav-buttons">
              <Link href="/history" className="btn btn-back">
                ← Wróć do listy
              </Link>
              <Link href={`/chat?id=${conversation.id}`} className="btn btn-continue">
                🔄 Kontynuuj rozmowę
              </Link>
            </div>
            <div className="title-area">
              <h1>{conversation.title || 'Rozmowa bez tytułu'}</h1>
              <p className="meta-text">Ostatnia aktywność: {formatDate(conversation.updated_at)}</p>
            </div>
          </header>

          <main className="messages-list">
            {conversation.messages.map((m) => (
              <div key={m.id} className={`message-wrapper ${m.role}`}>
                <div className="message-bubble">
                  <div className="bubble-header">
                    <span>{m.role === 'user' ? 'Ty' : 'Oskar (Agent)'}</span>
                  </div>
                  <div className="bubble-content" style={{ whiteSpace: 'pre-wrap' }}>
                    {m.content}
                  </div>
                  <span className="bubble-time">{formatTimeOnly(m.created_at)}</span>
                </div>
              </div>
            ))}
          </main>
        </>
      )}
    </div>
  );
}
