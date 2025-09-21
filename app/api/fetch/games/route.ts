export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { fetchSelectedConferencesGames, assertCfbdEnv } from '@/lib/fetchers/cfbd';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // Params
    const yearParam = searchParams.get('year');
    const year = yearParam ? Number(yearParam) : new Date().getFullYear();
    const week = searchParams.get('week') ? Number(searchParams.get('week')) : undefined;
    const seasonType = (searchParams.get('seasonType') || 'regular') as any;

    // Conferences: allow multiple ?conference= entries; default to ACC/SEC/Big Ten/Big 12
    const conferences = searchParams.getAll('conference');
    const defaultConfs = ['ACC', 'SEC', 'Big Ten', 'Big 12'];

    // Normalize some common aliases (e.g., B1G -> Big Ten)
    const norm = (c: string) => {
      const t = c.trim();
      if (/^b1g$/i.test(t) || /^big\s*10$/i.test(t)) return 'Big Ten';
      if (/^big\s*12$/i.test(t)) return 'Big 12';
      return t.replace(/\s+/g, ' ');
    };
    const confs = (conferences.length ? conferences : defaultConfs).map(norm);

    assertCfbdEnv();
    const data = await fetchSelectedConferencesGames({ year, week, seasonType, conferences: confs });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}
