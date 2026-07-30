'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: '🏠' },
  { href: '/upload', label: 'Baza wiedzy', icon: '📚' },
  { href: '/chat', label: 'Czat z personą', icon: '💬' },
  { href: '/history', label: 'Historia rozmów', icon: '📜' },
  { href: '/think', label: 'Tryb myślenia', icon: '🧠' },
  { href: '/fewshot', label: 'Słownik AI', icon: '📚' },
  { href: '/format', label: 'Formater', icon: '📐' },
  { href: '/search', label: 'Wyszukiwarka', icon: '🌐' },
  { href: '/generate', label: 'Grafiki', icon: '🎨' },
  { href: '/agent', label: 'Agent Multi-tool', icon: '🤖' },
  { href: '/react', label: 'Agent ReAct', icon: '🔄' },
  { href: '/travel', label: 'Asystent podróży', icon: '✈️' },
  { href: '/email-triage', label: 'E-mail Triage', icon: '📧' },
  { href: '/report', label: 'Raporty', icon: '📊' },
];

export default function NavigationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session && pathname !== '/login') {
        router.replace('/login');
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session && pathname !== '/login') {
        router.replace('/login');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const handleLinkClick = () => {
    setIsMobileMenuOpen(false);
  };

  if (pathname === '/login') {
    return <div className="login-root-wrapper">{children}</div>;
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#06060c',
        color: '#f4f4f7'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.1)', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>Wczytywanie sesji...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="layout-root">
      <style jsx global>{`
        /* Reset defaults to fit full-screen layout structure */
        html, body {
          margin: 0;
          padding: 0;
          height: 100%;
          overflow: hidden;
          background: #06060c;
        }

        /* Layout Grid */
        .layout-root {
          display: flex;
          height: 100vh;
          width: 100vw;
          overflow: hidden;
          background: radial-gradient(circle at 50% 0%, #15133c 0%, #06060c 60%);
          color: #f4f4f7;
          font-family: var(--font-geist-sans), system-ui, -apple-system, sans-serif;
        }

        /* Sidebar container */
        .layout-sidebar {
          width: 260px;
          background: rgba(13, 13, 22, 0.7);
          border-right: 1px solid rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(16px);
          display: flex;
          flex-direction: column;
          z-index: 100;
          transition: transform 0.3s ease;
        }

        /* Top brand area */
        .sidebar-brand {
          padding: 1.5rem;
          font-size: 1.1rem;
          font-weight: 800;
          color: #ffffff;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          display: flex;
          align-items: center;
          gap: 0.6rem;
          background: linear-gradient(90deg, #818cf8, #c084fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        /* Sidebar Navigation links list */
        .sidebar-menu {
          flex: 1;
          padding: 1rem 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          overflow-y: auto;
        }

        .menu-link {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.7rem 1rem;
          border-radius: 0.5rem;
          color: #94a3b8;
          text-decoration: none;
          font-size: 0.88rem;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .menu-link:hover {
          background: rgba(255, 255, 255, 0.03);
          color: #e2e8f0;
        }

        .menu-link.active {
          background: linear-gradient(135deg, rgba(79, 70, 229, 0.15), rgba(124, 58, 237, 0.15));
          color: #ffffff;
          border-left: 3px solid #6366f1;
          padding-left: calc(1rem - 3px);
          box-shadow: inset 0 0 10px rgba(99, 102, 241, 0.1);
        }

        /* Sidebar footer user branding info */
        .sidebar-footer {
          padding: 1rem 1.5rem;
          border-top: 1px solid rgba(255, 255, 255, 0.04);
          font-size: 0.75rem;
          color: #475569;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        /* Main Workspace viewport window */
        .layout-content-viewport {
          flex: 1;
          height: 100vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          position: relative;
        }

        /* If subpage uses its own grid/sidebar, adjust to match content perfectly */
        .layout-content-viewport > .chat-container {
          margin: auto;
        }

        /* Mobile layout styling override */
        .mobile-header-bar {
          display: none;
          height: 56px;
          background: rgba(13, 13, 22, 0.8);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(12px);
          padding: 0 1.25rem;
          align-items: center;
          justify-content: space-between;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 101;
        }

        .mobile-brand {
          font-size: 0.95rem;
          font-weight: 800;
          color: #fff;
          background: linear-gradient(90deg, #818cf8, #c084fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hamburger-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0.25rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        @media (max-width: 900px) {
          .layout-sidebar {
            position: fixed;
            top: 56px;
            bottom: 0;
            left: 0;
            width: 250px;
            transform: translateX(-100%);
            box-shadow: 10px 0 30px rgba(0,0,0,0.5);
          }

          .layout-sidebar.open {
            transform: translateX(0);
          }

          .layout-content-viewport {
            padding: 1rem;
            padding-top: calc(56px + 1rem);
            height: calc(100vh - 56px);
            justify-content: flex-start;
          }

          .mobile-header-bar {
            display: flex;
          }
        }
      `}</style>

      {/* Mobile Header bar view */}
      <div className="mobile-header-bar">
        <div className="mobile-brand">🤖 Antigravity AI</div>
        <button className="hamburger-btn" onClick={toggleMobileMenu}>
          {isMobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Main Sidebar Menu panel */}
      <aside className={`layout-sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <span>🤖</span> Antigravity AI
        </div>
        <nav className="sidebar-menu">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`menu-link ${isActive ? 'active' : ''}`}
                onClick={handleLinkClick}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem', padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: '#94a3b8', wordBreak: 'break-all' }}>
            <span>🟢</span> {user?.email || 'System aktywny'}
          </div>
          <button 
            onClick={async () => {
              await supabase.auth.signOut();
              router.push('/login');
            }}
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              padding: '0.35rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 600,
              textAlign: 'center',
              width: '100%',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            }}
          >
            Wyloguj się
          </button>
        </div>
      </aside>

      {/* Main children page body viewport frame */}
      <main className="layout-content-viewport">
        {children}
      </main>
    </div>
  );
}
