import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 30; // set Next.js max duration to 30 seconds

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Brak opisu (prompt) w żądaniu.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Brak skonfigurowanego klucza API w środowisku.' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // Implement a 30s timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Przekroczono limit czasu żądania (30s).')), 30000)
    );

    const apiPromise = ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: prompt,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const response = await Promise.race([apiPromise, timeoutPromise]);

    let base64Image = '';
    let textCommentary = '';

    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData) {
        const mimeType = part.inlineData.mimeType || 'image/png';
        base64Image = `data:${mimeType};base64,${part.inlineData.data}`;
      } else if (part.text) {
        textCommentary += part.text;
      }
    }

    if (!base64Image) {
      return NextResponse.json(
        { error: 'Model nie wygenerował żadnego obrazu. Spróbuj opisać prompt dokładniej.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      image: base64Image,
      text: textCommentary.trim(),
    });
  } catch (error: any) {
    console.error('Błąd podczas generowania obrazu:', error);
    const errStr = error.message || String(error);
    let userFriendlyError = errStr;

    if (errStr.includes('limit: 0') || errStr.includes('Quota exceeded') || errStr.includes('RESOURCE_EXHAUSTED')) {
      userFriendlyError = `Błąd limitu / blokady regionalnej (Imagen 3). Szczegóły: ${errStr} \n\n👉 Wskazówka: Google blokuje generowanie obrazów na darmowych kluczach API dla użytkowników z Unii Europejskiej (w tym z Polski). \nAby to rozwiązać:\n1. Użyj VPN z adresem IP w USA przed wygenerowaniem klucza / wysłaniem zapytania.\n2. Albo włącz płatności (Pay-as-you-go) w Google AI Studio (wtedy blokada UE znika).`;
    }

    return NextResponse.json(
      { error: userFriendlyError },
      { status: 500 }
    );
  }
}
