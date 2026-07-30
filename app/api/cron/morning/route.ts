import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { supabaseAdmin, getSupabaseClient } from '@/lib/supabase';
import { getWeather, getExchangeRate, currentDateTime } from '@/lib/tools';
import { NextResponse } from 'next/server';

export const maxDuration = 30; // Ustawienie limitu czasu na 30 sekund

export async function GET(req: Request) {
  try {
    // Sprawdzenie nagłówka Authorization (Vercel Cron używa Bearer <CRON_SECRET>, klient Supabase token użytkownika)
    const authHeader = req.headers.get('authorization');
    const host = req.headers.get('host') || '';
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

    let userId: string | null = null;
    let isAuthorized = isLocalhost;

    if (!isAuthorized && authHeader) {
      if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
        isAuthorized = true;
      } else {
        // Spróbuj zweryfikować jako token Supabase użytkownika
        try {
          const token = authHeader.replace('Bearer ', '');
          const userClient = getSupabaseClient(token);
          const { data: { user }, error: authError } = await userClient.auth.getUser();
          if (user && !authError) {
            isAuthorized = true;
            userId = user.id;
          }
        } catch (e) {
          console.error('[Cron Morning] Failed to authenticate user token:', e);
        }
      }
    }

    if (!isAuthorized) {
      console.warn('[Cron Morning] Unauthorized access attempt.');
      return new Response('Unauthorized', { status: 401 });
    }

    console.log('[Cron Morning] Starting morning briefing generation...');

    // 1. Pobranie aktualnego czasu i dnia tygodnia w Polsce
    const dateTimeRes = await (currentDateTime as any).execute({});
    const dateStr = dateTimeRes.dateTime || new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
    const dayOfWeek = dateTimeRes.dayOfWeek || new Date().toLocaleString('pl-PL', { weekday: 'long', timeZone: 'Europe/Warsaw' });

    // 2. Pobranie pogody dla Warszawy
    const weatherRes = await (getWeather as any).execute({ city: 'Warszawa' });

    // 3. Pobranie kursów walut EUR i USD
    const eurRes = await (getExchangeRate as any).execute({ currency: 'EUR' });
    const usdRes = await (getExchangeRate as any).execute({ currency: 'USD' });

    // 4. Sformatowanie danych do promptu
    const weatherText = weatherRes.error 
      ? `Błąd pobierania pogody: ${weatherRes.error}` 
      : `Miasto: ${weatherRes.city}, Kraj: ${weatherRes.country}, Temperatura: ${weatherRes.temperature}°C, Wilgotność: ${weatherRes.humidity}%, Wiatr: ${weatherRes.windSpeed} km/h, Stan: ${weatherRes.description}`;

    const eurText = eurRes.error ? `Błąd: ${eurRes.error}` : `${eurRes.rate} PLN (dane z dnia ${eurRes.date})`;
    const usdText = usdRes.error ? `Błąd: ${usdRes.error}` : `${usdRes.rate} PLN (dane z dnia ${usdRes.date})`;

    const prompt = `
Oto aktualne dane wejściowe zebrane przez system:
- Dzisiejsza data i godzina w Polsce: ${dateStr}
- Dzień tygodnia: ${dayOfWeek}
- Dane pogodowe w Warszawie: ${weatherText}
- Kurs EUR/PLN: ${eurText}
- Kurs USD/PLN: ${usdText}

Wygeneruj poranny briefing na podstawie tych danych.
    `.trim();

    const systemPrompt = `
Jesteś osobistym asystentem. Napisz poranny briefing w formacie:

# ☀️ Dzień dobry! Twój briefing na [wpisz tutaj aktualną datę z danych]

## 🌤️ Pogoda
[temperatura, opis, co ubrać na podstawie pogody w danych]

## 💶 Kursy walut
- EUR: [kurs z danych] PLN
- USD: [kurs z danych] PLN

## 📅 Dzisiejszy dzień
- Dzień tygodnia: [dzień tygodnia z danych]
- Uwagi: [krótka uwaga, np. czy to dzień wolny od pracy, czy dzień powszedni, ewentualnie luźna dygresja]

## 💡 Porada dnia
[Krótka, pozytywna porada na dzień dopasowana opcjonalnie do pogody lub dnia tygodnia]
    `.trim();

    // 5. Generowanie briefingu przez Gemini
    const { text: briefingContent } = await generateText({
      model: google('gemini-3.1-flash-lite'),
      system: systemPrompt,
      prompt: prompt,
    });

    console.log('[Cron Morning] Briefing generated successfully.');

    // 6. Zapis briefingu w Supabase
    // Używamy daty lokalnej w formacie YYYY-MM-DD
    const todayDateStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' }); // 'YYYY-MM-DD'

    const { error: insertError } = await supabaseAdmin
      .from('briefings')
      .insert({
        content: briefingContent,
        date: todayDateStr,
        user_id: userId,
      });

    if (insertError) {
      console.error('[Cron Morning] Supabase insert error:', insertError);
      return NextResponse.json({
        success: false,
        error: `Błąd zapisu w bazie: ${insertError.message}`,
      }, { status: 500 });
    }

    console.log('[Cron Morning] Briefing saved to database.');

    return NextResponse.json({
      success: true,
      date: todayDateStr,
      preview: briefingContent,
    });

  } catch (err: any) {
    console.error('[Cron Morning] Critical error in route:', err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Unknown error occurred',
    }, { status: 500 });
  }
}
