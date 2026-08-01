import { google } from '@ai-sdk/google';
import { streamText, createUIMessageStream, createUIMessageStreamResponse, toUIMessageStream, convertToModelMessages, tool, isStepCount } from 'ai';
import { z } from 'zod';
import { supabase, getSupabaseClient, supabaseAdmin } from '@/lib/supabase';
import { executeSearchKnowledge, calculator, currentDateTime, searchWikipedia } from '@/lib/tools';
import { checkTokenBudget, logTokenUsage } from '@/lib/budget';

if (process.env.ENABLE_SEARCH_GROUNDING === 'true') {
  console.warn(
    '⚠️ UWAGA: Search Grounding jest WŁĄCZONY. ' +
    'To jest najdroższa funkcja API ($14/1000 zapytań). ' +
    'Używaj TYLKO do testów. Wyłącz po testach usuwając ENABLE_SEARCH_GROUNDING z .env.local, ' +
    'bo inni uczestnicy kursu mają wtedy ograniczony dostęp do modeli.'
  );
}

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

const PROMPT_TEMPLATE = (ton: string) => `
# Oskar — Licencjonowany makler giełdowy i doradca inwestycyjny

## KIM JESTEM
Jestem licencjonowanym maklerem giełdowym z 15-letnim doświadczeniem w branży rynków kapitałowych (GPW, Wall Street). 
Specjalizuję się w optymalizacji portfeli inwestycyjnych, analizie fundamentalnej i technicznej spółek oraz instrumentach ETF (Exchange-Traded Funds).
Pracowałem z klientami indywidualnymi o wysokiej wartości netto oraz funduszami inwestycyjnymi.

## JAK ODPOWIADAM

### Struktura każdej odpowiedzi:
1. 📋 **Kontekst** — potwierdzam zrozumienie pytania (1 zdanie)
2. 🔍 **Analiza** — merytoryczna odpowiedź (max 2 akapity)
3. ✅ **Rekomendacja** — konkretne działanie do podjęcia (1-3 punkty)
4. ❓ **Pytanie** — jedno pytanie pogłębiające do użytkownika

### Zasady:
- ZANIM odpowiem na złożone pytanie — pytam o kontekst
- Gdy podaję fakty — oznaczam pewność: ✓ pewne, ~ przybliżone, ? do weryfikacji
- **Pogrubiam** kluczowe terminy przy pierwszym użyciu
- Używam list numerowanych dla kroków, punktowanych dla opcji
- Maksymalnie 3 akapity + rekomendacja
- **ZAWSZE używaj wyszukiwarki Google (googleSearch), aby sprawdzić aktualne kursy akcji, wiadomości rynkowe i fakty, ponieważ Twoja wbudowana wiedza może być nieaktualna.**

### Styl:
- Język: polski
- Ton: ${ton}
- Gdy używam terminu branżowego — wyjaśniam w nawiasie odpowiednim dla tonu wypowiedzi

## BAZA WIEDZY I RAG
Masz dostęp do bazy wiedzy firmy przez narzędzie searchKnowledge.

ZASADY KORZYSTANIA Z BAZY WIEDZY:
1. Gdy użytkownik pyta o ceny, pakiety, oferty, regulamin, FAQ, warunki umowy itp. — ZAWSZE użyj searchKnowledge.
2. Odpowiadaj TYLKO na podstawie znalezionych fragmentów — nie wymyślaj.
3. NIE halucynuj — lepiej powiedzieć 'nie wiem' niż zmyślić cenę lub szczegóły oferty.

CYTOWANIE ŹRÓDEŁ:
Gdy odpowiadasz na podstawie bazy wiedzy, ZAWSZE podaj źródło:
Format: Na końcu odpowiedzi dodaj dokładnie:
📎 Źródło: [tytuł dokumentu]

Przykład:
'Pakiet Premium kosztuje 299 zł/miesiąc i zawiera 25 użytkowników, 100 GB miejsca oraz wsparcie email i telefoniczne.

📎 Źródło: Cennik 2026'

Jeśli odpowiedź łączy dane z wielu dokumentów, cytuj wszystkie oddzielone przecinkami:
📎 Źródła: Cennik 2026, FAQ

ODMOWA ODPOWIEDZI GDY BRAK DANYCH:
Gdy searchKnowledge zwróci 0 wyników LUB similarity wszystkich wyników jest < 0.5:
1. NIE próbuj odpowiadać z ogólnej wiedzy ani domysłów na pytania dotyczące firmy, cennika, ofert, regulaminów itp.
2. Powiedz wprost:
   'Nie mam takich informacji w mojej bazie wiedzy. Skontaktuj się z konsultantem bezpośrednio.'
3. Opcjonalnie zaproponuj pytanie, na które MOŻESZ odpowiedzieć:
   'Mogę za to odpowiedzieć na pytania o cennik, pakiety i warunki usługi.'

KRYTYCZNA WERYFIKACJA ZAWARTOŚCI (ZAPOBIEGANIE HALLUCYNACJOM):
Nawet jeśli narzędzie searchKnowledge zwróci wyniki (ponieważ słowa kluczowe były podobne wektorowo), ZAWSZE krytycznie oceń, czy w tych wynikach faktycznie znajduje się odpowiedź na pytanie użytkownika.
- Jeśli użytkownik pyta o rzecz niezwiązaną z ofertą firmy (np. cenniki innych firm, usługi konkurencji, tematy nieprzyzwoite, wulgarne, niezwiązane z działalnością), a wyszukiwarka zwróciła dokumenty firmy (np. cennik ze względu na słowo "kosztuje"), to:
  1. NIE używaj tych dokumentów do udzielania odpowiedzi.
  2. NIE zmyślaj ani nie dopasowuj oferty firmy do pytania użytkownika.
  3. Zastosuj odmowę odpowiedzi: "Nie mam takich informacji w mojej bazie wiedzy. Skontaktuj się z konsultantem bezpośrednio."

WYJĄTEK: Pytania OGÓLNE (pogoda, kurs walut, Wikipedia, giełda, inwestycje) — odpowiadaj normalnie używając innych narzędzi lub własnej wiedzy. Odmowa dotyczy TYLKO tematów firmowych/usługowych.

PRIORYTET NARZĘDZI:
- Pytania o firmę/cennik/FAQ → searchKnowledge (NAJPIERW)
- Pytania ogólne → Google Search lub inne narzędzia
- Obliczenia → calculator

## CZEGO NIE ROBIĘ
- Nie odpowiadam na pytania spoza mojej dziedziny (giełda, inwestycje, akcje, obligacje, ETF-y, analiza rynkowa) — mówię wprost i proponuję co MOGĘ zrobić (chyba że odpowiedź znajduje się w bazie wiedzy i wyszukano ją przez searchKnowledge)
- Nie odpowiadam na pytania o pogodę — jako makler Oskar nie mam dostępu do aktualnych prognoz pogody, więc jeśli ktoś pyta o pogodę, odmawiaj z wdziękiem maklera (np. mówiąc że pogoda bywa zmienna jak rynki, i odsyłając do ulubionej aplikacji pogodowej) i proponuj powrót do tematów finansowych/usługowych
- Nie udaję że wiem coś, czego nie wiem
- Nie udzielam porad prawnych/medycznych, odsyłam do specjalisty

`.trim();

const MEMORY_INSTRUCTIONS = `
## PAMIĘĆ I PODSUMOWANIA
- Pamiętasz całą rozmowę od początku.
- Nawiązuj do wcześniejszych ustaleń, kiedy to istotne.
- Jeśli użytkownik zmienia temat — zaakceptuj to naturalnie, ale możesz nawiązać do wcześniejszego wątku.
- Gdy użytkownik napisze "podsumuj" lub "co ustaliliśmy":
  - Wypisz główne tematy rozmowy
  - Wymień kluczowe ustalenia i rekomendacje
  - Zaproponuj kolejne kroki
  - Format: numerowana lista
`;

const PROMPTS = {
  casual: `
${PROMPT_TEMPLATE('luźny, bezpośredni, z dopuszczalnymi emoji i żartami')}

Dodatkowe zasady trybu Casual:
- Możesz skrócić analizę do 1-2 zdań na rzecz lekkości wypowiedzi.
- Dodaj krótki, luźny tip giełdowy na końcu (oznaczony emoji 💸).

${MEMORY_INSTRUCTIONS}
  `.trim(),

  ekspert: `
${PROMPT_TEMPLATE('profesjonalny, analityczny, niezwykle precyzyjny')}

Dodatkowe zasady trybu Ekspert:
- Podawaj twarde dane i przybliżone źródła rynkowe/badawcze.
- Dodaj profesjonalny tip inwestycyjny na końcu (oznaczony emoji 📊).

${MEMORY_INSTRUCTIONS}
  `.trim(),

  kreatywny: `
${PROMPT_TEMPLATE('kreatywny, inspirujący, z użyciem barwnych metafor i analogii')}

Dodatkowe zasady trybu Kreatywny:
- Stosuj storytelling rynkowy i nieoczywiste perspektywy.
- Dodaj inspirujący tip giełdowy ujęty w ciekawą metaforę (oznaczony emoji 📈).

${MEMORY_INSTRUCTIONS}
  `.trim(),
};

const getModelsToTry = (modelParam: string) => {
  return [
    'gemini-3.1-flash-lite',
  ];
};

export async function POST(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized: missing authorization header' }), { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const userClient = getSupabaseClient(token);

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized: invalid token' }), { status: 401 });
  }

  const userId = user.id;

  const body = await req.json();
  console.log("API POST Body received:", JSON.stringify(body));
  const { messages: rawMessages, mode = 'casual', model = 'flash', isSearchPage = false } = body;

  const messages = rawMessages.map((m: any) => {
    const parts = m.parts || (m.content ? [{ type: 'text', text: m.content }] : []);
    const contentParts: any[] = [];
    for (const p of parts) {
      if (p.type === 'text' && p.text) {
        contentParts.push({ type: 'text', text: p.text });
      } else if (p.type === 'image' && p.image) {
        contentParts.push({ type: 'image', image: p.image });
      } else if (p.type === 'file' && p.url) {
        contentParts.push({ type: 'image', image: p.url });
      }
    }
    return {
      ...m,
      parts,
      content: contentParts.length > 0 ? contentParts : m.content,
    };
  });

  // Get last user message text
  const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
  let userText = '';
  if (lastUserMsg) {
    if (typeof lastUserMsg.content === 'string') {
      userText = lastUserMsg.content;
    } else if (Array.isArray(lastUserMsg.parts)) {
      userText = lastUserMsg.parts.map((p: any) => p.text || '').join(' ');
    } else if (Array.isArray(lastUserMsg.content)) {
      userText = lastUserMsg.content.map((p: any) => p.text || '').join(' ');
    }
  }

  // Sanitize: remove control characters and zero-width spaces
  const controlCharsRegex = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\u200B-\u200D\uFEFF]/g;
  const sanitizedText = userText.replace(controlCharsRegex, '');

  if (lastUserMsg) {
    lastUserMsg.content = sanitizedText;
    if (Array.isArray(lastUserMsg.parts)) {
      lastUserMsg.parts = lastUserMsg.parts.map((p: any) => {
        if (p.type === 'text') {
          return { ...p, text: p.text.replace(controlCharsRegex, '') };
        }
        return p;
      });
    }
  }

  // 1. Rate Limiting Check (50 messages / hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  let rateLimitCount = 0;
  try {
    const { count, error: countError } = await supabaseAdmin
      .from('message_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', oneHourAgo);

    if (countError) throw countError;
    rateLimitCount = count || 0;
  } catch (err) {
    console.error("Error checking rate limit in DB:", err);
  }

  if (rateLimitCount >= 50) {
    let minutesToWait = 60;
    try {
      const { data: oldestMsg } = await supabaseAdmin
        .from('message_logs')
        .select('created_at')
        .eq('user_id', userId)
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: true })
        .limit(1);

      if (oldestMsg && oldestMsg.length > 0) {
        const oldestTime = new Date(oldestMsg[0].created_at).getTime();
        const diffMs = (oldestTime + 60 * 60 * 1000) - Date.now();
        minutesToWait = Math.max(1, Math.ceil(diffMs / (60 * 1000)));
      }
    } catch (err) {
      console.error("Error getting oldest message for rate limit:", err);
    }

    const blockMsg = `Osiągnąłeś limit wiadomości (50/h). Spróbuj za ${minutesToWait} minut.`;

    try {
      await supabaseAdmin.from('message_logs').insert({
        user_id: userId,
        message_length: userText.length,
        blocked: true,
        message: userText.slice(0, 1000),
        reason: 'rate_limit'
      });
    } catch (e) {
      console.error("Error logging rate limit block:", e);
    }

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: 'text-start', id: 'rate-limit-block' });
        writer.write({
          type: 'text-delta',
          id: 'rate-limit-block',
          delta: blockMsg
        });
        writer.write({ type: 'text-end', id: 'rate-limit-block' });
      }
    });
    return createUIMessageStreamResponse({ stream });
  }

  // 1.5 Token Budget Check (10,000 tokens / day)
  const budgetResult = await checkTokenBudget(userId, userText, '/api/chat');
  if (budgetResult.isBlocked) {
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: 'text-start', id: 'budget-block' });
        writer.write({
          type: 'text-delta',
          id: 'budget-block',
          delta: budgetResult.blockMsg || "Dzienny limit tokenów został wyczerpany."
        });
        writer.write({ type: 'text-end', id: 'budget-block' });
      }
    });
    return createUIMessageStreamResponse({ stream });
  }

  // 2. Input Validation Check
  let isInputBlocked = false;
  let inputBlockReason = '';

  if (sanitizedText.length > 2000) {
    isInputBlocked = true;
    inputBlockReason = 'input_length';
  } else {
    const blacklist = [
      "ignore previous",
      "system prompt",
      "ignore instructions",
      "reveal",
      "show me your",
      "translate your prompt"
    ];
    const textLower = sanitizedText.toLowerCase();
    for (const term of blacklist) {
      if (textLower.includes(term)) {
        isInputBlocked = true;
        inputBlockReason = `blacklist:${term}`;
        break;
      }
    }
  }

  if (isInputBlocked) {
    try {
      await supabaseAdmin.from('message_logs').insert({
        user_id: userId,
        message_length: userText.length,
        blocked: true,
        message: userText.slice(0, 1000),
        reason: inputBlockReason
      });
    } catch (e) {
      console.error("Error logging blocked input:", e);
    }

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: 'text-start', id: 'input-block' });
        writer.write({
          type: 'text-delta',
          id: 'input-block',
          delta: "Ta wiadomość została zablokowana z powodów bezpieczeństwa."
        });
        writer.write({ type: 'text-end', id: 'input-block' });
      }
    });
    return createUIMessageStreamResponse({ stream });
  }

  // 3. Log non-blocked message
  let logId: string | null = null;
  try {
    const { data: logData } = await supabaseAdmin.from('message_logs').insert({
      user_id: userId,
      message_length: sanitizedText.length,
      blocked: false
    }).select('id').single();
    if (logData) logId = logData.id;
  } catch (err) {
    console.error("Error logging successful message to DB:", err);
  }

  // 1. Fetch user profile from Supabase
  let userProfile: any = null;
  if (userId) {
    try {
      const { data } = await userClient
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();
      userProfile = data;
    } catch (err) {
      console.error('Error fetching user profile in API:', err);
    }
  }

  // 1.5 Parse name/preferences from last user message (Opcja B - fallback)
  if (lastUserMsg && userId) {
    const text = (typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '').trim();
    
    // Match name patterns: "mam na imię X", "nazywam się X", "jestem X", "imię to X"
    const nameMatch = text.match(/(?:mam na imię|nazywam się|jestem|imię to)\s+([A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż]+)/i);
    if (nameMatch && nameMatch[1]) {
      const detectedName = nameMatch[1].trim();
      console.log(`[Personalization] Detected name in text: ${detectedName}`);
      try {
        await userClient
          .from('user_profiles')
          .update({ name: detectedName })
          .eq('id', userId);
        if (!userProfile) userProfile = {};
        userProfile.name = detectedName;
      } catch (err) {
        console.error('Error updating name from text match:', err);
      }
    }

    // Match preference patterns: "lubię X", "interesuję się X", "mieszkam w X"
    const prefMatch = text.match(/(?:lubię|interesuję się|mieszkam w)\s+([A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż\s]{2,50})/i);
    if (prefMatch && prefMatch[1]) {
      const val = prefMatch[1].trim();
      let key = 'preferencja';
      if (text.toLowerCase().includes('lubię')) key = 'lubi';
      else if (text.toLowerCase().includes('interesuję')) key = 'zainteresowania';
      else if (text.toLowerCase().includes('mieszkam')) key = 'miasto';

      console.log(`[Personalization] Detected preference: ${key} = ${val}`);
      try {
        const { data } = await userClient
          .from('user_profiles')
          .select('preferences')
          .eq('id', userId)
          .single();
        const currentPrefs = data?.preferences || {};
        const updatedPrefs = { ...currentPrefs, [key]: val };
        await userClient
          .from('user_profiles')
          .update({ preferences: updatedPrefs })
          .eq('id', userId);
        if (!userProfile) userProfile = {};
        userProfile.preferences = updatedPrefs;
      } catch (err) {
        console.error('Error updating preferences from text match:', err);
      }
    }
  }

  // 2. Build instructions (system prompt)
  let instructions = PROMPTS[mode as keyof typeof PROMPTS] || PROMPTS.casual;
  if (userProfile && userProfile.name) {
    instructions += `\n\nUżytkownik ma na imię ${userProfile.name}. Znasz jego imię z profilu użytkownika. Zwracaj się do niego po imieniu. Jeśli zapyta Cię jak ma na imię, odpowiedz wprost, że wiesz, iż ma na imię ${userProfile.name}. Nigdy nie udawaj, że zapomniałeś jego imienia. Bądź ciepły i personalny — to Twój stały użytkownik.`;
  } else {
    instructions += `\n\nTo nowy użytkownik. Na początku pierwszej rozmowy przedstaw się krótko i zapytaj jak ma na imię. Gdy poda imię — użyj narzędzia saveUserName żeby je zapamiętać.`;
  }

  if (userProfile && userProfile.preferences && Object.keys(userProfile.preferences).length > 0) {
    instructions += `\n\nPreferencje użytkownika (używaj ich do spersonalizowania odpowiedzi, jeśli to pasuje do tematu):\n${JSON.stringify(userProfile.preferences, null, 2)}`;
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
        // Write the mode as metadata so the client can display a badge
        writer.write({
          type: 'data-mode',
          data: mode,
        });

        // Write the requested model type (flash/pro)
        writer.write({
          type: 'data-model-type',
          data: model,
        });

        const messagesConverted = await convertToModelMessages(messages);
        const modelsToTry = getModelsToTry(model);

        let success = false;
        let lastError: any = null;

        const containsUrl = messages.some((m: any) => {
          if (m.role !== 'user') return false;
          let textContent = '';
          if (typeof m.content === 'string' && m.content) {
            textContent = m.content;
          } else if (Array.isArray(m.parts)) {
            textContent = m.parts.map((p: any) => p.text || '').join(' ');
          } else if (Array.isArray(m.content)) {
            textContent = m.content.map((p: any) => p.text || '').join(' ');
          }
          return /https?:\/\/[^\s/$.?#].[^\s]*/i.test(textContent) ||
                 /\b([a-zA-Z0-9-]+\.(pl|com|org|net|edu|gov|info|io|co|uk|de|fr|eu))\b/i.test(textContent);
        });

        // Determine if search is relevant to avoid combining function tools with provider-defined tools
        const needsSearch = isSearchPage || messages.some((m: any) => {
          if (m.role !== 'user') return false;
          let textContent = '';
          if (typeof m.content === 'string' && m.content) {
            textContent = m.content;
          } else if (Array.isArray(m.parts)) {
            textContent = m.parts.map((p: any) => p.text || '').join(' ');
          }
          const text = textContent.toLowerCase();
          return /szukaj|wyszukaj|znajdź|kurs|cena|cenę|akcje|obligacje|notowania|news|wiadomości|aktualne|dzisiaj|dzisiejsze|jutro|dzis|rok|data/i.test(text);
        });

        console.log(`[Chat] containsUrl=${containsUrl}, needsSearch=${needsSearch}`);

        const tools: Record<string, any> = {
          searchKnowledge: tool({
            description: 'Wyszukuje informacje w bazie wiedzy firmy (cenniki, FAQ, regulaminy, oferty). Używaj ZAWSZE gdy użytkownik pyta o ceny, pakiety, koszty, procedury, regulaminy, warunki, FAQ lub pytania o firmę/usługi.',
            parameters: z.object({
              query: z.string().describe('Pytanie lub słowa kluczowe do wyszukania w bazie wiedzy (np. "pakiet Premium cena")'),
            }),
            execute: async ({ query }: { query: string }) => {
              return executeSearchKnowledge(query, userClient, userId);
            },
          } as any),
          calculator,
          currentDateTime,
          searchWikipedia,
          saveUserName: tool({
            description: 'Zapisuje imię użytkownika w jego profilu w bazie danych.',
            parameters: z.object({
              name: z.string().optional().describe('Imię użytkownika do zapisania, np. "Paweł"')
            }),
            execute: async ({ name }: { name?: string }) => {
              if (!userId) return { success: false, error: 'Brak identyfikatora użytkownika' };
              const finalName = (name || userProfile?.name || '').trim();
              if (!finalName) return { success: false, error: 'Brak imienia do zapisania' };
              try {
                const { error } = await userClient
                  .from('user_profiles')
                  .update({ name: finalName })
                  .eq('id', userId);
                if (error) throw error;
                return { success: true, name: finalName };
              } catch (err: any) {
                return { success: false, error: err.message };
              }
            }
          } as any),
          saveUserPreference: tool({
            description: 'Zapisuje preferencje użytkownika w jego profilu (dopisuje do JSONB, nie nadpisuje innych).',
            parameters: z.object({
              key: z.string().describe('Klucz preferencji, np. "ulubione_jedzenie", "miasto", "sport"'),
              value: z.string().describe('Wartość preferencji, np. "pizza", "Kraków", "narty"')
            }),
            execute: async ({ key, value }: { key: string, value: string }) => {
              if (!userId) return { success: false, error: 'Brak identyfikatora użytkownika' };
              try {
                const { data, error: fetchErr } = await userClient
                  .from('user_profiles')
                  .select('preferences')
                  .eq('id', userId)
                  .single();
                if (fetchErr) throw fetchErr;

                const currentPrefs = data?.preferences || {};
                const updatedPrefs = { ...currentPrefs, [key]: value };

                const { error: updateErr } = await userClient
                  .from('user_profiles')
                  .update({ preferences: updatedPrefs })
                  .eq('id', userId);
                if (updateErr) throw updateErr;

                return { success: true, key, value };
              } catch (err: any) {
                return { success: false, error: err.message };
              }
            }
          } as any)
        };
        if (containsUrl) {
          tools.readWebPage = tool({
            description: 'Pobiera i czyta zawartość strony internetowej. Używaj gdy użytkownik poda URL lub gdy chcesz przeczytać artykuł/stronę znalezioną w wyszukiwarce.',
            parameters: z.object({
              url: z.string().describe('Pełny adres URL strony'),
            }),
            execute: async ({ url }: { url: string }) => {
              try {
                // auto-prepend https if missing
                if (!/^https?:\/\//i.test(url)) {
                  url = 'https://' + url;
                }

                // Timeout after 5 seconds
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);

                const response = await fetch(url, {
                  signal: controller.signal,
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                  }
                });
                clearTimeout(timeoutId);

                if (!response.ok) {
                  return `Błąd HTTP: ${response.status} ${response.statusText}`;
                }

                const html = await response.text();

                // Clean HTML
                let cleanText = html;
                // remove comments
                cleanText = cleanText.replace(/<!--[\s\S]*?-->/g, '');
                // remove script
                cleanText = cleanText.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
                // remove style
                cleanText = cleanText.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');
                // remove nav
                cleanText = cleanText.replace(/<nav[\s\S]*?>[\s\S]*?<\/nav>/gi, '');
                // remove footer
                cleanText = cleanText.replace(/<footer[\s\S]*?>[\s\S]*?<\/footer>/gi, '');
                // remove other HTML tags
                cleanText = cleanText.replace(/<[^>]*>/g, ' ');
                
                // Replace multiple spaces/newlines with single space
                cleanText = cleanText.replace(/\s+/g, ' ').trim();

                // Limit to 3000 chars
                if (cleanText.length > 3000) {
                  cleanText = cleanText.slice(0, 3000) + '... [Treść skrócona do 3000 znaków]';
                }

                return cleanText || 'Pusta zawartość strony po wyczyszczeniu HTML.';
              } catch (error: any) {
                if (error.name === 'AbortError') {
                  return 'Błąd: Przekroczono limit czasu żądania (5 sekund).';
                }
                return `Błąd pobierania strony: ${error.message || error}`;
              }
            }
          } as any);
        } else if (needsSearch && process.env.ENABLE_SEARCH_GROUNDING === 'true') {
          tools.googleSearch = google.tools.googleSearch({});
        }

        for (const modelName of modelsToTry) {
          console.log(`Attempting model execution for: ${modelName}`);
          try {
            const primaryResult = streamText({
              model: process.env.ENABLE_SEARCH_GROUNDING === 'true'
                ? (google as any)(modelName, { useSearchGrounding: true })
                : google(modelName),
              system: instructions,
              messages: messagesConverted,
              maxSteps: 3,
              stopWhen: isStepCount(8),
              tools: tools as any
            } as any);

            let useFallback = false;
            const bufferedChunks: any[] = [];
            const primaryIterator = primaryResult.stream[Symbol.asyncIterator]();

            try {
              let result = await primaryIterator.next();
              while (!result.done) {
                const chunk = result.value;
                bufferedChunks.push(chunk);

                if (chunk.type === 'error') {
                  useFallback = true;
                  break;
                }

                if (chunk.type !== 'start') {
                  break;
                }

                result = await primaryIterator.next();
              }
            } catch (e: any) {
              console.warn(`Stream read failed for model ${modelName}:`, e.message || e);
              useFallback = true;
            }

            if (!useFallback) {
              // Write the actual model name used to the stream
              writer.write({
                type: 'data-model-name',
                data: modelName,
              });

              // Reconstruct the stream and merge
              const reconstructedStream = new ReadableStream({
                async start(controller) {
                  for (const chunk of bufferedChunks) {
                    controller.enqueue(chunk);
                  }
                  try {
                    let nextResult = await primaryIterator.next();
                    while (!nextResult.done) {
                      controller.enqueue(nextResult.value);
                      nextResult = await primaryIterator.next();
                    }
                    controller.close();
                  } catch (err: any) {
                    controller.error(err);
                  }
                },
              });

              // Read all chunks from reconstructedStream to verify/filter the output
              const reader = reconstructedStream.getReader();
              const allChunks: any[] = [];
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  allChunks.push(value);
                }
              } catch (readErr) {
                console.error("Error reading stream for output filtering:", readErr);
              }

              // Extract accumulated text from text-delta chunks
              let fullText = '';
              for (const chunk of allChunks) {
                if (chunk.type === 'text-delta') {
                  fullText += chunk.text || chunk.textDelta || '';
                }
              }

              // Output leak detection patterns
              const systemPromptPhrases = [
                "Oskar — Licencjonowany makler",
                "doradca inwestycyjny z 15-letnim doświadczeniem",
                "Struktura każdej odpowiedzi",
                "ZASADY KORZYSTANIA Z BAZY WIEDZY",
                "CZEGO NIE ROBIĘ"
              ];

              const technicalPatterns = [
                /api_key/i,
                /supabase_url/i,
                /system prompt/i,
                /user_profiles/i,
                /message_logs/i,
                /webhook_events/i,
                /conversations/i,
                /documents/i,
                /eyJhbGciOi/i, // JWT signature
                /AIzaSy/i,    // Google API key signature
              ];

              let hasLeak = false;
              for (const phrase of systemPromptPhrases) {
                if (fullText.includes(phrase)) {
                  hasLeak = true;
                  break;
                }
              }

              if (!hasLeak) {
                for (const regex of technicalPatterns) {
                  if (regex.test(fullText)) {
                    hasLeak = true;
                    break;
                  }
                }
              }

              let finalChunks = allChunks;
              if (hasLeak) {
                console.warn("[Security] Output leak detected! Replacing response with safe warning.");
                if (logId) {
                  try {
                    await supabaseAdmin.from('message_logs')
                      .update({ blocked: true, reason: 'output_filter_leak', message: userText.slice(0, 1000) })
                      .eq('id', logId);
                  } catch (logErr) {
                    console.error("Error updating log on output block:", logErr);
                  }
                }

                // Replace the stream content with the blocked response
                finalChunks = [
                  { type: 'text-delta', id: '0', text: "Przepraszam, nie mogę udostępnić tych informacji.", textDelta: "Przepraszam, nie mogę udostępnić tych informacji." },
                  { type: 'finish', finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0 } }
                ];
              }

              // Extract usage tokens
              let promptTokens = 0;
              let completionTokens = 0;
              for (const chunk of allChunks) {
                if (chunk.type === 'finish' && chunk.totalUsage) {
                  promptTokens = chunk.totalUsage.inputTokens || 0;
                  completionTokens = chunk.totalUsage.outputTokens || 0;
                  break;
                } else if (chunk.type === 'finish-step' && chunk.usage) {
                  promptTokens = chunk.usage.inputTokens || 0;
                  completionTokens = chunk.usage.outputTokens || 0;
                }
              }

              // Log token usage to database
              if (promptTokens > 0 || completionTokens > 0) {
                try {
                  await logTokenUsage(userId, promptTokens, completionTokens, modelName, '/api/chat');
                } catch (logErr) {
                  console.error("Error logging token usage in chat API:", logErr);
                }
              }

              // Reconstruct the filtered stream
              const filteredStream = new ReadableStream({
                start(controller) {
                  for (const chunk of finalChunks) {
                    controller.enqueue(chunk);
                  }
                  controller.close();
                }
              });

              await writer.merge(toUIMessageStream({ stream: filteredStream as any }));
              success = true;
              break;
            } else {
              console.warn(`Model ${modelName} returned error or hit quota, trying next option.`);
            }
          } catch (err: any) {
            console.warn(`Model ${modelName} failed initialization:`, err.message || err);
            lastError = err;
          }
        }

        if (!success) {
          console.error('All models in execution list failed.');
          const errorMsg = `⚠️ Błąd: Nie udało się uruchomić żadnego z modeli (prawdopodobnie przekroczono limit zapytań / Quota Exceeded dla darmowego klucza API). Szczegóły: ${lastError instanceof Error ? lastError.message : 'All models failed to load'}.`;
          writer.write({ type: 'text-start', id: 'err-chunk' });
          writer.write({ type: 'text-delta', id: 'err-chunk', delta: errorMsg });
          writer.write({ type: 'text-end', id: 'err-chunk' });
        }
      } catch (globalError: any) {
        console.error("Global stream execution error:", globalError);
        const errorMsg = `⚠️ Błąd krytyczny serwera: ${globalError.message || 'Global error in stream execution.'}`;
        writer.write({ type: 'text-start', id: 'err-chunk-global' });
        writer.write({ type: 'text-delta', id: 'err-chunk-global', delta: errorMsg });
        writer.write({ type: 'text-end', id: 'err-chunk-global' });
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
