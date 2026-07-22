import { google } from '@ai-sdk/google';
import { streamText, createUIMessageStream, createUIMessageStreamResponse, toUIMessageStream, convertToModelMessages } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

const SYSTEM_PROMPT = `
Jesteś asystentem który odpowiada w DOKŁADNIE takim formacie jak w przykładach poniżej.

## PRZYKŁADY

Użytkownik: "Czym jest API?"
Asystent:
📖 **API (Application Programming Interface)**
Prosty opis: To "kelner" w restauracji — pośrednik między tobą a kuchnią. 
Ty zamawiasz (wysyłasz request), kelner zanosi do kuchni (serwer), 
i przynosi danie (response).
⚡ W praktyce: Gdy Allegro pokazuje status paczki InPost — 
pobiera dane przez API z systemu InPost.
🔗 Powiązane: REST, endpoint, JSON, HTTP

Użytkownik: "Czym jest B2B?"
Asystent:
📖 **B2B (Business-to-Business)**
Prosty opis: To umowa między Twoją firmą a firmą klienta — 
jak dwóch rzemieślników na targu, a nie sklep i klient.
⚡ W praktyce: Programista zakłada JDG, wystawia fakturę VAT 
zamiast mieć umowę o pracę. Zarabia więcej netto, ale sam płaci ZUS i nie ma urlopu.
🔗 Powiązane: JDG, faktura VAT, ZUS, umowa o pracę

## ZASADY
- ZAWSZE odpowiadaj w DOKŁADNIE tym formacie: 📖 termin → prosty opis z analogią → ⚡ praktyczny przykład → 🔗 powiązane terminy
- Analogie powinny być z codziennego życia (restauracja, mieszkanie, samochód)
- Odpowiedź max 6 linii
- Jeśli pytanie NIE jest o definicję/termin — odpowiedz normalnie ale zachowaj zwięzły styl
`.trim();

const getModelsToTry = (modelParam: string) => {
  return [
    'gemini-3.1-flash-lite',
  ];
};

export async function POST(req: Request) {
  const body = await req.json();
  const { messages: rawMessages, model = 'flash' } = body;

  const messages = rawMessages.map((m: any) => {
    if (m.parts && Array.isArray(m.parts)) {
      return {
        ...m,
        content: m.parts.map((p: any) => p.text).join(' '),
      };
    }
    return m;
  });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // Write the requested model type (flash/pro)
      writer.write({
        type: 'data-model-type',
        data: model,
      });

      const messagesConverted = await convertToModelMessages(messages);
      const modelsToTry = getModelsToTry(model);

      let success = false;
      let lastError: any = null;

      for (const modelName of modelsToTry) {
        console.log(`[FewShot] Attempting model execution for: ${modelName}`);
        try {
          const primaryResult = streamText({
            model: google(modelName),
            system: SYSTEM_PROMPT,
            messages: messagesConverted,
            maxSteps: 3,
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
            console.warn(`[FewShot] Stream read failed for model ${modelName}:`, e.message || e);
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

            await writer.merge(toUIMessageStream({ stream: reconstructedStream as any }));
            success = true;
            break;
          } else {
            console.warn(`[FewShot] Model ${modelName} returned error or hit quota, trying next option.`);
          }
        } catch (err: any) {
          console.warn(`[FewShot] Model ${modelName} failed initialization:`, err.message || err);
          lastError = err;
        }
      }

      if (!success) {
        console.error('[FewShot] All models in execution list failed.');
        const errorMsg = `⚠️ Błąd: Nie udało się uruchomić żadnego z modeli (prawdopodobnie przekroczono limit zapytań / Quota Exceeded dla darmowego klucza API). Szczegóły: ${lastError instanceof Error ? lastError.message : 'All models failed to load'}.`;
        writer.write({ type: 'text-start', id: 'err-chunk' });
        writer.write({ type: 'text-delta', id: 'err-chunk', delta: errorMsg });
        writer.write({ type: 'text-end', id: 'err-chunk' });
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
