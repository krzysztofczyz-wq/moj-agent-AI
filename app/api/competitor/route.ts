import { google } from '@ai-sdk/google';
import { streamText, isStepCount } from 'ai';
import { getSupabaseClient } from '@/lib/supabase';
import { readWebPage, searchWikipedia } from '@/lib/tools';

export const maxDuration = 60; // Allow 60s for research & generation

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
    const { company1, company2, company3, context } = body;

    if (!company1 || !company2 || !company3) {
      return new Response(JSON.stringify({ error: 'Bad Request: missing company names' }), { status: 400 });
    }

    const systemPrompt = `Jesteś analitykiem konkurencji. Gdy użytkownik poda nazwy firm,
AUTONOMICZNIE zbierasz informacje i porównujesz je.

## TWÓJ PROCES:
1. Dla KAŻDEJ firmy: szukaj informacji (Google, Wikipedia, strony firmowe)
2. Zbierz: opis, branża, wielkość, produkty, ceny, mocne/słabe strony
3. Stwórz tabelę porównawczą
4. Napisz rekomendację

## FORMAT:

# 🏢 Analiza konkurencji

## Porównanie

| Aspekt | [Firma 1] | [Firma 2] | [Firma 3] |
|--------|-----------|-----------|-----------|
| Branża | ... | ... | ... |
| Wielkość | ... | ... | ... |
| Główny produkt | ... | ... | ... |
| Mocne strony | ... | ... | ... |
| Słabe strony | ... | ... | ... |
| Ceny (orientacyjne) | ... | ... | ... |

## Szczegółowa analiza
[Rozwinięcie dla każdej firmy — 3-4 zdania]

## Rekomendacja
[Która firma jest najlepsza i dlaczego — w kontekście użytkownika]

## Źródła
[Linki do stron firmowych i artykułów]`;

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

    const userPrompt = `Porównaj te 3 firmy:
1. ${company1}
2. ${company2}
3. ${company3}

Kontekst biznesowy/użytkownika: ${context || 'Brak dodatkowego kontekstu (ogólne porównanie)'}`;

    const result = streamText({
      model: modelInstance,
      system: systemPrompt,
      prompt: userPrompt,
      tools: tools as any,
      maxSteps: 10,
      stopWhen: isStepCount(10),
    } as any);

    return result.toTextStreamResponse();
  } catch (error: any) {
    console.error('Error in competitor API:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
}
