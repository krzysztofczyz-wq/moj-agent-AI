import { google } from '@ai-sdk/google';
import {
  streamText,
  createUIMessageStream,
  createUIMessageStreamResponse,
  toUIMessageStream,
  convertToModelMessages,
  tool,
  isStepCount,
} from 'ai';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { saveNote, getNotes, searchKnowledge } from '@/lib/tools';

export const maxDuration = 60;

const AGENT_SYSTEM_PROMPT = `
# 🤖 Agent AI — Pełna moc

Jesteś potężnym agentem AI z dostępem do 7 narzędzi. Sam decydujesz których użyć, aby jak najlepiej odpowiedzieć na pytanie użytkownika.

## Dostępne narzędzia:
1. **calculator** 🧮 — obliczenia matematyczne (użyj gdy pytanie zawiera liczby, %, VAT, itp.)
2. **currentDateTime** 🕐 — aktualna data i czas
3. **googleSearch** 🌐 — wyszukiwanie w Google (użyj dla aktualnych informacji)
4. **readWebPage** 📄 — czytanie zawartości strony WWW (użyj gdy dostaniesz URL)
5. **generateImage** 🎨 — generowanie obrazów (użyj gdy ktoś prosi o logo, grafikę, ilustrację)
6. **analyzeImage** 👁️ — analiza obrazów (gdy użytkownik wkleił screenshot)
7. **searchKnowledge** 📚 — wyszukuje informacje w bazie wiedzy firmy (cenniki, FAQ, regulaminy, oferty)

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

## Zasady działania:
- **Odpowiadaj WYŁĄCZNIE na ostatnie (bieżące) pytanie użytkownika.**
- **Nie powtarzaj odpowiedzi na poprzednie pytania** z historii rozmowy i nie nawiązuj do nich, chyba że użytkownik o to wyraźnie poprosi (np. "odnieś się do poprzedniej odpowiedzi").
- **Nie podsumowuj ponownie wcześniej użytych narzędzi** z poprzednich tur rozmowy. Skup się tylko na narzędziach wywołanych w tej turze.
- **Korzystaj z narzędzi aktywnie** — nie zgaduj, sprawdzaj.
- Możesz używać wielu narzędzi w jednej odpowiedzi (np. Google Search + generateImage).
- Odpowiadaj w języku polskim.
- Po użyciu narzędzi daj konkretną, syntetyczną odpowiedź na bieżące pytanie.
- Przy obliczeniach zawsze pokaż działanie krok po kroku.
- Gdy generujesz obraz, opisz co wygenerowałeś.

## Format odpowiedzi:
Podsumuj krótko co znalazłeś/zrobiłeś za pomocą narzędzi w TYM KROKU, a na końcu daj spójną odpowiedź na bieżące pytanie. Nie powtarzaj treści poprzednich odpowiedzi.
`.trim();

const getModelsToTry = (modelParam: string) => {
  return ['gemini-3.1-flash-lite'];
};

// Helper: fetch and clean webpage
async function fetchWebPage(url: string): Promise<string> {
  // auto-prepend https if missing
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    clearTimeout(timeoutId);
    if (!response.ok) return `Błąd HTTP: ${response.status} ${response.statusText}`;
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
    clearTimeout(timeoutId);
    return err.name === 'AbortError' ? 'Błąd: Timeout (8s).' : `Błąd: ${err.message}`;
  }
}

// Helper: generate image via @google/genai
async function generateImageBase64(prompt: string): Promise<{ image: string; text: string }> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout generowania obrazu (25s)')), 25000)
  );

  const apiPromise = ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-image',
    contents: prompt,
    config: { responseModalities: ['TEXT', 'IMAGE'] },
  });

  const response = await Promise.race([apiPromise, timeoutPromise]);
  const parts = response.candidates?.[0]?.content?.parts || [];
  let base64Image = '';
  let textCommentary = '';
  for (const part of parts) {
    if (part.inlineData) {
      const mimeType = part.inlineData.mimeType || 'image/png';
      base64Image = `data:${mimeType};base64,${part.inlineData.data}`;
    } else if (part.text) {
      textCommentary += part.text;
    }
  }
  return { image: base64Image, text: textCommentary.trim() };
}

export async function POST(req: Request) {
  const body = await req.json();
  console.log('[Agent] POST received');

  const { messages: rawMessages = [], model = 'flash' } = body;

  const lastUserMsg = [...rawMessages].reverse().find((m: any) => m.role === 'user');

  // Convert the full rawMessages history to Vercel AI SDK CoreMessages
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

  const messagesConverted = await convertToModelMessages(messages);

  // Detect URL in latest user message for readWebPage
  // Detect URL in latest user message for readWebPage
  let lastUserText = '';
  if (lastUserMsg) {
    if (typeof lastUserMsg.content === 'string' && lastUserMsg.content) {
      lastUserText = lastUserMsg.content;
    } else if (Array.isArray(lastUserMsg.parts)) {
      lastUserText = lastUserMsg.parts.map((p: any) => p.text || '').join(' ');
    } else if (Array.isArray(lastUserMsg.content)) {
      lastUserText = lastUserMsg.content.map((p: any) => p.text || '').join(' ');
    }
  }

  const containsUrl = /https?:\/\/[^\s/$.?#].[^\s]*/i.test(lastUserText) ||
                      /\b([a-zA-Z0-9-]+\.(pl|com|org|net|edu|gov|info|io|co|uk|de|fr|eu))\b/i.test(lastUserText);

  console.log(`[Agent] containsUrl=${containsUrl} for lastUserText="${lastUserText}"`);

  // Build tool set — googleSearch cannot coexist with custom function tools in Gemini
  // So we always provide custom tools + conditionally readWebPage, and use googleSearch only when no custom tools needed
  const tools: Record<string, any> = {
    calculator: tool({
      description: 'Oblicza wyrażenia matematyczne. Użyj gdy pytanie zawiera liczby, procenty, VAT, odsetki, wzory.',
      parameters: z.object({
        expression: z.string().describe('Wyrażenie matematyczne do obliczenia, np. "8500 * 0.23" lub "sqrt(144)"'),
      }),
      execute: async ({ expression }: { expression: string }) => {
        try {
          // Safe evaluation — only allow math characters
          const safeExpr = expression.replace(/[^0-9+\-*/().,\s%]/g, '');
          // Use Function for safe math eval
          // eslint-disable-next-line no-new-func
          const result = Function(`"use strict"; return (${safeExpr})`)();
          return `Wynik obliczenia "${expression}" = ${result}`;
        } catch {
          return `Nie udało się obliczyć wyrażenia: ${expression}`;
        }
      },
    } as any),

    currentDateTime: tool({
      description: 'Zwraca aktualną datę i czas. Użyj gdy pytanie dotyczy daty, dnia tygodnia, aktualnego czasu.',
      parameters: z.object({}),
      execute: async () => {
        const now = new Date();
        return `Aktualna data i czas: ${now.toLocaleString('pl-PL', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          timeZone: 'Europe/Warsaw',
        })} (strefa: Europa/Warszawa)`;
      },
    } as any),

    readWebPage: tool({
      description: 'Pobiera i czyta zawartość strony internetowej. Używaj gdy użytkownik poda URL lub gdy chcesz przeczytać artykuł/stronę znalezioną w wyszukiwarce.',
      parameters: z.object({
        url: z.string().describe('Pełny adres URL strony do przeczytania'),
      }),
      execute: async ({ url }: { url: string }) => fetchWebPage(url),
    } as any),

    generateImage: tool({
      description: 'Generuje obraz na podstawie opisu. Używaj gdy użytkownik prosi o logo, grafikę, ilustrację, post wizualny, obrazek.',
      parameters: z.object({
        prompt: z.string().describe('Szczegółowy opis obrazu do wygenerowania po angielsku (angielski daje lepsze wyniki)'),
      }),
      execute: async ({ prompt }: { prompt: string }) => {
        try {
          const { image, text } = await generateImageBase64(prompt);
          if (!image) return 'Nie udało się wygenerować obrazu.';
          // Return a special marker that the client will intercept
          return JSON.stringify({ __type: 'generated_image', image, text, prompt });
        } catch (err: any) {
          const errStr = err.message || String(err);
          if (errStr.includes('limit: 0') || errStr.includes('Quota exceeded') || errStr.includes('RESOURCE_EXHAUSTED')) {
            return `Błąd limitu / blokady regionalnej (Imagen 3). Szczegóły: ${errStr}\n\n👉 Google blokuje generowanie obrazów (Imagen 3) w regionie UE na darmowych kluczach API. Użyj VPN z adresem w USA lub włącz płatności w Google AI Studio.`;
          }
          return `Błąd generowania obrazu: ${errStr}`;
        }
      },
    } as any),
    saveNote,
    getNotes,
    searchKnowledge,
  };

  // Add googleSearch only when no URL is being processed
  // (Gemini API doesn't allow googleSearch + function tools simultaneously)
  if (!containsUrl) {
    (tools as any).googleSearch = google.tools.googleSearch({});
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
        writer.write({ type: 'data-model-type', data: model });


        const modelsToTry = getModelsToTry(model);

        let success = false;
        let lastError: any = null;

        for (const modelName of modelsToTry) {
          console.log(`[Agent] Attempting model: ${modelName}`);
          try {
            const primaryResult = streamText({
              model: google(modelName),
              system: AGENT_SYSTEM_PROMPT,
              messages: messagesConverted,
              tools: tools as any,
              maxSteps: 3,
              stopWhen: isStepCount(8),
            } as any);

            let useFallback = false;
            const bufferedChunks: any[] = [];
            const primaryIterator = primaryResult.stream[Symbol.asyncIterator]();

            try {
              let result = await primaryIterator.next();
              while (!result.done) {
                const chunk = result.value;
                bufferedChunks.push(chunk);
                if (chunk.type === 'error') { useFallback = true; break; }
                if (chunk.type !== 'start') break;
                result = await primaryIterator.next();
              }
            } catch (e: any) {
              console.warn(`[Agent] Stream failed for ${modelName}:`, e.message);
              useFallback = true;
            }

            if (!useFallback) {
              writer.write({ type: 'data-model-name', data: modelName });

              const reconstructedStream = new ReadableStream({
                async start(controller) {
                  for (const chunk of bufferedChunks) controller.enqueue(chunk);
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

              await writer.merge(toUIMessageStream({ stream: reconstructedStream as any }));
              success = true;
              break;
            } else {
              console.warn(`[Agent] Model ${modelName} hit quota, trying next.`);
            }
          } catch (err: any) {
            console.warn(`[Agent] Model ${modelName} failed init:`, err.message);
            lastError = err;
          }
        }

        if (!success) {
          console.error('[Agent] All models failed.');
          const errMsg = `⚠️ Błąd: Nie udało się uruchomić modelu. Prawdopodobnie wyczerpano limit API (Quota Exceeded). Szczegóły: ${lastError instanceof Error ? lastError.message : 'All models failed'}.`;
          writer.write({ type: 'text-start', id: 'err' });
          writer.write({ type: 'text-delta', id: 'err', delta: errMsg });
          writer.write({ type: 'text-end', id: 'err' });
        }
      } catch (globalErr: any) {
        console.error('[Agent] Global error:', globalErr);
        const errMsg = `⚠️ Błąd krytyczny: ${globalErr.message}`;
        writer.write({ type: 'text-start', id: 'err-global' });
        writer.write({ type: 'text-delta', id: 'err-global', delta: errMsg });
        writer.write({ type: 'text-end', id: 'err-global' });
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
