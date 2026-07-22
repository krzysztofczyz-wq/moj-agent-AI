import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text field is required and must be a string' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_GENERATIVE_AI_API_KEY is not configured' },
        { status: 500 }
      );
    }

    // Try text-embedding-004 first
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: {
            parts: [{ text }],
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.embedding && data.embedding.values) {
          return NextResponse.json({ embedding: data.embedding.values });
        }
      }
      console.warn(
        `text-embedding-004 failed with status ${response.status}, attempting fallback to gemini-embedding-2...`
      );
    } catch (e) {
      console.warn('text-embedding-004 failed, trying fallback...', e);
    }

    // Fallback: gemini-embedding-2 with 768 output dimensionality
    const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${apiKey}`;
    const fallbackResponse = await fetch(fallbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'models/gemini-embedding-2',
        content: {
          parts: [{ text }],
        },
        outputDimensionality: 768,
      }),
    });

    if (!fallbackResponse.ok) {
      const errData = await fallbackResponse.json();
      return NextResponse.json(
        { error: 'Failed to generate embedding via fallback', details: errData },
        { status: fallbackResponse.status }
      );
    }

    const data = await fallbackResponse.json();
    if (data.embedding && data.embedding.values) {
      return NextResponse.json({ embedding: data.embedding.values });
    }

    return NextResponse.json(
      { error: 'Invalid embedding response structure from API' },
      { status: 500 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
