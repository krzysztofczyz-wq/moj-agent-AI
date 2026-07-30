import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { getSupabaseClient } from '@/lib/supabase';
import { readWebPage, searchWikipedia, calculator } from '@/lib/tools';

export const maxDuration = 60;

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
    const { topic } = body;

    if (!topic || typeof topic !== 'string') {
      return new Response(JSON.stringify({ error: 'Bad Request: missing topic string' }), { status: 400 });
    }

    const systemPrompt = `Jesteś profesjonalnym analitykiem biznesowym. Gdy użytkownik poda temat, 
AUTONOMICZNIE zbierasz informacje i piszesz raport.

## TWÓJ PROCES:
1. Przeanalizuj temat — co trzeba zbadać?
2. Szukaj danych za pomocą dostępnych narzędzi (Wikipedia, wyszukiwanie w internecie, kalkulator do przeliczeń).
3. Zbierz fakty, liczby, statystyki.
4. Napisz raport w profesjonalnym formacie.

## FORMAT RAPORTU:

# 📊 Raport: [TEMAT]
Data: ${new Date().toLocaleDateString('pl-PL')}
Autor: Agent AI

## Streszczenie (Executive Summary)
[3-4 zdania — kluczowe wnioski]

## 1. Wprowadzenie
[Kontekst, dlaczego ten temat jest ważny]

## 2. Kluczowe dane i fakty
[Wylistowane punkty z danymi — ze źródłami]

## 3. Analiza
[Interpretacja danych, trendy, porównania]

## 4. Wnioski i rekomendacje
[Co z tego wynika? Co robić?]

## Źródła
[Lista użytych źródeł z linkami]

ZASADY:
- Używaj PRAWDZIWYCH danych i szukaj ich za pomocą narzędzi.
- Podawaj źródła przy każdym fakcie.
- Bądź konkretny — liczby, daty, nazwy.
- Raport powinien mieć 500-1000 słów.
- Nie wymyślaj statystyk — szukaj!`;

    const modelName = 'gemini-3.1-flash-lite';
    
    // Check if we should use search grounding
    const useSearchGrounding = process.env.ENABLE_SEARCH_GROUNDING === 'true';
    const modelInstance = useSearchGrounding
      ? (google as any)(modelName, { useSearchGrounding: true })
      : google(modelName);

    const tools: Record<string, any> = {
      readWebPage,
      searchWikipedia,
      calculator,
    };

    const result = streamText({
      model: modelInstance,
      system: systemPrompt,
      prompt: `Napisz raport na temat: "${topic}"`,
      tools: tools as any,
      maxSteps: 8,
    } as any);

    return result.toTextStreamResponse();
  } catch (error: any) {
    console.error('Error in report API:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
}
