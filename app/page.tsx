'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface WeatherData {
  temp: number;
  humidity: number;
  windSpeed: number;
  desc: string;
  code: number;
  city: string;
}

interface CurrencyRate {
  code: string;
  mid: number;
  date: string;
}

interface Holiday {
  date: string;
  localName: string;
  name: string;
}

const CITIES = [
  { name: 'Gdynia', lat: 54.5189, lon: 18.5305 },
  { name: 'Warszawa', lat: 52.2297, lon: 21.0122 },
  { name: 'Kraków', lat: 50.0647, lon: 19.9450 },
  { name: 'Gdańsk', lat: 54.3520, lon: 18.6464 },
  { name: 'Wrocław', lat: 51.1079, lon: 17.0385 },
  { name: 'Poznań', lat: 52.4064, lon: 16.9252 },
];

function getWeatherDescription(code: number): string {
  const codes: Record<number, string> = {
    0: 'Czyste niebo ☀️',
    1: 'Głównie czyste 🌤️',
    2: 'Częściowe zachmurzenie ⛅',
    3: 'Całkowite zachmurzenie ☁️',
    45: 'Mgła 🌫️',
    48: 'Szron osadzający mgłę 🌫️',
    51: 'Lekka mżawka 🌧️',
    53: 'Umiarkowana mżawka 🌧️',
    55: 'Gęsta mżawka 🌧️',
    61: 'Słaby deszcz 🌧️',
    63: 'Umiarkowany deszcz 🌧️',
    65: 'Silny deszcz 🌧️',
    71: 'Słabe opady śniegu ❄️',
    73: 'Umiarkowane opady śniegu ❄️',
    75: 'Silne opady śniegu ❄️',
    77: 'Ziarna lodowe ❄️',
    80: 'Słaby deszcz przelotny 🌧️',
    81: 'Umiarkowany deszcz przelotny 🌧️',
    82: 'Gwałtowny deszcz przelotny 🌧️',
    85: 'Słaby śnieg przelotny ❄️',
    86: 'Silny śnieg przelotny ❄️',
    95: 'Burza ⛈️',
    96: 'Burza z lekkim gradem ⛈️',
    99: 'Burza z silnym gradem ⛈️',
  };
  return codes[code] || 'Nieznane warunki';
}

export default function DashboardPage() {
  const [selectedCity, setSelectedCity] = useState(CITIES[0]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [currencies, setCurrencies] = useState<Record<string, CurrencyRate>>({});
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  
  const [isWeatherLoading, setIsWeatherLoading] = useState(true);
  const [isCurrencyLoading, setIsCurrencyLoading] = useState(true);
  const [isHolidaysLoading, setIsHolidaysLoading] = useState(true);

  const [weatherUpdateTime, setWeatherUpdateTime] = useState<string>('');
  const [currencyUpdateTime, setCurrencyUpdateTime] = useState<string>('');
  const [holidaysUpdateTime, setHolidaysUpdateTime] = useState<string>('');

  // 1. Time & Date updater
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setCurrentDate(now.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // 2. Weather Fetcher
  const fetchWeather = useCallback(async (city = selectedCity) => {
    setIsWeatherLoading(true);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`;
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const current = data.current;
      setWeather({
        temp: current.temperature_2m,
        humidity: current.relative_humidity_2m,
        windSpeed: current.wind_speed_10m,
        code: current.weather_code,
        desc: getWeatherDescription(current.weather_code),
        city: city.name,
      });
      setWeatherUpdateTime(new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }));
    } catch {
      console.error('Failed to load weather');
    } finally {
      setIsWeatherLoading(false);
    }
  }, [selectedCity]);

  // 3. Currency Fetcher
  const fetchCurrencies = useCallback(async () => {
    setIsCurrencyLoading(true);
    try {
      const list = ['EUR', 'USD', 'GBP'];
      const fetched: Record<string, CurrencyRate> = {};
      
      await Promise.all(
        list.map(async (code) => {
          const url = `https://api.nbp.pl/api/exchangerates/rates/a/${code}/?format=json`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            fetched[code] = {
              code,
              mid: data.rates[0].mid,
              date: data.rates[0].effectiveDate,
            };
          }
        })
      );
      
      setCurrencies(fetched);
      setCurrencyUpdateTime(new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }));
    } catch {
      console.error('Failed to load currencies');
    } finally {
      setIsCurrencyLoading(false);
    }
  }, []);

  // 4. Holidays Fetcher
  const fetchHolidays = useCallback(async () => {
    setIsHolidaysLoading(true);
    try {
      const currentYear = new Date().getFullYear();
      const url = `https://date.nager.at/api/v3/publicholidays/${currentYear}/PL`;
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Holiday[];
      
      // Filter next upcoming holidays
      const nowStr = new Date().toISOString().split('T')[0];
      const upcoming = data
        .filter((h) => h.date >= nowStr)
        .slice(0, 4); // Display up to 4 holidays

      setHolidays(upcoming);
      setHolidaysUpdateTime(new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }));
    } catch {
      console.error('Failed to load holidays');
    } finally {
      setIsHolidaysLoading(false);
    }
  }, []);

  const handleRefreshAll = () => {
    fetchWeather();
    fetchCurrencies();
    fetchHolidays();
  };

  // Trigger loading on mount / city change
  useEffect(() => {
    fetchWeather();
  }, [selectedCity, fetchWeather]);

  useEffect(() => {
    fetchCurrencies();
    fetchHolidays();
  }, [fetchCurrencies, fetchHolidays]);

  // Intervals for auto-refresh
  useEffect(() => {
    const weatherInterval = setInterval(fetchWeather, 15 * 60 * 1000); // 15 mins
    const currencyInterval = setInterval(fetchCurrencies, 60 * 60 * 1000); // 1 hour
    return () => {
      clearInterval(weatherInterval);
      clearInterval(currencyInterval);
    };
  }, [fetchWeather, fetchCurrencies]);

  return (
    <div className="dashboard-root">
      <style jsx>{`
        .dashboard-root {
          width: 100%;
          max-width: 1100px;
          display: flex;
          flex-direction: column;
          gap: 2rem;
          padding: 1rem;
          animation: fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Header Branding */
        .dash-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          padding-bottom: 1.5rem;
        }
        .header-left {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .header-title {
          font-size: 2rem;
          font-weight: 800;
          background: linear-gradient(135deg, #ffffff, #a5b4fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin: 0;
        }
        .header-time {
          font-size: 0.95rem;
          color: #94a3b8;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .time-badge {
          background: rgba(99, 102, 241, 0.15);
          color: #a5b4fc;
          padding: 0.2rem 0.6rem;
          border-radius: 0.25rem;
          font-weight: 700;
          font-family: monospace;
        }

        .refresh-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          width: 42px;
          height: 42px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 1.2rem;
        }
        .refresh-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          transform: rotate(180deg);
        }

        /* Dashboard grid layout */
        .dash-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
        }

        @media (max-width: 800px) {
          .dash-grid {
            grid-template-columns: 1fr;
          }
          .dash-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
          }
          .refresh-btn {
            align-self: flex-end;
          }
        }

        /* Card styles */
        .dash-card {
          border-radius: 1.25rem;
          border: 1px solid rgba(255, 255, 255, 0.05);
          overflow: hidden;
          background: rgba(13, 13, 22, 0.35);
          backdrop-filter: blur(20px);
          box-shadow: 0 10px 30px rgba(0,0,0,0.25);
          display: flex;
          flex-direction: column;
          min-height: 250px;
        }
        .card-header {
          padding: 1.25rem 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(0, 0, 0, 0.25);
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }
        .card-title {
          font-size: 0.85rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .card-meta {
          font-size: 0.72rem;
          color: #475569;
        }
        .card-body {
          padding: 1.5rem;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        /* Specific card variants */
        .card-weather {
          border-color: rgba(56, 189, 248, 0.25);
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.04), rgba(13, 13, 22, 0.35));
        }
        .card-weather .card-title { color: #38bdf8; }

        .card-currency {
          border-color: rgba(52, 211, 153, 0.25);
          background: linear-gradient(135deg, rgba(52, 211, 153, 0.04), rgba(13, 13, 22, 0.35));
        }
        .card-currency .card-title { color: #34d399; }

        .card-holidays {
          border-color: rgba(245, 158, 11, 0.25);
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.04), rgba(13, 13, 22, 0.35));
        }
        .card-holidays .card-title { color: #f59e0b; }

        .card-actions {
          border-color: rgba(168, 85, 247, 0.25);
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.04), rgba(13, 13, 22, 0.35));
        }
        .card-actions .card-title { color: #c084fc; }

        /* Weather UI content */
        .weather-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
        }
        .weather-left {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .weather-city-select {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #e2e8f0;
          padding: 0.35rem 0.75rem;
          border-radius: 0.4rem;
          font-size: 0.85rem;
          outline: none;
          cursor: pointer;
          font-weight: 600;
        }
        .weather-temp {
          font-size: 3rem;
          font-weight: 800;
          color: #ffffff;
        }
        .weather-desc {
          font-size: 0.95rem;
          color: #94a3b8;
          font-weight: 600;
        }
        .weather-right {
          font-size: 0.82rem;
          color: #64748b;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          background: rgba(0, 0, 0, 0.15);
          padding: 0.75rem 1rem;
          border-radius: 0.75rem;
        }
        .weather-stat span { color: #cbd5e1; font-weight: 600; }

        /* Currency UI content */
        .currency-list {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .currency-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(0, 0, 0, 0.15);
          padding: 0.7rem 1rem;
          border-radius: 0.75rem;
          border: 1px solid rgba(255,255,255,0.02);
        }
        .curr-left {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }
        .curr-flag { font-size: 1.1rem; }
        .curr-code { font-weight: 700; color: #f1f5f9; font-size: 0.9rem; }
        .curr-rate { font-weight: 800; color: #34d399; font-family: monospace; font-size: 1rem; }

        /* Holidays UI content */
        .holiday-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .holiday-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.85rem;
          background: rgba(0, 0, 0, 0.15);
          padding: 0.6rem 0.85rem;
          border-radius: 0.6rem;
        }
        .hol-left {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .hol-name { font-weight: 600; color: #cbd5e1; }
        .hol-local { font-size: 0.72rem; color: #475569; }
        .hol-date {
          font-size: 0.78rem;
          font-weight: 700;
          color: #f59e0b;
          font-family: monospace;
          background: rgba(245, 158, 11, 0.1);
          padding: 0.15rem 0.4rem;
          border-radius: 0.25rem;
          white-space: nowrap;
        }

        /* Quick actions content */
        .actions-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
        }
        .action-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          border-radius: 0.75rem;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.04);
          color: #a5b4fc;
          text-decoration: none;
          font-size: 0.82rem;
          font-weight: 600;
          transition: all 0.2s ease;
        }
        .action-btn:hover {
          background: rgba(168, 85, 247, 0.12);
          border-color: rgba(168, 85, 247, 0.4);
          color: #ffffff;
          transform: translateY(-1px);
        }

        /* Loading Skeletons */
        .skeleton {
          background: linear-gradient(90deg, rgba(255,255,255,0.02) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.02) 75%);
          background-size: 200% 100%;
          animation: loadingSkeleton 1.5s infinite;
          border-radius: 0.5rem;
        }
        @keyframes loadingSkeleton {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* Main Dash Header */}
      <header className="dash-header">
        <div className="header-left">
          <h1 className="header-title">🌅 Dzień dobry!</h1>
          <div className="header-time">
            <span>Dziś jest: <strong>{currentDate}</strong></span>
            <span className="time-badge">{currentTime}</span>
          </div>
        </div>
        <button className="refresh-btn" onClick={handleRefreshAll} title="Odśwież wszystkie dane">
          🔄
        </button>
      </header>

      {/* Diagnostics Cards Grid */}
      <div className="dash-grid">
        {/* Weather Card */}
        <div className="dash-card card-weather">
          <div className="card-header">
            <div className="card-title">🌤️ Aktualna Pogoda</div>
            <span className="card-meta">
              {weatherUpdateTime ? `Aktualizacja: ${weatherUpdateTime}` : 'Ładowanie...'}
            </span>
          </div>
          <div className="card-body">
            {isWeatherLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className="skeleton" style={{ height: '3rem', width: '60%' }} />
                <div className="skeleton" style={{ height: '1.5rem', width: '40%' }} />
              </div>
            ) : (
              weather && (
                <div className="weather-content">
                  <div className="weather-left">
                    <select
                      className="weather-city-select"
                      value={selectedCity.name}
                      onChange={(e) => {
                        const city = CITIES.find((c) => c.name === e.target.value);
                        if (city) setSelectedCity(city);
                      }}
                    >
                      {CITIES.map((c) => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                    <div className="weather-temp">{weather.temp.toFixed(1)}°C</div>
                    <div className="weather-desc">{weather.desc}</div>
                  </div>
                  <div className="weather-right">
                    <div className="weather-stat">Wilgotność: <span>{weather.humidity}%</span></div>
                    <div className="weather-stat">Wiatr: <span>{weather.windSpeed.toFixed(1)} km/h</span></div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* Currency Rates Card */}
        <div className="dash-card card-currency">
          <div className="card-header">
            <div className="card-title">💶 Kursy Walut (NBP)</div>
            <span className="card-meta">
              {currencyUpdateTime ? `Aktualizacja: ${currencyUpdateTime}` : 'Ładowanie...'}
            </span>
          </div>
          <div className="card-body">
            {isCurrencyLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div className="skeleton" style={{ height: '2.5rem' }} />
                <div className="skeleton" style={{ height: '2.5rem' }} />
                <div className="skeleton" style={{ height: '2.5rem' }} />
              </div>
            ) : (
              <div className="currency-list">
                {currencies.EUR && (
                  <div className="currency-row">
                    <div className="curr-left">
                      <span className="curr-flag">🇪🇺</span>
                      <span className="curr-code">Euro (EUR)</span>
                    </div>
                    <div className="curr-rate">{currencies.EUR.mid.toFixed(4)} PLN</div>
                  </div>
                )}
                {currencies.USD && (
                  <div className="currency-row">
                    <div className="curr-left">
                      <span className="curr-flag">🇺🇸</span>
                      <span className="curr-code">Dolar (USD)</span>
                    </div>
                    <div className="curr-rate">{currencies.USD.mid.toFixed(4)} PLN</div>
                  </div>
                )}
                {currencies.GBP && (
                  <div className="currency-row">
                    <div className="curr-left">
                      <span className="curr-flag">🇬🇧</span>
                      <span className="curr-code">Funt szterling (GBP)</span>
                    </div>
                    <div className="curr-rate">{currencies.GBP.mid.toFixed(4)} PLN</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Holidays Card */}
        <div className="dash-card card-holidays">
          <div className="card-header">
            <div className="card-title">📅 Nadchodzące Święta</div>
            <span className="card-meta">
              {holidaysUpdateTime ? `Święta w PL: ${holidaysUpdateTime}` : 'Ładowanie...'}
            </span>
          </div>
          <div className="card-body">
            {isHolidaysLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className="skeleton" style={{ height: '2.2rem' }} />
                <div className="skeleton" style={{ height: '2.2rem' }} />
                <div className="skeleton" style={{ height: '2.2rem' }} />
              </div>
            ) : holidays.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#475569', fontSize: '0.85rem' }}>
                Brak nadchodzących świąt w tym roku.
              </div>
            ) : (
              <div className="holiday-list">
                {holidays.map((h, idx) => (
                  <div key={idx} className="holiday-row">
                    <div className="hol-left">
                      <span className="hol-name">{h.localName}</span>
                      <span className="hol-local">{h.name}</span>
                    </div>
                    <span className="hol-date">{h.date}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions Card */}
        <div className="dash-card card-actions">
          <div className="card-header">
            <div className="card-title">🤖 Szybkie Akcje</div>
            <span className="card-meta">Dostępne tryby pracy</span>
          </div>
          <div className="card-body" style={{ justifyContent: 'center' }}>
            <div className="actions-grid">
              <Link href="/travel" className="action-btn">
                <span>🌍</span> Zaplanuj podróż
              </Link>
              <Link href="/react" className="action-btn">
                <span>🔄</span> Agent ReAct
              </Link>
              <Link href="/chat" className="action-btn">
                <span>💬</span> Czat z personą
              </Link>
              <Link href="/think" className="action-btn">
                <span>🧠</span> Tryb myślenia
              </Link>
              <Link href="/generate" className="action-btn">
                <span>🎨</span> Grafiki AI
              </Link>
              <Link href="/fewshot" className="action-btn">
                <span>📚</span> Słownik AI
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
