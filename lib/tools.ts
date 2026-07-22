import { tool } from 'ai';
import { z } from 'zod';
import { supabase } from './supabase';

// Global memory for notes (persists during dev server lifetime)
const globalForNotes = global as unknown as {
  agentNotes: Array<{ title: string; content: string; createdAt: string }>;
};
if (!globalForNotes.agentNotes) {
  globalForNotes.agentNotes = [];
}

// Weather code description mapping (WMO weather interpretation codes)
function getWeatherDescription(code: number): string {
  const codes: Record<number, string> = {
    0: 'Czyste niebo',
    1: 'Głównie czyste niebo',
    2: 'Częściowe zachmurzenie',
    3: 'Całkowite zachmurzenie',
    45: 'Mgła',
    48: 'Szron osadzający mgłę',
    51: 'Lekka mżawka',
    53: 'Umiarkowana mżawka',
    55: 'Gęsta mżawka',
    61: 'Słaby deszcz',
    63: 'Umiarkowany deszcz',
    65: 'Silny deszcz',
    71: 'Słabe opady śniegu',
    73: 'Umiarkowane opady śniegu',
    75: 'Silne opady śniegu',
    77: 'Ziarna lodowe',
    80: 'Słabe przelotne opady deszczu',
    81: 'Umiarkowane przelotne opady deszczu',
    82: 'Gwałtowne przelotne opady deszczu',
    85: 'Słabe przelotne opady śniegu',
    86: 'Silne przelotne opady śniegu',
    95: 'Burza (słaba lub umiarkowana)',
    96: 'Burza z gradem (lekka)',
    99: 'Burza z gradem (silna)',
  };
  return codes[code] || 'Nieznane warunki pogodowe';
}

// Helper to fetch with a strict timeout
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// Helper to parse errors consistently
function handleFetchError(err: any, context: string): { error: string } {
  if (err.name === 'AbortError') {
    return { error: `Timeout — serwer ${context} nie odpowiedział w 5 sekund. Spróbuj ponownie.` };
  }
  return { error: `Błąd połączenia z ${context}: ${err.message}` };
}

export const calculator = tool({
  description: 'Oblicza wyrażenia matematyczne. Używaj do dokładnych obliczeń liczbowych.',
  parameters: z.object({
    expression: z.string().describe('Wyrażenie matematyczne do obliczenia, np. "15 * 247" lub "5000 / 4.28"'),
  }),
  execute: async ({ expression }: { expression: string }) => {
    if (!expression || typeof expression !== 'string') {
      return { error: 'Nie mogę obliczyć: puste wyrażenie' };
    }
    
    // Safety filter: reject dangerous JS keywords to avoid arbitrary code execution
    const banned = ['import', 'require', 'eval', 'process', 'fetch', 'window', 'document', 'global', 'Function', 'constructor', 'prototype', 'fs', 'path'];
    if (banned.some(word => expression.includes(word))) {
      return { error: 'Wyrażenie zawiera niedozwolone znaki' };
    }
    
    try {
      // Clean expression to only allow math-related characters: numbers, operators, parentheses, spaces, dots, math functions
      const cleanExpr = expression.replace(/[^0-9+\-*/().\s]/g, '');
      if (!cleanExpr.trim()) {
        return { error: `Nie mogę obliczyć: ${expression}` };
      }
      
      const result = new Function(`return (${cleanExpr})`)();
      if (result === undefined || result === null || Number.isNaN(result)) {
        return { error: `Nie mogę obliczyć: ${expression}` };
      }
      return { expression, result };
    } catch (err: any) {
      return { error: `Nie mogę obliczyć: ${expression}. Szczegóły: ${err.message}` };
    }
  },
} as any);

export const currentDateTime = tool({
  description: 'Zwraca aktualną datę i czas w Polsce.',
  parameters: z.object({}),
  execute: async () => {
    const now = new Date();
    return {
      dateTime: now.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }),
      dayOfWeek: now.toLocaleString('pl-PL', { weekday: 'long', timeZone: 'Europe/Warsaw' }),
      timestamp: now.getTime(),
    };
  },
} as any);

export const getWeather = tool({
  description: 'Sprawdza aktualną pogodę w podanym mieście (w tym temperaturę, wiatr i wilgotność).',
  parameters: z.object({
    city: z.string().optional().describe('Nazwa miasta, np. "Warszawa", "Kraków", "Londyn"'),
    location: z.string().optional().describe('Nazwa lokalizacji / miasta, np. "Gdynia"'),
  }),
  execute: async ({ city, location }: { city?: string; location?: string }) => {
    const rawCity = city || location || '';
    if (!rawCity || !rawCity.trim()) {
      return { error: 'Podaj nazwę miasta' };
    }
    
    const cityName = rawCity.trim();

    try {
      // 1. Geocoding lookup
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=pl`;
      const geoRes = await fetchWithTimeout(geoUrl);
      
      if (!geoRes.ok) {
        return { error: `API geokodowania zwróciło błąd ${geoRes.status}. Spróbuj ponownie.` };
      }
      
      const geoData = await geoRes.json();
      if (!geoData.results || geoData.results.length === 0) {
        return { error: `Nie znalazłem miasta "${cityName}". Sprawdź pisownię.` };
      }

      const { latitude, longitude, name, country } = geoData.results[0];

      // 2. Weather lookup
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`;
      const weatherRes = await fetchWithTimeout(weatherUrl);
      
      if (!weatherRes.ok) {
        return { error: `API pogodowe zwróciło błąd ${weatherRes.status}. Spróbuj ponownie.` };
      }
      
      const weatherData = await weatherRes.json();
      const current = weatherData.current;

      return {
        city: name,
        country,
        temperature: current.temperature_2m,
        humidity: current.relative_humidity_2m,
        windSpeed: current.wind_speed_10m,
        description: getWeatherDescription(current.weather_code),
      };
    } catch (err: any) {
      return handleFetchError(err, 'pogody (Open-Meteo)');
    }
  },
} as any);

export const getExchangeRate = tool({
  description: 'Sprawdza kurs średni wybranej waluty do PLN z Narodowego Banku Polskiego (NBP).',
  parameters: z.object({
    currency: z.string().describe('Kod waluty (3 litery, np. "EUR", "USD", "GBP", "CHF")'),
  }),
  execute: async ({ currency }: { currency: string }) => {
    const code = currency.trim().toUpperCase();
    if (code.length !== 3) {
      return { error: 'Podaj 3-literowy kod waluty (np. EUR, USD)' };
    }

    try {
      const url = `https://api.nbp.pl/api/exchangerates/rates/a/${code}/?format=json`;
      const res = await fetchWithTimeout(url);
      
      if (res.status === 404) {
        return { error: `Waluta "${currency}" nie jest w tabeli NBP. Popularne: EUR, USD, GBP, CHF` };
      }
      if (!res.ok) {
        return { error: `API NBP zwróciło błąd ${res.status}. Spróbuj ponownie.` };
      }
      
      const data = await res.json();
      const rate = data.rates?.[0]?.mid;
      const date = data.rates?.[0]?.effectiveDate;

      return {
        currency: code,
        rate,
        date,
        source: 'NBP',
      };
    } catch (err: any) {
      return handleFetchError(err, 'kursów walut (NBP)');
    }
  },
} as any);

export const getHolidays = tool({
  description: 'Sprawdza święta państwowe w danym kraju dla podanego roku.',
  parameters: z.object({
    countryCode: z.string().describe('Kod kraju (dwuliterowy, np. "PL", "DE", "FR", "US")'),
    year: z.number().describe('Rok, dla którego chcesz sprawdzić święta, np. 2026'),
  }),
  execute: async ({ countryCode, year }: { countryCode: string; year: number }) => {
    const code = countryCode.trim().toUpperCase();
    if (code.length !== 2) {
      return { error: 'Podaj 2-literowy kod kraju (np. PL, DE, US)' };
    }

    try {
      const url = `https://date.nager.at/api/v3/publicholidays/${year}/${code}`;
      const res = await fetchWithTimeout(url);
      
      if (!res.ok) {
        return { error: `Nie znalazłem świąt dla kraju "${countryCode}" i roku ${year}. Popularne: PL, DE, US, GB, FR` };
      }
      
      const data = await res.json();
      if (!Array.isArray(data)) {
        return { holidays: [] };
      }

      // Format & slice to max 15 holidays
      const holidays = data.map((h: any) => ({
        date: h.date,
        localName: h.localName,
        name: h.name,
      })).slice(0, 15);

      return { country: code, year, holidays };
    } catch (err: any) {
      return handleFetchError(err, 'świąt (Nager.Date)');
    }
  },
} as any);

export const searchWikipedia = tool({
  description: 'Wyszukuje artykuł w polskiej Wikipedii i zwraca streszczenie.',
  parameters: z.object({
    query: z.string().describe('Hasło do wyszukania w Wikipedii, np. "Sztuczna inteligencja"'),
  }),
  execute: async ({ query }: { query: string }) => {
    if (!query || !query.trim()) {
      return { error: 'Hasło do wyszukania nie może być puste.' };
    }
    
    const queryStr = query.trim();

    try {
      // 1. Try Rest API Summary
      const summaryUrl = `https://pl.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(queryStr)}`;
      const res = await fetchWithTimeout(summaryUrl);
      
      if (res.status === 200) {
        const data = await res.json();
        return {
          title: data.title,
          summary: data.extract ? data.extract.slice(0, 1000) : 'Brak streszczenia.',
          url: data.content_urls?.desktop?.page || '',
        };
      }
      
      // 2. Fallback: Query search list
      const searchUrl = `https://pl.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(queryStr)}&format=json&origin=*`;
      const searchRes = await fetchWithTimeout(searchUrl);
      if (!searchRes.ok) {
        return { error: `API Wikipedii zwróciło błąd ${searchRes.status}. Spróbuj ponownie.` };
      }
      const searchData = await searchRes.json();
      const results = searchData.query?.search;
      if (!results || results.length === 0) {
        return { error: `Nie znalazłem artykułu w Wikipedii dla hasła "${queryStr}"` };
      }

      // Fetch the first match page summary
      const bestMatchTitle = results[0].title;
      const fallbackUrl = `https://pl.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestMatchTitle)}`;
      const fallbackRes = await fetchWithTimeout(fallbackUrl);
      
      if (fallbackRes.status === 200) {
        const data = await fallbackRes.json();
        return {
          title: data.title,
          summary: data.extract ? data.extract.slice(0, 1000) : 'Brak streszczenia.',
          url: data.content_urls?.desktop?.page || '',
        };
      }

      return {
        title: bestMatchTitle,
        summary: results[0].snippet.replace(/<[^>]*>/g, '') + '...',
        url: `https://pl.wikipedia.org/wiki/${encodeURIComponent(bestMatchTitle)}`,
      };
    } catch (err: any) {
      return handleFetchError(err, 'Wikipedii');
    }
  },
} as any);

export const saveNote = tool({
  description: 'Zapisuje notatkę w pamięci podręcznej agenta.',
  parameters: z.object({
    title: z.string().describe('Tytuł notatki, np. "Przepisy na obiad"'),
    content: z.string().describe('Treść notatki do zapisania'),
  }),
  execute: async ({ title, content }: { title: string; content: string }) => {
    const newNote = {
      title: title.trim(),
      content: content.trim(),
      createdAt: new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }),
    };
    globalForNotes.agentNotes.push(newNote);
    return { saved: true, title: newNote.title };
  },
} as any);

export const getNotes = tool({
  description: 'Pobiera wszystkie zapisane notatki z pamięci agenta.',
  parameters: z.object({}),
  execute: async () => {
    return { notes: globalForNotes.agentNotes };
  },
} as any);

// Centralized webpage reading tool with timeout and error handling
export const readWebPage = tool({
  description: 'Pobiera i czyta zawartość strony internetowej. Używaj gdy użytkownik poda URL lub gdy chcesz przeczytać artykuł/stronę znalezioną w wyszukiwarce.',
  parameters: z.object({
    url: z.string().describe('Pełny adres URL strony do przeczytania'),
  }),
  execute: async ({ url }: { url: string }) => {
    let cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'https://' + cleanUrl;
    }
    
    try {
      const response = await fetchWithTimeout(cleanUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      }, 5000); // 5s timeout
      
      if (!response.ok) {
        return { error: `API zwróciło błąd ${response.status}. Sprawdź parametry.` };
      }
      
      const html = await response.text();
      let text = html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[\s\S]*?>[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[\s\S]*?>[\s\S]*?<\/header>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return text.length > 4000 ? text.slice(0, 4000) + '... [Treść skrócona]' : text || 'Brak treści';
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { error: 'Timeout — serwer nie odpowiedział w 5 sekund. Spróbuj ponownie.' };
      }
      return { error: `Błąd połączenia: ${err.message}` };
    }
  },
} as any);

// Helper to generate embedding using text-embedding-004 or fallback to gemini-embedding-2
async function generateQueryEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
  if (!apiKey) {
    throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not configured');
  }

  // Try text-embedding-004
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.embedding && data.embedding.values) {
        return data.embedding.values;
      }
    }
  } catch (e) {
    console.warn('searchKnowledge: Direct text-embedding-004 call failed, trying fallback...', e);
  }

  // Fallback to gemini-embedding-2 with 768 output dimensionality
  const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${apiKey}`;
  const fallbackResponse = await fetch(fallbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-2',
      content: { parts: [{ text }] },
      outputDimensionality: 768,
    }),
  });

  if (!fallbackResponse.ok) {
    const errText = await fallbackResponse.text();
    throw new Error(`Embedding fallback failed: ${fallbackResponse.status} ${errText}`);
  }

  const data = await fallbackResponse.json();
  if (data.embedding && data.embedding.values) {
    return data.embedding.values;
  }

  throw new Error('Invalid response structure from fallback embedding API');
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function executeSearchKnowledge(query: string, supabaseClient: any = supabase, userId?: string | null) {
  try {
    if (!query || !query.trim()) {
      return { results: [], total_found: 0, message: 'Zapytanie nie może być puste.' };
    }

    // 1. Generate embedding for query
    const embedding = await generateQueryEmbedding(query.trim());

    // 2. Query match_documents from Supabase RPC first
    try {
      const { data, error } = await supabaseClient.rpc('match_documents', {
        query_embedding: embedding,
        match_threshold: 0.5,
        match_count: 5,
      });

      if (!error && data && data.length > 0) {
        // Post-filter by user_id if userId is specified (extra security if RLS is not configured)
        const filteredData = userId ? data.filter((d: any) => d.user_id === userId) : data;

        const results = filteredData.map((doc: any) => {
          const metadata = doc.metadata || doc.metdata || {};
          return {
            title: doc.title,
            content: doc.content,
            similarity: doc.similarity,
            metadata,
            added_at: doc.created_at ? doc.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
          };
        });
        return {
          results,
          total_found: results.length,
          source_documents: Array.from(new Set(results.map((doc: any) => doc.title).filter(Boolean))),
        };
      }

      if (error) {
        console.warn(`Supabase RPC match_documents failed: ${error.message}. Trying in-memory fallback.`);
      }
    } catch (rpcErr: any) {
      console.warn(`RPC call failed: ${rpcErr.message}. Trying in-memory fallback.`);
    }

    // 3. In-memory fallback (client-side cosine similarity)
    console.log('Running client-side in-memory cosine similarity fallback...');
    let queryBuilder = supabaseClient
      .from('documents')
      .select('id, title, content, embedding, created_at, metdata, user_id');

    if (userId) {
      queryBuilder = queryBuilder.eq('user_id', userId);
    }

    const { data: allDocs, error: fetchErr } = await queryBuilder;

    if (fetchErr) {
      throw new Error(`Supabase fetch fallback failed: ${fetchErr.message}`);
    }

    if (!allDocs || allDocs.length === 0) {
      return {
        results: [],
        total_found: 0,
        source_documents: [],
        message: 'Nie znaleziono informacji w bazie wiedzy (baza jest pusta).',
      };
    }

    const scoredDocs = allDocs
      .map((doc: any) => {
        let docEmbedding: number[] = [];
        if (Array.isArray(doc.embedding)) {
          docEmbedding = doc.embedding;
        } else if (typeof doc.embedding === 'string') {
          docEmbedding = doc.embedding
            .replace(/[\[\]]/g, '')
            .split(',')
            .map(Number);
        }

        if (docEmbedding.length !== embedding.length) {
          return { ...doc, similarity: 0 };
        }

        const similarity = cosineSimilarity(docEmbedding, embedding);
        const metadata = doc.metdata || {};
        const added_at = doc.created_at ? doc.created_at.slice(0, 10) : '';

        return {
          title: doc.title,
          content: doc.content,
          similarity,
          metadata,
          added_at,
        };
      })
      .filter((doc: any) => doc.similarity >= 0.5)
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, 5);

    return {
      results: scoredDocs,
      total_found: scoredDocs.length,
      source_documents: Array.from(new Set(scoredDocs.map((doc: any) => doc.title).filter(Boolean))),
    };
  } catch (err: any) {
    console.error('searchKnowledge error:', err);
    return {
      error: `Wyszukiwanie w bazie wiedzy nie powiodło się: ${err.message || err}`,
    };
  }
}

export const searchKnowledge = tool({
  description: 'Wyszukuje informacje w bazie wiedzy firmy (cenniki, FAQ, regulaminy, oferty). Używaj ZAWSZE gdy użytkownik pyta o ceny, pakiety, koszty, procedury, regulaminy, warunki, FAQ lub pytania o firmę/usługi.',
  parameters: z.object({
    query: z.string().describe('Pytanie lub słowa kluczowe do wyszukania w bazie wiedzy (np. "pakiet Premium cena")'),
  }),
  execute: async ({ query }: { query: string }) => {
    return executeSearchKnowledge(query);
  },
} as any);

