import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { getSupabaseClient } from '@/lib/supabase';
import { checkTokenBudget, logTokenUsage } from '@/lib/budget';

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

    const budgetResult = await checkTokenBudget(user.id, '', '/api/email-triage');
    if (budgetResult.isBlocked) {
      return new Response(JSON.stringify({ error: budgetResult.blockMsg }), { status: 429 });
    }

    const body = await req.json();
    const { emails } = body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return new Response(JSON.stringify({ error: 'Bad Request: missing emails array' }), { status: 400 });
    }

    const userContent = emails
      .map((email, idx) => `=== MAIL ${idx + 1} ===\n${email}`)
      .join('\n\n');

    const systemPrompt = `Jesteś profesjonalnym asystentem do zarządzania pocztą.

Dla KAŻDEGO maila wykonaj:
1. 📧 KATEGORYZACJA: określ typ (zapytanie ofertowe / reklamacja / spam / informacja / prośba o spotkanie)
2. 🔴🟡🟢 PRIORYTET: Wysoki (wymaga odpowiedzi dziś) / Średni (w ciągu 3 dni) / Niski (może poczekać)
3. ✍️ DRAFT: Napisz krótki, profesjonalny szkic odpowiedzi (3-5 zdań). Jeśli mail to spam lub newsletter reklamowy (Niski priorytet), draft odpowiedzi nie jest wymagany lub powinien brzmieć "Brak odpowiedzi (SPAM/Newsletter)".

FORMAT ODPOWIEDZI:
Dla każdego maila wypisz dokładnie poniższy szablon (nie zmieniaj nazw pól i zachowaj strukturę tabeli markdown):

### Mail [numer]: [krótki temat]
| Kategoria | [typ] |
| Priorytet | [🔴 Wysoki / 🟡 Średni / 🟢 Niski] |
| Uzasadnienie | [dlaczego ten priorytet] |

**Proponowana odpowiedź:**
> [draft odpowiedzi]

---

Na końcu wypisz podsumowanie w poniższym formacie:

PODSUMOWANIE
- 🔴 Pilne: [ile] maili
- 🟡 Średnie: [ile] maili
- 🟢 Niskie: [ile] maili
- ✅ Rekomendacja: [który mail obsłużyć najpierw]`;

    const modelName = 'gemini-3.1-flash-lite';
    const result = streamText({
      model: google(modelName),
      system: systemPrompt,
      prompt: userContent,
      onFinish(event: any) {
        if (event && event.usage) {
          logTokenUsage(user.id, event.usage.promptTokens, event.usage.completionTokens, modelName, '/api/email-triage');
        }
      }
    });

    return result.toTextStreamResponse();
  } catch (error: any) {
    console.error('Error in email triage API:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
}
