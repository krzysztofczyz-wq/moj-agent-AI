import { google } from '@ai-sdk/google';
import { streamText, createUIMessageStream, createUIMessageStreamResponse, toUIMessageStream, convertToModelMessages } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

const SYSTEM_PROMPT = `
Jesteś asystentem który formatuje odpowiedzi według instrukcji użytkownika.

Rozpoznajesz komendy formatu na początku wiadomości:

/tabela [temat] — odpowiedz w formie tabeli markdown
  Kolumny dobierz do tematu. Minimum 3 kolumny, 5 wierszy.
  Przykład: /tabela porównanie frameworków JavaScript

/lista [temat] — odpowiedz jako lista numerowana z opisami
  Każdy punkt: numer + nagłówek (bold) + 1 zdanie opisu
  Przykład: /lista 10 zasad dobrego kodu

/porownanie [A] vs [B] — tabela porównawcza dwóch rzeczy
  Kolumny: Aspekt | [A] | [B] | Werdykt
  Minimum 6 aspektów + wiersz podsumowania
  Przykład: /porownanie React vs Vue

/faq [temat] — lista pytań i odpowiedzi
  Format: **Q:** pytanie (bold) → **A:** odpowiedź
  Minimum 5 par Q&A
  Przykład: /faq praca zdalna

/email [opis] — napisz profesjonalny email
  Format: Temat | Od/Do | Treść | Podpis
  Przykład: /email prośba o urlop na 2 tygodnie

Jeśli wiadomość NIE zaczyna się od komendy — odpowiadaj normalnie, 
ale w czystym, czytelnym markdown.

ZAWSZE formatuj w markdown (nagłówki, pogrubienia, tabele, listy).
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
        console.log(`[Format] Attempting model execution for: ${modelName}`);
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
            console.warn(`[Format] Stream read failed for model ${modelName}:`, e.message || e);
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
            console.warn(`[Format] Model ${modelName} returned error or hit quota, trying next option.`);
          }
        } catch (err: any) {
          console.warn(`[Format] Model ${modelName} failed initialization:`, err.message || err);
          lastError = err;
        }
      }

      if (!success) {
        console.error('[Format] All models in execution list failed.');
        const errorMsg = `⚠️ Błąd: Nie udało się uruchomić żadnego z modeli (prawdopodobnie przekroczono limit zapytań / Quota Exceeded dla darmowego klucza API). Szczegóły: ${lastError instanceof Error ? lastError.message : 'All models failed to load'}.`;
        writer.write({ type: 'text-start', id: 'err-chunk' });
        writer.write({ type: 'text-delta', id: 'err-chunk', delta: errorMsg });
        writer.write({ type: 'text-end', id: 'err-chunk' });
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
