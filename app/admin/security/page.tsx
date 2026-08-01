import React from 'react';
import { supabaseAdmin } from '@/lib/supabase';

// Mark page as dynamic to ensure database data is always fresh on load
export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default async function SecurityAdminPage() {
  // 1. Fetch all users from Supabase Auth so we can match user_id with their emails
  let emailMap = new Map<string, string>();
  try {
    const { data: { users }, error: authErr } = await supabaseAdmin.auth.admin.listUsers();
    if (!authErr && users) {
      users.forEach(u => {
        if (u.id && u.email) {
          emailMap.set(u.id, u.email);
        }
      });
    }
  } catch (err) {
    console.error("Error listing auth users:", err);
  }

  // 2. Fetch blocked messages
  let blockedLogs: any[] = [];
  try {
    const { data } = await supabaseAdmin
      .from('message_logs')
      .select('*')
      .eq('blocked', true)
      .order('created_at', { ascending: false });
    if (data) blockedLogs = data;
  } catch (err) {
    console.error("Error fetching blocked logs:", err);
  }

  // 3. Fetch token usage from the last 7 days
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartStr = todayStart.toISOString();

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartStr = weekStart.toISOString();

  let usageData: any[] = [];
  try {
    const { data } = await supabaseAdmin
      .from('api_usage')
      .select('*')
      .gte('created_at', weekStartStr);
    if (data) usageData = data;
  } catch (err) {
    console.error("Error fetching api usage:", err);
  }

  // Compute usage statistics per user
  const userStats: Record<string, { today: number; week: number }> = {};
  const todayMs = todayStart.getTime();

  usageData.forEach(row => {
    const uid = row.user_id;
    if (!uid) return;
    const tokens = (row.tokens_input || 0) + (row.tokens_output || 0);
    const rowTime = new Date(row.created_at).getTime();

    if (!userStats[uid]) {
      userStats[uid] = { today: 0, week: 0 };
    }

    userStats[uid].week += tokens;
    if (rowTime >= todayMs) {
      userStats[uid].today += tokens;
    }
  });

  const topUsers = Object.entries(userStats)
    .map(([uid, stats]) => ({
      userId: uid,
      email: emailMap.get(uid) || 'Anonymous',
      today: stats.today,
      week: stats.week,
      pctLimit: Math.min(100, Math.round((stats.today / 10000) * 100))
    }))
    .sort((a, b) => b.week - a.week)
    .slice(0, 5);

  // 4. Alerts calculation
  const alerts: Array<{ type: 'danger' | 'warning'; title: string; message: string; date: string }> = [];

  // - User who reached 80% limit (8k tokens today)
  Object.entries(userStats).forEach(([uid, stats]) => {
    if (stats.today >= 8000) {
      alerts.push({
        type: 'danger',
        title: 'Przekroczenie 80% limitu tokenów',
        message: `Użytkownik ${emailMap.get(uid) || uid} zużył dzisiaj już ${stats.today} tokenów (limit 10k).`,
        date: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
      });
    }
  });

  // - User who sent > 20 messages in 10 minutes
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  let recentLogs: any[] = [];
  try {
    const { data } = await supabaseAdmin
      .from('message_logs')
      .select('user_id')
      .gte('created_at', tenMinutesAgo);
    if (data) recentLogs = data;
  } catch (err) {
    console.error("Error fetching recent message logs:", err);
  }

  const recentCounts: Record<string, number> = {};
  recentLogs.forEach(log => {
    recentCounts[log.user_id] = (recentCounts[log.user_id] || 0) + 1;
  });

  Object.entries(recentCounts).forEach(([uid, count]) => {
    if (count > 20) {
      alerts.push({
        type: 'danger',
        title: 'Podejrzenie spamu / Flooding',
        message: `Użytkownik ${emailMap.get(uid) || uid} wysłał ${count} wiadomości w ciągu 10 minut!`,
        date: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
      });
    }
  });

  // - Message blocked by output filter (reason: output_filter_leak)
  let leakLogs: any[] = [];
  try {
    const { data } = await supabaseAdmin
      .from('message_logs')
      .select('*')
      .eq('reason', 'output_filter_leak')
      .order('created_at', { ascending: false })
      .limit(5);
    if (data) leakLogs = data;
  } catch (err) {
    console.error("Error fetching leak logs:", err);
  }

  leakLogs.forEach(log => {
    alerts.push({
      type: 'warning',
      title: 'Próba wycieku promptu',
      message: `Zablokowano próbę wycieku promptu systemowego u użytkownika ${emailMap.get(log.user_id) || log.user_id}.`,
      date: new Date(log.created_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    });
  });

  // 5. Statystyki ogólne
  const totalTokensToday = Object.values(userStats).reduce((acc, s) => acc + s.today, 0);
  const totalTokensWeek = Object.values(userStats).reduce((acc, s) => acc + s.week, 0);

  let totalBlocked = 0;
  try {
    const { count } = await supabaseAdmin
      .from('message_logs')
      .select('*', { count: 'exact', head: true })
      .eq('blocked', true);
    totalBlocked = count || 0;
  } catch (err) {
    console.error("Error counting blocked logs:", err);
  }

  const activeUsersCount = Object.keys(userStats).length;
  const avgUsagePerUser = activeUsersCount > 0 ? Math.round(totalTokensWeek / activeUsersCount) : 0;

  return (
    <div style={{
      width: '100%',
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '2rem 1rem',
      height: '100%',
      overflowY: 'auto',
      color: '#f4f4f7'
    }}>
      <style>{`
        .sec-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
          margin-top: 1.5rem;
        }
        @media (max-width: 1024px) {
          .sec-grid {
            grid-template-columns: 1fr;
          }
        }
        .sec-card {
          background: rgba(13, 13, 22, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 1.5rem;
          backdrop-filter: blur(16px);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        }
        .sec-title {
          font-size: 1.15rem;
          font-weight: 700;
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #ffffff;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        @media (max-width: 768px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .stat-box {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 12px;
          padding: 1rem;
          text-align: center;
        }
        .stat-val {
          font-size: 1.5rem;
          font-weight: 800;
          color: #818cf8;
          margin-top: 0.25rem;
        }
        .stat-label {
          font-size: 0.75rem;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .sec-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
          text-align: left;
        }
        .sec-table th {
          padding: 0.75rem 0.5rem;
          color: #94a3b8;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          font-weight: 600;
        }
        .sec-table td {
          padding: 0.75rem 0.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          color: #cbd5e1;
        }
        .alert-item {
          display: flex;
          gap: 0.75rem;
          padding: 0.75rem;
          border-radius: 10px;
          margin-bottom: 0.75rem;
          font-size: 0.85rem;
        }
        .alert-danger {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #fca5a5;
        }
        .alert-warning {
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.2);
          color: #fde047;
        }
        .progress-bg {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          height: 6px;
          width: 100%;
          overflow: hidden;
          margin-top: 0.25rem;
        }
        .progress-bar {
          background: linear-gradient(90deg, #6366f1, #c084fc);
          height: 100%;
          border-radius: 4px;
        }
      `}</style>

      {/* Header Area */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        paddingBottom: '1rem',
        marginBottom: '2.5rem'
      }}>
        <div>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: 800,
            margin: 0,
            background: 'linear-gradient(90deg, #ffffff, #a5b4fc)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>🛡️ Panel bezpieczeństwa</h1>
          <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
            System monitorowania anomalii, limitów tokenów i filtrowania wycieków promptu.
          </p>
        </div>
      </div>

      {/* Section 4: Statystyki ogólne */}
      <div className="stats-grid">
        <div className="stat-box">
          <div className="stat-label">Tokeny Dziś</div>
          <div className="stat-val">{totalTokensToday.toLocaleString()}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Tokeny w Tygodniu</div>
          <div className="stat-val">{totalTokensWeek.toLocaleString()}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Zablokowane Wiadomości</div>
          <div className="stat-val" style={{ color: '#f87171' }}>{totalBlocked}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Śr. Zużycie / User</div>
          <div className="stat-val" style={{ color: '#c084fc' }}>{avgUsagePerUser.toLocaleString()}</div>
        </div>
      </div>

      <div className="sec-grid">
        {/* Section 3: Alerty */}
        <div className="sec-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="sec-title">
            <span>🔴</span> Alerty i podejrzane zdarzenia
          </div>
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '350px' }}>
            {alerts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: '#94a3b8', fontSize: '0.9rem' }}>
                ✅ Brak podejrzanych zachowań w systemie.
              </div>
            ) : (
              alerts.map((al, idx) => (
                <div key={idx} className={`alert-item alert-${al.type}`}>
                  <span style={{ fontSize: '1.1rem' }}>{al.type === 'danger' ? '🚨' : '⚠️'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.15rem' }}>{al.title}</div>
                    <div style={{ opacity: 0.9 }}>{al.message}</div>
                  </div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.6, alignSelf: 'flex-start' }}>{al.date}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Section 2: Top 5 Użytkowników */}
        <div className="sec-card">
          <div className="sec-title">
            <span>📊</span> Top 5 użytkowników po zużyciu
          </div>
          <div style={{ overflowX: 'auto' }}>
            {topUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: '#94a3b8', fontSize: '0.9rem' }}>
                Brak zarejestrowanego zużycia.
              </div>
            ) : (
              <table className="sec-table">
                <thead>
                  <tr>
                    <th>Użytkownik</th>
                    <th>Dziś</th>
                    <th>Tydzień</th>
                    <th style={{ width: '120px' }}>Dzienny limit (10k)</th>
                  </tr>
                </thead>
                <tbody>
                  {topUsers.map((u, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600, wordBreak: 'break-all' }}>{u.email}</td>
                      <td>{u.today.toLocaleString()}</td>
                      <td>{u.week.toLocaleString()}</td>
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '2px' }}>
                          <span>{u.pctLimit}%</span>
                          <span>{u.today}/10k</span>
                        </div>
                        <div className="progress-bg">
                          <div className="progress-bar" style={{ width: `${u.pctLimit}%`, background: u.pctLimit >= 80 ? '#f87171' : 'linear-gradient(90deg, #6366f1, #c084fc)' }}></div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Section 1: Zablokowane wiadomości */}
        <div className="sec-card" style={{ gridColumn: 'span 2' }}>
          <div className="sec-title">
            <span>⚠️</span> Zablokowane wiadomości (Logi bezpieczeństwa)
          </div>
          <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
            {blockedLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: '#94a3b8', fontSize: '0.9rem' }}>
                Brak zablokowanych wiadomości w bazie danych.
              </div>
            ) : (
              <table className="sec-table">
                <thead>
                  <tr>
                    <th>Użytkownik</th>
                    <th>Wiadomość (Skrót)</th>
                    <th>Powód blokady</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {blockedLogs.map((log, idx) => {
                    const email = emailMap.get(log.user_id) || log.user_id || 'Anonymous';
                    const dateStr = new Date(log.created_at).toLocaleString('pl-PL');
                    const shortMessage = log.message 
                      ? (log.message.length > 80 ? log.message.slice(0, 80) + '...' : log.message)
                      : 'Brak zawartości (rate limit)';
                    
                    return (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{email}</td>
                        <td style={{ fontStyle: 'italic', wordBreak: 'break-all' }}>{shortMessage}</td>
                        <td>
                          <span style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#fca5a5',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600
                          }}>
                            {log.reason || 'zablokowano'}
                          </span>
                        </td>
                        <td>{dateStr}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
