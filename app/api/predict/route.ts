export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { fetchSelectedConferencesGames, assertCfbdEnv } from '@/lib/fetchers/cfbd';

type PredictRequest = {
  conferences?: string[];
  autoMatchups?: boolean;
  year?: number;
  week?: number;
  seasonType?: 'regular' | 'postseason' | string;

  autoTraining?: boolean;
  trainStartYear?: number;
  trainEndYear?: number;

  useStats?: boolean;
  statsWeight?: number;

  useOdds?: boolean;
  oddsSource?: 'soh' | 'vegasinsider' | string;
  oddsUrl?: string;

  games?: any[];
  matchups?: Array<{home_team:string;away_team:string;neutral_site?:number}>;
};

async function cfbdGet(path: string, params: Record<string, any> = {}) {
  const base = process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';
  const key = process.env.CFBD_API_KEY || '';
  const url = new URL(path, base);
  Object.entries(params).forEach(([k,v]) => v!=null && url.searchParams.append(k, String(v)));
  const res = await fetch(url.toString(), { headers: key ? { Authorization: `Bearer ${key}` } : undefined });
  if (!res.ok) throw new Error(`CFBD GET ${path} failed: ${res.status} ${res.statusText}`);
  return res.json();
}

function logistic(x:number, scale=10) {
  // Elo-style logistic; scale ~ 10 => 400 Elo ~= 10*log10? But we just need a smooth curve.
  return 1/(1+Math.pow(10, -x/scale));
}

export async function POST(req: NextRequest) {
  try {
    assertCfbdEnv();
    const body = (await req.json()) as PredictRequest;
    const conferences = body.conferences && body.conferences.length ? body.conferences : ['ACC','SEC','Big Ten','Big 12'];
    const year = Number(body.year ?? new Date().getFullYear());
    const week = body.week != null ? Number(body.week) : undefined;
    const seasonType = body.seasonType ?? 'regular';

    // 1) Build matchups
    let matchups: Array<{home_team:string;away_team:string;neutral_site?:number}>;
    if (body.autoMatchups !== false) {
      // auto: fetch games for that week from selected conferences
      const games = await fetchSelectedConferencesGames({ year, week, seasonType, conferences });
      matchups = games.map((g:any)=>({home_team: g.home_team, away_team: g.away_team, neutral_site: Number(g.neutral_site||0)}));
    } else if (Array.isArray(body.matchups)) {
      matchups = body.matchups;
    } else {
      return NextResponse.json({ error: 'No matchups provided.' }, { status: 400 });
    }

    // 2) Simple tuned HFA (placeholder). If autoTraining requested, we could compute from history.
    const tuned_hfa = 2.5;

    // 3) Pull SRS ratings for the season and make a quick probability
    const srsList: any[] = await cfbdGet('/ratings/srs', { year });
    const srsMap = new Map<string, number>();
    for (const r of srsList) srsMap.set(r.team, Number(r.rating ?? 0));

    const predictions = matchups.map(m => {
      const ra = srsMap.get(m.home_team) ?? 0;
      const rb = srsMap.get(m.away_team) ?? 0;
      const adj = (m.neutral_site ? 0 : tuned_hfa);
      const diff = (ra - rb) + adj;
      const p_home = logistic(diff, 10);
      return {
        home_team: m.home_team,
        away_team: m.away_team,
        neutral_site: !!m.neutral_site,
        rating_home: ra,
        rating_away: rb,
        expected_diff: diff,
        p_elo: p_home,   // name kept to match UI
      };
    });

    return NextResponse.json({ tuned_hfa, predictions });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}
