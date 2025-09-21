const BASE=process.env.CFBD_BASE_URL||'https://api.collegefootballdata.com';async function get(path:string,params:Record<string,any>){const url=new URL(path,BASE);Object.entries(params).forEach(([k,v])=>{if(v!==undefined)url.searchParams.set(k,String(v));});const r=await fetch(url.toString(),{headers:{Authorization:`Bearer ${process.env.CFBD_API_KEY}`},cache:'no-store'});if(!r.ok)throw new Error(`CFBD ${path} ${r.status}`);return r.json();}function nk(s:string){return String(s||'').toLowerCase().replace(/\s+/g,'').replace(/[^a-z0-9:_]/g,'');}export async function cfbdSeasonTable(year:number,division:'fbs'|'fcs'|'ii'|'iii'='fbs'){const [records,seasonStats,srs,adv]=await Promise.all([get('/records',{year,division:division.toUpperCase()}),get('/stats/season',{year}),get('/ratings/srs',{year}),get('/stats/season/advanced',{year}).catch(()=>[])]);const wide:Record<string,any>={};for(const s of seasonStats){const team=s.team;const key=nk(`${s.category}:${s.statName||s.stat}`);(wide[team] ||= {season:year,team})[key]=s.statValue ?? s.value;}for(const a of adv as any[]){const team=a.team||a.school||a.teamName;if(!team)continue;const w=(wide[team] ||= {season:year,team});const put=(k:string,v:any)=>{if(v!=null)w[k]=v;};put('off_success_rate',a.offense?.successRate ?? a.offenseSuccessRate);put('def_success_rate',a.defense?.successRate ?? a.defenseSuccessRate);put('off_explosiveness',a.offense?.explosiveness ?? a.offenseExplosiveness);put('def_explosiveness',a.defense?.explosiveness ?? a.defenseExplosiveness);put('havoc_rate_def',a.defense?.havoc?.total ?? a.defenseHavocTotal);put('finishing_drives_off',a.offense?.pointsPerOpportunity ?? a.offensePPO);put('finishing_drives_def',a.defense?.pointsPerOpportunity ?? a.defensePPO);put('field_position_off',a.offense?.fieldPosition?.averageStart ?? a.offenseAvgStartFP);put('field_position_def',a.defense?.fieldPosition?.averageStart ?? a.defenseAvgStartFP);put('pace_seconds_per_play',a.secondsPerPlay ?? a.pace);}for(const r of srs){const w=(wide[r.team] ||= {season:year,team:r.team});w['srs']=r.rating;w['srs_rank']=r.ranking;w['conference']=r.conference;}return Object.values(wide);}export async function cfbdGames(params:{year:number,week?:number,seasonType?:'regular'|'postseason',division?:'fbs'|'fcs'|'ii'|'iii'}){const {year,week,seasonType='regular',division='fbs'}=params;const rows=await get('/games',{year,week,seasonType,division:division.toUpperCase()});return rows;}export async function cfbdResultsForTraining(params:{startYear:number,endYear:number,division?:'fbs'|'fcs'|'ii'|'iii'}){const out:any[]=[];for(let y=params.startYear;y<=params.endYear;y++){const weeks=Array.from({length:16},(_,i)=>i+1);for(const w of weeks){const rows=await cfbdGames({year:y,week:w,seasonType:'regular',division:params.division||'fbs'});for(const g of rows){if(g?.homePoints==null||g?.awayPoints==null)continue;out.push({date:g.startDate||g.start_date||`${y}-09-01`,home_team:g.homeTeam||g.home_team,away_team:g.awayTeam||g.away_team,home_points:g.homePoints||g.home_points,away_points:g.awayPoints||g.away_points,neutral_site:(g.neutralSite??g.neutral_site??false)?1:0});}}}return out;}


async function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3) : Promise<T> {
  let err: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      err = e;
      // Retry only on 429/5xx hinted in message
      const msg = String(e?.message || '');
      if (!/\b(429|5\d\d)\b/.test(msg) && !/rate limit|timeout/i.test(msg)) break;
      await sleep(250 * Math.pow(2, i));
    }
  }
  throw err;
}

// === Added by assistant: conference-limited fetcher ===

/** Pull ACC, SEC, Big Ten, Big 12 games (or a provided subset), merged/sorted/deduped. */
export async function fetchSelectedConferencesGames(opts: {
  year: number;
  week?: number;
  seasonType?: "regular" | "postseason" | "both" | string;
  conferences?: string[];
}) {
  // Minimal local helpers in case this file is structured differently.
  const BASE = process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';
  const API_KEY = process.env.CFBD_API_KEY;

  const headers: Record<string,string> = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};

  async function get(path: string, params: Record<string, any>) {
    const url = new URL(path, BASE);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.append(k, String(v));
    });
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`CFBD ${path} failed: ${res.status} ${res.statusText} ${body}`);
    }
    return res.json();
  }

  const POWER_SET = ["ACC", "SEC", "Big Ten", "Big 12"];
  const conferences = (opts.conferences?.length ? opts.conferences : POWER_SET).map(c => c.trim());

  const common = { year: opts.year, week: opts.week, seasonType: opts.seasonType };

  const results = await Promise.all(
    conferences.map(conf => withRetry(() => get('/games', { ...common, conference: conf })))
  );

  // Flatten
  const merged: any[] = ([] as any[]).concat(...results);

  // Sort: kickoff time then home team
  merged.sort((a: any, b: any) => {
    const at = new Date(a.start_date || a.date || a.start_time).getTime();
    const bt = new Date(b.start_date || b.date || b.start_time).getTime();
    if (at !== bt) return at - bt;
    return (a.home_team || '').localeCompare(b.home_team || '');
  });

  // Dedupe by id or composite key
  const seen = new Set<string | number>();
  const out: any[] = [];
  for (const g of merged) {
    const id = g.id ?? `${g.season}-${g.week}-${g.home_team}-${g.away_team}`;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(g);
    }
  }
  return out;
}




/** Validate required CFBD env and produce helpful errors. */
export function assertCfbdEnv() {
  const key = process.env.CFBD_API_KEY;
  if (!key || key.trim() === '') {
    throw new Error('CFBD_API_KEY is missing. Set it in your environment to call CollegeFootballData API.');
  }
}
