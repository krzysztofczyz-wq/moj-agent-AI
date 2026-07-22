import { google } from '@ai-sdk/google';
import { streamText, createUIMessageStream, createUIMessageStreamResponse, toUIMessageStream, convertToModelMessages } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

const THINKING_PROMPT = `
# Oskar — Licencjonowany makler giełdowy i doradca inwestycyjny (Analityk)

Jesteś analitykiem. Twoim zadaniem jest MYŚLEĆ NA GŁOS.
Dodatkowo jesteś Oskarem, licencjonowanym maklerem giełdowym (z 15-letnim doświadczeniem w branży rynków kapitałowych na GPW i Wall Street).
Wszelkie analizy i rekomendacje dostosuj do swojej tożsamości.

Gdy dostajesz pytanie, MUSISZ przejść przez te kroki:

### 🧠 MYŚLĘ...

**Krok 1 — Zrozumienie:**
Co dokładnie użytkownik pyta? Przeformułuj pytanie swoimi słowami.

**Krok 2 — Fakty:**
Co wiem na ten temat? Co jest pewne, a co wymaga sprawdzenia? Zastosuj oznaczenia pewności: ✓ pewne, ~ przybliżone, ? do weryfikacji.

**Krok 3 — Analiza:**
Jakie są 2-3 możliwe podejścia/odpowiedzi? Zrób obliczenia, porównania lub przeanalizuj warianty.

**Krok 4 — Ocena:**
Które podejście jest najlepsze? DLACZEGO?

### ✅ ODPOWIEDŹ
Podaj finalną, konkretną odpowiedź na podstawie analizy powyżej. Sformatuj ją profesjonalnie.
Dodaj odpowiedni tip giełdowy na samym końcu (oznaczony emoji 💸, 📊 lub 📈 w zależności od trybu).

WAŻNE:
- ZAWSZE pokaż CAŁY proces myślenia — użytkownik widzi jak pracujesz.
- Używaj nagłówków markdown do oddzielenia kroków.
- Krok "Myślę" powinien być DŁUŻSZY niż finalna odpowiedź.
`;

const getModelsToTry = (modelParam: string) => {
  return [
    'gemini-3.1-flash-lite',
  ];
};

export async function POST(req: Request) {
  const body = await req.json();
  const { messages: rawMessages, mode = 'casual', model = 'flash' } = body;

  const messages = rawMessages.map((m: any) => {
    if (m.parts && Array.isArray(m.parts)) {
      return {
        ...m,
        content: m.parts.map((p: any) => p.text).join(' '),
      };
    }
    return m;
  });

  // Combine thinking prompt with mode rules to ensure consistency
  const instructions = `
${THINKING_PROMPT}

Dodatkowe wytyczne dla stylu wypowiedzi (tryb: ${mode}):
- Ton: ${
    mode === 'casual'
      ? 'luźny, bezpośredni, z dopuszczalnymi emoji i żartami'
      : mode === 'ekspert'
      ? 'profesjonalny, analityczny, niezwykle precyzyjny'
      : 'kreatywny, inspirujący, z użyciem barwnych metafor i analogii'
  }
- Pamiętasz całą rozmowę od początku.
`;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // Write metadata parts to stream
      writer.write({
        type: 'data-mode',
        data: mode,
      });

      writer.write({
        type: 'data-model-type',
        data: model,
      });

      const messagesConverted = await convertToModelMessages(messages);
      const modelsToTry = getModelsToTry(model);

      let success = false;
      let lastError: any = null;

      for (const modelName of modelsToTry) {
        console.log(`[Thinking API] Attempting model execution for: ${modelName}`);
        try {
          const primaryResult = streamText({
            model: google(modelName),
            system: instructions,
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
            console.warn(`[Thinking API] Stream read failed for model ${modelName}:`, e.message || e);
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
            console.warn(`[Thinking API] Model ${modelName} returned error or hit quota, trying next option.`);
          }
        } catch (err: any) {
          console.warn(`[Thinking API] Model ${modelName} failed initialization:`, err.message || err);
          lastError = err;
        }
      }

      if (!success) {
        console.error('[Thinking API] All models in execution list failed.');
        const errorMsg = `⚠️ Błąd: Nie udało się uruchomić żadnego z modeli (prawdopodobnie przekroczono limit zapytań / Quota Exceeded dla darmowego klucza API). Szczegóły: ${lastError instanceof Error ? lastError.message : 'All models failed to load'}.`;
        writer.write({ type: 'text-start', id: 'err-chunk' });
        writer.write({ type: 'text-delta', id: 'err-chunk', delta: errorMsg });
        writer.write({ type: 'text-end', id: 'err-chunk' });
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
