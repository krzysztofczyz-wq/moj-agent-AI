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
    const { topic, tone, audience } = body;

    if (!topic || typeof topic !== 'string') {
      return new Response(JSON.stringify({ error: 'Bad Request: missing topic string' }), { status: 400 });
    }

    const systemPrompt = `Jesteś profesjonalnym copywriterem i ekspertem ds. mediów społecznościowych. Twoim zadaniem jest opracowanie zestawu angażujących postów na trzy platformy: LinkedIn, Twitter/X oraz Instagram.

## TWÓJ PROCES:
1. Jeśli temat dotyczy specyficznych firm, najnowszych technologii lub wydarzeń biznesowych, użyj narzędzia searchWikipedia lub readWebPage, aby zebrać poprawne fakty i kontekst.
2. Zredaguj trzy unikalne posty dopasowane do specyfiki każdej platformy, z zachowaniem określonego tonu wypowiedzi i grupy docelowej.

## TON WYPOWIEDZI:
${tone || 'Profesjonalny i angażujący'}

## GRUPA DOCELOWA:
${audience || 'Ogólna społeczność biznesowa'}

## FORMAT POSTÓW:
Wygeneruj odpowiedź w ustrukturyzowanym formacie markdown z wyraźnymi nagłówkami (dzięki czemu klient będzie mógł je łatwo rozdzielić):

# 📱 Wygenerowane Posty Social Media

## 🔗 LinkedIn
*Post na LinkedIn powinien być merytoryczny, profesjonalny, podzielony na krótkie akapity. Zachęć do dyskusji w komentarzach. Użyj 3-5 branżowych hashtagów.*

\`\`\`text
[Treść posta na LinkedIn]
\`\`\`

---

## 🐦 Twitter/X
*Post na Twitterze/X musi być zwięzły, chwytliwy i mieć MAKSYMALNIE 280 znaków (wliczając hashtagi). Użyj 1-2 hashtagów.*

\`\`\`text
[Treść posta na Twitter/X (max 280 znaków)]
\`\`\`

---

## 📸 Instagram
*Post na Instagramie powinien być wizualny, angażujący, używać emoji i zawierać jasne wezwanie do działania (Call to Action). Na dole dodaj blok 5-8 hashtagów.*

\`\`\`text
[Treść posta na Instagram]
\`\`\`

---

## 🔍 Przeprowadzony research (Dodatkowy kontekst)
[Jeśli korzystałeś z Wikipedii lub odczytywałeś strony, krótko wymień jakie fakty zweryfikowałeś. Jeśli nie używałeś narzędzi, możesz pominąć tę sekcję.]`;

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

    const userPrompt = `Temat postu: ${topic}
Zadany ton: ${tone}
Grupa docelowa: ${audience}`;

    const result = streamText({
      model: modelInstance,
      system: systemPrompt,
      prompt: userPrompt,
      tools: tools as any,
      maxSteps: 5,
      stopWhen: isStepCount(5),
    } as any);

    return result.toTextStreamResponse();
  } catch (error: any) {
    console.error('Error in social media API:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
}
