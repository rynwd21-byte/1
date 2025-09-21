
'use client';
import { useEffect, useState } from 'react';
import Papa from 'papaparse';
type Row = Record<string,string>;
function parseCSV(csv:string){ const r=Papa.parse<Row>(csv.trim(),{header:true,skipEmptyLines:true}); if(r.errors.length) throw new Error(r.errors[0].message); return r.data; }
type EnvStatus={has_CFBD_KEY:boolean;base_url:string|null};
function EnvBanner(){
  const [status,setStatus]=useState<EnvStatus|null>(null);
  const [err,setErr]=useState<string|null>(null);
  useEffect(()=>{(async()=>{try{const res=await fetch('/api/debug/env',{cache:'no-store'}); const json=await res.json(); setStatus(json);}catch(e:any){setErr(e?.message||'Failed to load env status');}})();},[]);
  const ok=!!(status?.has_CFBD_KEY);
  return (<div style={{backgroundColor:ok?'#ecfdf5':'#fef2f2',border:`1px solid ${ok?'#10b981':'#ef4444'}`,color:ok?'#065f46':'#991b1b',padding:'10px 12px',borderRadius:10,fontSize:14}}>
    <strong>Env check:</strong> {err?<>Error — {err}</>:status?<>CFBD_API_KEY: <b>{status.has_CFBD_KEY?'present ✅':'missing ❌'}</b> | NEXT_PUBLIC_BASE_URL: <b>{status.base_url||'auto (not set)'}</b></>:'Loading…'}
  </div>);
}
export default function Home(){
  useEffect(() => {
  const onErr = (ev:any) => {
    console.error('Global error', ev?.error || ev);
  };
  const onRej = (ev:any) => {
    console.error('Unhandled rejection', ev?.reason || ev);
  };
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onRej);
  return () => { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onRej); };
}, []);

  const [trainCSV,setTrainCSV]=useState('date,home_team,away_team,home_points,away_points,neutral_site\n2024-09-01,Team A,Team B,24,17,0\n');
  const [predCSV,setPredCSV]=useState('home_team,away_team,neutral_site\nTeam A,Team B,0\n');
  const POWER4 = ['ACC','SEC','Big Ten','Big 12'] as const;
  const [conferences,setConferences]=useState<string[]>([...POWER4]);
  const [autoTraining,setAutoTraining]=useState(true);
  const [trainStartYear,setTrainStartYear]=useState(2020);
  const [trainEndYear,setTrainEndYear]=useState(2024);
  const [autoMatchups,setAutoMatchups]=useState(true);
  const [year,setYear]=useState(2025);
  const [week,setWeek]=useState(1);
  const [seasonType,setSeasonType]=useState<'regular'|'postseason'>('regular');
  const [useStats,setUseStats]=useState(true);
  const [statsWeight,setStatsWeight]=useState(0.3);
  const [useOdds,setUseOdds]=useState(false);
  const [oddsSource,setOddsSource]=useState<'soh'|'vegasinsider'>('soh');
  const [oddsUrl,setOddsUrl]=useState('https://www.sportsoddshistory.com/ncaaf-lines/');
  const [oddsWeight,setOddsWeight]=useState(0.3);
  const [out,setOut]=useState<any>(null);
  const [load,setLoad]=useState(false);
  const [err,setErr]=useState<string|null>(null);
  const onRun=async()=>{try{setLoad(true);setErr(null);setOut(null);const body:any={conferences,autoMatchups,year,week,seasonType,autoTraining,trainStartYear,trainEndYear,useStats,statsWeight,useOdds,oddsSource,oddsUrl,oddsWeight}; if(!autoTraining){const games=parseCSV(trainCSV).map(r=>({date:r.date,home_team:r.home_team,away_team:r.away_team,home_points:Number(r.home_points),away_points:Number(r.away_points),neutral_site:Number(r.neutral_site||0)})); body.games=games;} if(!autoMatchups){const matchups=parseCSV(predCSV).map(r=>({home_team:r.home_team,away_team:r.away_team,neutral_site:Number(r.neutral_site||0)})); body.matchups=matchups;} const res=await fetch('/api/predict',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const json = await res.json();
if (!res.ok) { throw new Error((json && json.error) || 'Request failed'); }
if (!json || !Array.isArray(json.predictions)) { throw new Error('Prediction response malformed'); }
setOut({ predictions: json.predictions || [], tuned_hfa: json.tuned_hfa });}catch(e:any){setErr(e?.message||'Unexpected error');}finally{setLoad(false);} };
  return (<main className="min-h-screen p-6 flex flex-col gap-6 bg-gray-50">
    <header className="flex justify-between items-end"><div><h1 className="text-3xl font-bold">CFB Predictor — Pro + Blend</h1><p className="text-gray-600">Auto training & matchups, stats & market blends.</p></div><button onClick={onRun} disabled={load} className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50">{load?'Running…':'Run Predictions'}</button></header>
    <EnvBanner/>
    <section className="bg-white rounded-2xl shadow p-4"><div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2"><span className="text-sm">Conference(s)</span><select multiple value={conferences} onChange={(e)=>{const opts=Array.from(e.target.selectedOptions).map(o=>o.value);setConferences(opts.length?opts:[...POWER4]);}} className="border rounded p-1">{POWER4.map(c=>(<option key={c} value={c}>{c}</option>))}</select></div>
      <div className="flex items-center gap-2"><span className="text-sm">Auto Training</span><input type="checkbox" checked={autoTraining} onChange={e=>setAutoTraining(e.target.checked)}/><span className="text-sm">Start</span><input type="number" value={trainStartYear} onChange={e=>setTrainStartYear(Number(e.target.value))} className="w-20 border rounded p-1"/><span className="text-sm">End</span><input type="number" value={trainEndYear} onChange={e=>setTrainEndYear(Number(e.target.value))} className="w-20 border rounded p-1"/></div>
    </div></section>
    <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl shadow p-4"><h2 className="font-semibold mb-2">Auto Week</h2><label className="inline-flex items-center gap-2"><input type="checkbox" checked={autoMatchups} onChange={e=>setAutoMatchups(e.target.checked)}/> Auto-detect matchups</label>
        <div className="mt-2 flex flex-wrap gap-3 items-center"><span className="text-sm">Year</span><input type="number" value={year} onChange={e=>setYear(Number(e.target.value))} className="w-24 border rounded p-1"/><span className="text-sm">Week</span><input type="number" min={1} max={16} value={week} onChange={e=>setWeek(Number(e.target.value))} className="w-20 border rounded p-1"/><span className="text-sm">Type</span><select value={seasonType} onChange={e=>setSeasonType(e.target.value as any)} className="border rounded p-1"><option value="regular">Regular</option><option value="postseason">Postseason</option></select></div></div>
      <div className="bg-white rounded-2xl shadow p-4"><h2 className="font-semibold mb-2">Blending Controls</h2><div className="grid grid-cols-2 gap-3"><div><label className="inline-flex items-center gap-2"><input type="checkbox" checked={useStats} onChange={e=>setUseStats(e.target.checked)}/> Use CFBD stats</label><label className="block text-sm mt-2">Stats weight (0–0.8)</label><input type="number" min={0} max={0.8} step={0.05} value={statsWeight} onChange={e=>setStatsWeight(Number(e.target.value))} className="w-full border rounded p-1"/></div><div><label className="inline-flex items-center gap-2"><input type="checkbox" checked={useOdds} onChange={e=>setUseOdds(e.target.checked)}/> Use market odds</label><label className="block text-sm mt-2">Odds weight (0–0.8)</label><input type="number" min={0} max={0.8} step={0.05} value={oddsWeight} onChange={e=>setOddsWeight(Number(e.target.value))} className="w-full border rounded p-1"/><label className="block text-sm mt-2">Source</label><select value={oddsSource} onChange={e=>setOddsSource(e.target.value as any)} className="border rounded p-1 w-full"><option value="soh">SportsOddsHistory</option><option value="vegasinsider">VegasInsider</option></select><label className="block text-sm mt-2">Odds URL</label><input value={oddsUrl} onChange={e=>setOddsUrl(e.target.value)} className="border rounded p-1 w-full"/></div></div></div>
    </section>
    {err && <div className="bg-red-100 text-red-800 rounded-xl p-3">{err}</div>}
    {out && (
<section className="bg-white rounded-2xl shadow p-4 overflow-x-auto"><h2 className="font-semibold mb-2">Predictions</h2><table className="min-w-full text-sm"><thead><tr className="text-left border-b"><th className="py-1 pr-4">Home</th><th className="py-1 pr-4">Away</th><th className="py-1 pr-4">Neutral</th><th className="py-1 pr-4">Elo %</th><th className="py-1 pr-4">Stats %</th><th className="py-1 pr-4">Market %</th><th className="py-1 pr-4">Final %</th><th className="py-1 pr-4">Spread</th><th className="py-1 pr-4">Favorite</th></tr></thead><tbody>{out.predictions?.map((p:any,i:number)=>(<tr key={i} className="border-b"><td className="py-1 pr-4">{p.home_team}</td><td className="py-1 pr-4">{p.away_team}</td><td className="py-1 pr-4">{p.neutral_site?'Yes':'No'}</td><td className="py-1 pr-4">{Number(p.p_elo*100).toFixed(1)}%</td><td className="py-1 pr-4">{(p.p_stats*100).toFixed(1)}%</td><td className="py-1 pr-4">{p.p_market!=null?(p.p_market*100).toFixed(1)+'%':'—'}</td><td className="py-1 pr-4 font-medium">{(p.home_win_prob*100).toFixed(1)}%</td><td className="py-1 pr-4">{p.proj_spread.toFixed(1)}</td><td className="py-1 pr-4 font-medium">{p.favorite}</td></tr>))}</tbody></table><p className="text-xs text-gray-500 mt-2">Tuned HFA: {out.tuned_hfa?.toFixed?.(2)}</p></section>)}
    <footer className="text-xs text-gray-500 mt-8">Set CFBD_API_KEY in Vercel env vars. Base URL auto-detected if NEXT_PUBLIC_BASE_URL is missing. Installable PWA enabled.</footer>
  </main>);
}
