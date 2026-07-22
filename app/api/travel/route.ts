import { google } from '@ai-sdk/google';
import { streamText, createUIMessageStream, createUIMessageStreamResponse, toUIMessageStream, isStepCount } from 'ai';
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
} from '@/lib/tools';

export const maxDuration = 60; // Travel planning can require multiple sequential tool steps

const TRAVEL_SYSTEM_PROMPT = `Jesteś profesjonalnym asystentem podróży. Gdy użytkownik opisuje planowaną podróż, AUTONOMICZNIE zbierasz wszystkie potrzebne informacje za pomocą dostępnych narzędzi.

## TWÓJ PROCES:

Dla każdej podróży (chyba że użytkownik prosi o porównanie kilku miast) MUSISZ sprawdzić za pomocą narzędzi:
1. 🌤️ Pogodę w miejscu docelowym (getWeather)
2. 💶 Kurs lokalnej waluty (getExchangeRate) - jeśli walutą docelową nie jest PLN. Pamiętaj, aby wyszukać kurs waluty kraju docelowego (np. EUR dla Niemiec/Francji/Hiszpanii/Włoch, GBP dla Wielkiej Brytanii, USD dla USA, CZK dla Czech).
3. 📅 Dni wolne/święta w kraju docelowym (getHolidays)
4. 📖 Informacje o mieście (searchWikipedia)
5. 🧮 Przeliczenie budżetu jeśli podany (calculator)

Po zebraniu danych, wygeneruj GOTOWY PLAN w formacie (użyj dokładnie tych nagłówków):

## 🗺️ Plan podróży: [MIASTO]

### 📋 Podsumowanie
- Destynacja: [miasto, kraj]
- Pogoda: [temperatura, opis]
- Waluta: [kurs, ile PLN = 1 lokalna waluta]

### 🌤️ Pogoda
[Szczegóły pogody + co spakować]

### 💰 Budżet
[Przeliczenia walutowe, orientacyjne koszty. Jeśli podano budżet w PLN, przelicz go na lokalną walutę i zaprezentuj obliczenia.]

### 📅 Ważne daty
[Święta, dni wolne — co może być zamknięte?]

### 🏛️ Co zobaczyć
[Na podstawie Wikipedii — główne atrakcje i opis]

### ✅ Checklist przed wyjazdem
[Lista rzeczy do zrobienia/spakowania]

## W PRZYPADKU PORÓWNANIA ("porównaj X i Y"):
Zamiast planu wygeneruj tabelę porównawczą zawierającą aspekty: Pogoda, Waluta, Święta, Polecam (ocena gwiazdkowa ⭐) oraz końcową rekomendację z uzasadnieniem:

| Aspekt      | [MIASTO 1]   | [MIASTO 2]   |
|-------------|-------------|--------------|
| Pogoda      | [temp, opis]| [temp, opis] |
| Waluta      | [kurs]      | [kurs]       |
| Święta      | [info]      | [info]       |
| Polecam     | [ocena ⭐]   | [ocena ⭐]    |

## ZASADY:
- Używaj PRAWDZIWYCH danych z narzędzi — nie zgaduj.
- Jeśli narzędzie zwróci błąd — poinformuj i kontynuuj.
- Bądź praktyczny — konkretne rady, nie ogólniki.
- Podawaj ceny w PLN (przeliczone po aktualnym kursie).

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

  // Stateless ReAct execution: take only the latest user message
  const coreMessages: any[] = [];
  const lastUserMsg = [...rawMessages].reverse().find((m: any) => m.role === 'user');
  
  if (lastUserMsg) {
    if (lastUserMsg.parts && Array.isArray(lastUserMsg.parts)) {
      coreMessages.push({ role: 'user', content: lastUserMsg.parts });
    } else {
      coreMessages.push({ role: 'user', content: lastUserMsg.content });
    }
  }

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
  };

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
        writer.write({ type: 'data-model-type', data: model });

        const modelsToTry = getModelsToTry(model);
        let success = false;
        let lastError: any = null;

        for (const modelName of modelsToTry) {
          console.log(`[Travel] Attempting model: ${modelName}`);
          try {
            const modelConfig = google(modelName);

            const primaryResult = streamText({
              model: modelConfig,
              system: TRAVEL_SYSTEM_PROMPT,
              messages: coreMessages,
              tools: tools as any,
              maxSteps: 3,
              stopWhen: isStepCount(10), // Limit to 10 iterations to allow complete information retrieval
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
              console.warn(`[Travel] Stream failed for ${modelName}:`, e.message);
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
              console.warn(`[Travel] Model ${modelName} hit quota/error, trying next.`);
            }
          } catch (err: any) {
            console.warn(`[Travel] Model ${modelName} failed init:`, err.message);
            lastError = err;
          }
        }

        if (!success) {
          console.error('[Travel] All models failed.');
          const errMsg = `⚠️ Błąd: Nie udało się uruchomić asystenta podróży. Prawdopodobnie wyczerpano limit API (Quota Exceeded). Szczegóły: ${lastError instanceof Error ? lastError.message : 'All models failed'}.`;
          writer.write({ type: 'text-start', id: 'err' });
          writer.write({ type: 'text-delta', id: 'err', delta: errMsg });
          writer.write({ type: 'text-end', id: 'err' });
        }
      } catch (globalErr: any) {
        console.error('[Travel] Global error:', globalErr);
        const errMsg = `⚠️ Błąd krytyczny asystenta podróży: ${globalErr.message}`;
        writer.write({ type: 'text-start', id: 'err-global' });
        writer.write({ type: 'text-delta', id: 'err-global', delta: errMsg });
        writer.write({ type: 'text-end', id: 'err-global' });
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
