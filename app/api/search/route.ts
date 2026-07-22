import { NextResponse } from 'next/server';
import { searchKnowledge } from '@/lib/tools';

export async function POST(req: Request) {
  try {
    const { query } = await req.json();
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const searchResult = await (searchKnowledge as any).execute({ query });
    return NextResponse.json(searchResult);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || err }, { status: 500 });
  }
}
