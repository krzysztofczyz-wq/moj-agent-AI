import { NextResponse } from 'next/server';
import { supabase, getSupabaseClient } from '@/lib/supabase';
import { splitIntoChunks } from '@/lib/chunking';

// Helper to generate embedding using the local /api/embed logic directly to avoid self-fetch issues in some environments
async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  // Try text-embedding-004
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.embedding && data.embedding.values) {
        return data.embedding.values;
      }
    }
  } catch (e) {
    console.warn('Direct text-embedding-004 call failed in upload, trying fallback...', e);
  }

  // Fallback to gemini-embedding-2 with 768 output dimensionality
  const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${apiKey}`;
  const fallbackResponse = await fetch(fallbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-2',
      content: { parts: [{ text }] },
      outputDimensionality: 768,
    }),
  });

  if (!fallbackResponse.ok) {
    const errText = await fallbackResponse.text();
    throw new Error(`Embedding fallback failed: ${fallbackResponse.status} ${errText}`);
  }

  const data = await fallbackResponse.json();
  if (data.embedding && data.embedding.values) {
    return data.embedding.values;
  }

  throw new Error('Invalid response structure from fallback embedding API');
}

// Dynamic helper to check if database uses 'metadata' or 'metdata'
async function getMetadataKey(supabaseClient: any): Promise<string> {
  try {
    const { error } = await supabaseClient.from('documents').select('metadata').limit(0);
    if (error && (error.code === '42703' || error.message.includes('metadata'))) {
      return 'metdata';
    }
  } catch (e) {
    console.warn('Metadata key check failed, defaulting to metadata', e);
  }
  return 'metadata';
}

// POST: Process and save knowledge chunks, streaming progress back to client
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized: missing authorization header' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');
    const userClient = getSupabaseClient(token);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: invalid token' }, { status: 401 });
    }

    const { title, content } = await req.json();

    if (!title || typeof title !== 'string' || !content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Both title and content are required and must be strings' },
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

    const encoder = new TextEncoder();
    const chunks = splitIntoChunks(content, 500, 50);
    const totalChunks = chunks.length;

    // Detect the correct metadata/metdata key dynamically
    const metadataKey = await getMetadataKey(userClient);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for (let i = 0; i < totalChunks; i++) {
            // Enqueue progress status update
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  status: 'processing',
                  current: i + 1,
                  total: totalChunks,
                }) + '\n'
              )
            );

            const chunkText = chunks[i];
            const embedding = await generateEmbedding(chunkText, apiKey);

            const metadataObj = {
              source: title,
              chunk_index: i,
              total_chunks: totalChunks,
            };

            const payload: Record<string, any> = {
              title,
              content: chunkText,
              embedding,
              user_id: user.id,
              created_at: new Date().toISOString(), // explicitly supply created_at in case database lacks default value
            };
            payload[metadataKey] = metadataObj;

            const { error: insertError } = await userClient.from('documents').insert(payload);

            if (insertError) {
              throw new Error(`Supabase insert error at chunk ${i + 1}/${totalChunks}: ${insertError.message}`);
            }
          }

          // Complete stream
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                status: 'done',
                chunks_saved: totalChunks,
              }) + '\n'
            )
          );
          controller.close();
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                status: 'error',
                message: err.message || 'Error occurred during ingestion',
              }) + '\n'
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('Upload knowledge error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized: missing authorization header' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');
    const userClient = getSupabaseClient(token);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const title = searchParams.get('title');

    if (title) {
      const { data, error } = await userClient
        .from('documents')
        .select('id, title, content, created_at, metdata')
        .eq('title', title)
        .eq('user_id', user.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ chunks: data || [] });
    }

    const { data, error } = await userClient
      .from('documents')
      .select('title, created_at')
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by title in memory
    const docsMap: Record<string, { title: string; count: number; created_at: string }> = {};

    for (const row of data || []) {
      const title = row.title;
      if (!docsMap[title]) {
        docsMap[title] = {
          title,
          count: 0,
          created_at: row.created_at,
        };
      }
      docsMap[title].count += 1;
      // Keep earliest creation date
      if (row.created_at && (!docsMap[title].created_at || new Date(row.created_at) < new Date(docsMap[title].created_at))) {
        docsMap[title].created_at = row.created_at;
      }
    }

    const documentsList = Object.values(docsMap).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return NextResponse.json({ documents: documentsList });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// DELETE: Delete a document by title
export async function DELETE(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized: missing authorization header' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');
    const userClient = getSupabaseClient(token);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const title = searchParams.get('title');

    if (!title) {
      return NextResponse.json({ error: 'Title parameter is required' }, { status: 400 });
    }

    const { error } = await userClient
      .from('documents')
      .delete()
      .eq('title', title)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
