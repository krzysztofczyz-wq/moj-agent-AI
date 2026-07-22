import { google } from '@ai-sdk/google';
import { streamText, createUIMessageStream, createUIMessageStreamResponse, toUIMessageStream, convertToModelMessages, isStepCount } from 'ai';
import {
  calculator,
  currentDateTime,
  getWeather,
  getExchangeRate,
  getHolidays,
  searchWikipedia,
  saveNote,
  getNotes,
  readWebPage,
  searchKnowledge,
} from '@/lib/tools';

export const maxDuration = 60; // Allow longer execution for multi-step ReAct loop

const REACT_SYSTEM_PROMPT = `Jesteś autonomicznym agentem. Gdy dostajesz ZADANIE (nie pytanie),
MUSISZ je zrealizować krok po kroku.

## TWÓJ PROCES:

Dla KAŻDEGO kroku wypisz:

### 🧠 Myślę...
Co muszę teraz zrobić? Jakie informacje mi brakuje?
Które narzędzie użyć?

Potem UŻYJ narzędzia.

Po otrzymaniu wyniku:

### 👁️ Obserwuję...
Co dostałem? Czy to wystarczy do odpowiedzi?
Jeśli nie — jaki następny krok?

Powtarzaj aż będziesz mieć WSZYSTKO co potrzebne.

Na koniec:

### ✅ Wynik końcowy
Podaj pełną, konkretną odpowiedź opartą na zebranych danych.
Cytuj źródła (API, Wikipedia, Google).

## ZASADY:
- ZAWSZE pokazuj tok myślenia — użytkownik widzi cały proces
- NIE zgaduj — jeśli potrzebujesz danych, UŻYJ narzędzia
- Maksymalnie 5 głównych kroków
- Jeśli narzędzie zwróci błąd — spróbuj inaczej lub poinformuj
- ŁĄCZ dane z wielu narzędzi w spójną odpowiedź

## BAZA WIEDZY I RAG:
Masz dostęp do bazy wiedzy firmy przez narzędzie searchKnowledge.

ZASADY KORZYSTANIA Z BAZY WIEDZY:
1. Gdy użytkownik pyta o ceny, pakiety, oferty, regulamin, FAQ, warunki umowy itp. — ZAWSZE użyj searchKnowledge.
2. Odpowiadaj TYLKO na podstawie znalezionych fragmentów — nie wymyślaj.
3. NIE halucynuj — lepiej powiedzieć 'nie wiem' niż zmyślić cenę lub szczegóły oferty.

CYTOWANIE ŹRÓDEŁ:
Gdy odpowiadasz na podstawie bazy wiedzy, ZAWSZE podaj źródło:
Format: Na końcu odpowiedzi (np. w sekcji ### ✅ Wynik końcowy) dodaj dokładnie:
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

## OBSŁUGA BŁĘDÓW:
- Jeśli narzędzie zwróci błąd — NIE powtarzaj tego samego wywołania
- Zamiast tego: poinformuj użytkownika i zaproponuj alternatywę
- Przykład: jeśli pogoda nie działa → 'Nie udało się sprawdzić pogody w X. Mogę spróbować innego miasta.'
- NIGDY nie wywołuj tego samego narzędzia z tymi samymi argumentami dwa razy z rzędu
- Jeśli po 3 nieudanych próbach nie masz danych — powiedz wprost czego brakuje`;

const getModelsToTry = (modelParam: string) => {
  return ['gemini-3.1-flash-lite'];
};

export async function POST(req: Request) {
  const body = await req.json();
  const { messages: rawMessages = [], model = 'flash' } = body;

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

  // Define tools set using imported tools directly
  const tools: Record<string, any> = {
    calculator,
    currentDateTime,
    getWeather,
    getExchangeRate,
    getHolidays,
    searchWikipedia,
    saveNote,
    getNotes,
    readWebPage,
    searchKnowledge,
  };

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
        writer.write({ type: 'data-model-type', data: model });

        const modelsToTry = getModelsToTry(model);
        let success = false;
        let lastError: any = null;

        for (const modelName of modelsToTry) {
          console.log(`[ReAct] Attempting model: ${modelName}`);
          try {
            const modelConfig = google(modelName);

            const primaryResult = streamText({
              model: modelConfig,
              system: REACT_SYSTEM_PROMPT,
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
                if (chunk.type === 'error') {
                  useFallback = true;
                  break;
                }
                if (chunk.type !== 'start') break;
                result = await primaryIterator.next();
              }
            } catch (e: any) {
              console.warn(`[ReAct] Stream failed for ${modelName}:`, e.message);
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
              console.warn(`[ReAct] Model ${modelName} hit quota/error, trying next.`);
            }
          } catch (err: any) {
            console.warn(`[ReAct] Model ${modelName} failed init:`, err.message);
            lastError = err;
          }
        }

        if (!success) {
          console.error('[ReAct] All models failed.');
          const errMsg = `⚠️ Błąd: Nie udało się uruchomić agenta ReAct. Prawdopodobnie wyczerpano limit API (Quota Exceeded). Szczegóły: ${lastError instanceof Error ? lastError.message : 'All models failed'}.`;
          writer.write({ type: 'text-start', id: 'err' });
          writer.write({ type: 'text-delta', id: 'err', delta: errMsg });
          writer.write({ type: 'text-end', id: 'err' });
        }
      } catch (globalErr: any) {
        console.error('[ReAct] Global error:', globalErr);
        const errMsg = `⚠️ Błąd krytyczny agenta ReAct: ${globalErr.message}`;
        writer.write({ type: 'text-start', id: 'err-global' });
        writer.write({ type: 'text-delta', id: 'err-global', delta: errMsg });
        writer.write({ type: 'text-end', id: 'err-global' });
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
