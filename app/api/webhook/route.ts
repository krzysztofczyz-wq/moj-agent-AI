import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export const maxDuration = 30; // Ustawienie limitu czasu na 30 sekund

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, data } = body;

    if (!type || !data) {
      return NextResponse.json({
        success: false,
        error: 'Brak wymaganych pól: type lub data',
      }, { status: 400 });
    }

    console.log(`[Webhook] Received event of type: ${type}`);

    let systemPrompt = '';
    let prompt = '';

    if (type === 'feedback') {
      systemPrompt = `
Jesteś analitykiem Customer Success. Przeanalizuj feedback od klienta i wygeneruj odpowiedź w formacie:
# 💬 Analiza Feedbacku
- Klient: [imię i nazwisko klienta z danych, jeśli brak to "Nieznany"]
- Sentyment: [Pozytywny / Neutralny / Negatywny na podstawie komentarza i oceny]
- Priorytet: [🔴 Wysoki / 🟡 Średni / 🟢 Niski - na podstawie oceny rating: 1-2 to Wysoki, 3 to Średni, 4-5 to Niski]

## Sugestia odpowiedzi:
[Napisz profesjonalną, grzeczną i adekwatną odpowiedź do klienta po polsku, podpisując się jako Customer Success Team]
      `.trim();
      prompt = `Przeanalizuj ten feedback: ${JSON.stringify(data)}`;

    } else if (type === 'alert') {
      systemPrompt = `
Jesteś inżynierem DevOps / Site Reliability Engineer (SRE). Przeanalizuj alert systemowy i wygeneruj rekomendacje w formacie:
# 🚨 Analiza Alertu Systemowego
- Usługa: [nazwa usługi z danych]
- Stan: [stan/status z danych]
- Krytyczność: [🔴 Krytyczny / 🟡 Średni / 🟢 Niski - np. jeśli status to down, to Krytyczny]

## Rekomendowane działania naprawcze:
[Przedstaw w punktach 2-3 konkretne, techniczne kroki naprawcze dla zespołu administracyjnego]
      `.trim();
      prompt = `Przeanalizuj ten alert: ${JSON.stringify(data)}`;

    } else if (type === 'order') {
      systemPrompt = `
Jesteś asystentem sprzedaży. Przeanalizuj zamówienie i przygotuj potwierdzenie w formacie:
# 🛒 Podsumowanie Zamówienia
- Klient: [klient/email z danych]
- Produkt: [produkt z danych]
- Kwota: [kwota/kwota w PLN] PLN

## Status:
[Napisz krótkie, entuzjastyczne potwierdzenie realizacji zamówienia i ewentualne kolejne kroki dla klienta]
      `.trim();
      prompt = `Przeanalizuj to zamówienie: ${JSON.stringify(data)}`;

    } else {
      systemPrompt = `Jesteś pomocnym asystentem AI. Przeanalizuj przesłane dane JSON i podsumuj je w zwięzły sposób.`;
      prompt = `Typ zdarzenia: ${type}. Dane: ${JSON.stringify(data)}`;
    }

    // Generowanie analizy przez Gemini
    const { text: analysis } = await generateText({
      model: google('gemini-3.1-flash-lite'),
      system: systemPrompt,
      prompt: prompt,
    });

    console.log('[Webhook] Analysis completed successfully.');

    // Zapis do tabeli webhook_events w Supabase omijając RLS za pomocą supabaseAdmin
    const { data: insertResult, error: insertError } = await supabaseAdmin
      .from('webhook_events')
      .insert({
        type: type,
        data: data,
        analysis: analysis,
      })
      .select();

    if (insertError) {
      console.error('[Webhook] Supabase insert error:', insertError);
      return NextResponse.json({
        success: false,
        error: `Błąd zapisu w bazie: ${insertError.message}`,
      }, { status: 500 });
    }

    const eventId = insertResult && insertResult[0] ? insertResult[0].id : null;
    console.log(`[Webhook] Event saved to database. Event ID: ${eventId}`);

    return NextResponse.json({
      success: true,
      analysis: analysis,
      event_id: eventId,
    });

  } catch (err: any) {
    console.error('[Webhook] Critical error in route:', err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Unknown error occurred',
    }, { status: 500 });
  }
}
