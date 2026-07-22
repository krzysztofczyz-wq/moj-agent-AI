'use client';

import { useEffect, useState } from 'react';
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

export default function HistoryPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      // Fetch conversations and their messages in a single query
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          id,
          title,
          created_at,
          updated_at,
          messages (
            id,
            role,
            content,
            created_at
          )
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setConversations((data as any) || []);
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault(); // Prevent navigating to detail page
    e.stopPropagation();

    const confirmed = window.confirm('Czy na pewno chcesz usunąć tę rozmowę? Tej operacji nie można cofnąć.');
    if (!confirmed) return;

    try {
      // 1. Delete messages first due to foreign key constraints
      const { error: msgErr } = await supabase
        .from('messages')
        .delete()
        .eq('conversation_id', id);
      if (msgErr) throw msgErr;

      // 2. Delete conversation
      const { error: convErr } = await supabase
        .from('conversations')
        .delete()
        .eq('id', id);
      if (convErr) throw convErr;

      // 3. Update local state
      setConversations(conversations.filter(c => c.id !== id));
      
      // 4. Show toast
      setToastMessage('Rozmowa usunięta');
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      console.error('Error deleting conversation:', err);
      alert('Nie udało się usunąć rozmowy.');
    }
  };

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

  // Filter conversations by search query (checks title and messages content)
  const filteredConversations = conversations.filter(c => {
    const titleMatch = c.title.toLowerCase().includes(searchQuery.toLowerCase());
    const messageMatch = c.messages?.some(m => 
      m.content.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return titleMatch || messageMatch;
  });

  return (
    <div className="history-container" style={{ width: '100%', maxWidth: '800px', margin: '0 auto', padding: '1rem' }}>
      <style jsx>{`
        .history-container {
          color: #f4f4f7;
        }
        .header {
          margin-bottom: 2rem;
          text-align: center;
        }
        .header h1 {
          font-size: 2rem;
          margin-bottom: 0.5rem;
          background: linear-gradient(90deg, #818cf8, #c084fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .header p {
          color: #94a3b8;
          font-size: 0.95rem;
        }
        .search-box {
          margin-bottom: 2rem;
          width: 100%;
        }
        .search-input {
          width: 100%;
          padding: 0.8rem 1.2rem;
          border-radius: 0.5rem;
          background: rgba(30, 30, 45, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #fff;
          font-size: 0.95rem;
          transition: all 0.2s ease;
          outline: none;
        }
        .search-input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.2);
        }
        .conv-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .conv-card {
          background: #1a1a2a;
          border: 1px solid #333;
          border-radius: 0.75rem;
          padding: 1.2rem;
          position: relative;
          transition: all 0.25s ease;
          display: block;
          text-decoration: none;
          color: inherit;
          cursor: pointer;
        }
        .conv-card:hover {
          background: #1f1f35;
          border-color: #61f8f8;
          transform: translateY(-2px);
        }
        .conv-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.6rem;
          padding-right: 2.5rem;
        }
        .conv-title {
          font-size: 1.1rem;
          font-weight: 700;
          color: #fff;
          margin: 0;
        }
        .conv-meta {
          display: flex;
          gap: 1rem;
          font-size: 0.8rem;
          color: #94a3b8;
          margin-bottom: 0.75rem;
        }
        .preview-text {
          font-size: 0.88rem;
          color: #94a3b8;
          font-style: italic;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .delete-btn {
          position: absolute;
          top: 1.2rem;
          right: 1.2rem;
          background: transparent;
          border: none;
          color: #ef4444;
          cursor: pointer;
          font-size: 1.1rem;
          opacity: 0.5;
          transition: all 0.2s ease;
          padding: 0.25rem;
          border-radius: 0.25rem;
        }
        .conv-card:hover .delete-btn {
          opacity: 1;
        }
        .delete-btn:hover {
          background: rgba(239, 68, 68, 0.15);
          transform: scale(1.1);
        }
        .empty-state {
          text-align: center;
          padding: 3rem 1.5rem;
          background: #1a1a2a;
          border: 1px dashed #333;
          border-radius: 0.75rem;
        }
        .empty-state p {
          color: #94a3b8;
          margin-bottom: 1.5rem;
        }
        .start-btn {
          display: inline-block;
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          color: #fff;
          padding: 0.75rem 1.5rem;
          border-radius: 0.5rem;
          text-decoration: none;
          font-weight: 600;
          transition: all 0.2s ease;
        }
        .start-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }
        .toast {
          position: fixed;
          bottom: 2rem;
          right: 2rem;
          background: #10b981;
          color: #fff;
          padding: 0.8rem 1.5rem;
          border-radius: 0.5rem;
          font-weight: 600;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3);
          z-index: 1000;
          animation: slideIn 0.2s ease;
        }
        .loading-spinner {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 200px;
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
        @keyframes slideIn {
          from { transform: translateY(1rem); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <header className="header">
        <h1>📜 Historia rozmów</h1>
        <p>Wszystkie Twoje rozmowy z agentem</p>
      </header>

      {/* Search Input Box */}
      <div className="search-box">
        <input
          type="text"
          placeholder="Szukaj w rozmowach..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      {loading ? (
        <div className="loading-spinner">
          <div className="spinner"></div>
        </div>
      ) : filteredConversations.length === 0 ? (
        <div className="empty-state">
          <p>{searchQuery ? 'Nie znaleziono rozmów spełniających kryteria.' : 'Nie masz jeszcze żadnych rozmów. Zacznij nową!'}</p>
          <Link href="/chat" className="start-btn">
            Rozpocznij rozmowę
          </Link>
        </div>
      ) : (
        <div className="conv-list">
          {filteredConversations.map((c) => {
            // Sort messages to get the chronological last one
            const sortedMessages = [...(c.messages || [])].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            const lastMessage = sortedMessages[sortedMessages.length - 1];

            return (
              <Link key={c.id} href={`/history/${c.id}`} className="conv-card">
                <div className="conv-header">
                  <h3 className="conv-title">{c.title || 'Rozmowa bez tytułu'}</h3>
                  <button 
                    onClick={(e) => handleDelete(e, c.id)}
                    className="delete-btn"
                    title="Usuń rozmowę"
                  >
                    🗑️
                  </button>
                </div>
                <div className="conv-meta">
                  <span>📅 {formatDate(c.updated_at)}</span>
                  <span>💬 Wiadomości: {c.messages?.length || 0}</span>
                </div>
                {lastMessage && (
                  <p className="preview-text">
                    {lastMessage.role === 'user' ? 'Ty: ' : 'Oskar: '}
                    {lastMessage.content}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Toast Alert popup */}
      {toastMessage && <div className="toast">✅ {toastMessage}</div>}
    </div>
  );
}
