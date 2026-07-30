import { google } from '@ai-sdk/google';
import { streamText, isStepCount } from 'ai';
import { getSupabaseClient } from '@/lib/supabase';
import { readWebPage, searchWikipedia } from '@/lib/tools';

export const maxDuration = 60; // Allow 60s for tool executions & generation

export async function POST(req: Request) {
  try {
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

    const body = await req.json();
    const { notes } = body;

    if (!notes || typeof notes !== 'string') {
      return new Response(JSON.stringify({ error: 'Bad Request: missing notes string' }), { status: 400 });
    }

    const systemPrompt = `Jesteś profesjonalnym asystentem biznesowym. Twoim zadaniem jest przeanalizowanie surowych, często chaotycznych notatek ze spotkania i wygenerowanie profesjonalnego, ustrukturyzowanego podsumowania.

## TWÓJ PROCES:
1. Przeanalizuj notatki — zidentyfikuj uczestników, agendę, decyzje oraz zadania do wykonania.
2. Jeśli w notatkach wymienione są konkretne firmy, technologie lub skróty biznesowe, których kontekst warto rozwinąć, użyj narzędzia searchWikipedia lub readWebPage, aby krótko je opisać w sekcji "Słownik i Kontekst" na końcu.
3. Sformatuj podsumowanie według poniższego szablonu.

## FORMAT PODSUMOWANIA:

# 📋 Podsumowanie spotkania: [Temat / Nazwa Spotkania]
Data: ${new Date().toLocaleDateString('pl-PL')}
Opracował: Asystent AI

## 👥 Uczestnicy
[Wypisz listę wykrytych uczestników lub grup]

## 🎯 Agenda i Kontekst
[Krótki opis celu spotkania — 2-3 zdania]

## 🧠 Główne ustalenia i decyzje
- **[Decyzja 1]:** [Opis co ustalono]
- **[Decyzja 2]:** [Opis co ustalono]

## ⚡ Action Items (Zadania do wykonania)
| Zadanie | Odpowiedzialny | Termin | Status |
| :--- | :--- | :--- | :--- |
| [Opis zadania] | [Kto] | [Do kiedy / ASAP] | ⏳ Oczekuje |

## 🔍 Słownik i Kontekst (Dodatkowa wiedza)
[Jeśli wyszukiwałeś informacje o firmach/technologiach w Wikipedii, wklej krótkie (1-2 zdania) wyjaśnienia ze źródłami. Jeśli nie szukałeś niczego, możesz pominąć tę sekcję.]`;

    const modelName = 'gemini-3.1-flash-lite';
    
    // Check if we should use search grounding
    const useSearchGrounding = process.env.ENABLE_SEARCH_GROUNDING === 'true';
    const modelInstance = useSearchGrounding
      ? (google as any)(modelName, { useSearchGrounding: true })
      : google(modelName);

    const tools: Record<string, any> = {
      readWebPage,
      searchWikipedia,
    };

    const result = streamText({
      model: modelInstance,
      system: systemPrompt,
      prompt: `Oto surowe notatki ze spotkania do opracowania:\n\n${notes}`,
      tools: tools as any,
      maxSteps: 5,
      stopWhen: isStepCount(5),
    } as any);

    return result.toTextStreamResponse();
  } catch (error: any) {
    console.error('Error in meeting summary API:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
}
