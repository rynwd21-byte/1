
import { useEffect, useMemo, useState } from "react";

function NumberField({label, value, onChange}){
  return (
    <label style={{display:"grid", gap:4}}>
      <span>{label}</span>
      <input type="number" value={value}
        onChange={e=>onChange(parseFloat(e.target.value))}
        step="1" />
    </label>
  );
}

function TeamPicker({apiUrl, label, value, onChange}){
  const [q, setQ] = useState("");
  const [options, setOptions] = useState([]);
  useEffect(()=>{
    let active = true;
    const run = async () => {
      const url = new URL("/teams/search", apiUrl);
      if(q) url.searchParams.set("q", q);
      const res = await fetch(url.toString());
      if(!res.ok) return;
      const data = await res.json();
      if(active) setOptions(data);
    };
    run();
    return ()=>{ active = false; };
  }, [q, apiUrl]);
  return (
    <div style={{display:"grid", gap:6}}>
      <label>{label}</label>
      <input
        placeholder="Search team..."
        value={q}
        onChange={e=>setQ(e.target.value)}
      />
      <select value={value} onChange={e=>onChange(e.target.value)}>
        <option value="">-- choose --</option>
        {options.map(o=> <option key={o.team_id} value={o.name}>{o.name}</option>)}
      </select>
    

<h2 style={{marginTop:24}}>Automation helpers</h2>
<div style={{display:"flex", gap:12, flexWrap:"wrap"}}>
  <button onClick={async ()=>{
    try{ await fetch(`${apiUrl}/ingest/teams`, {method:"POST"}); alert("Teams ingested"); }catch(e){ alert(e); }
  }}>Ingest Teams</button>
  <button onClick={async ()=>{
    const season = prompt("Season to ingest (e.g., 2024):");
    if(!season) return;
    try{ await fetch(`${apiUrl}/ingest/games?season=${encodeURIComponent(season)}`, {method:"POST"}); alert("Games ingested"); }catch(e){ alert(e); }
  }}>Ingest Games</button>
  <button onClick={async ()=>{
    const season = prompt("Season to seed ratings from (e.g., 2024):");
    if(!season) return;
    try{ await fetch(`${apiUrl}/ratings/seed?season=${encodeURIComponent(season)}&scale=10`, {method:"POST"}); alert("Ratings seeded"); }catch(e){ alert(e); }
  }}>Seed Ratings</button>
  <button onClick={async ()=>{
    try{ const r = await fetch(`${apiUrl}/cron/nightly`); const j = await r.json(); alert("Cron hit: " + JSON.stringify(j)); }catch(e){ alert(e); }
  }}>Run Nightly Cron Now</button>
</div>

<h2 style={{marginTop:24}}>Series by Name</h2>
<div style={{display:"flex", gap:12, alignItems:"center"}}>
  <button onClick={async ()=>{
    if(!homeName || !awayName){ alert("Pick both teams first."); return; }
    setLoading(true); setError(null); setSeries(null);
    try {
      const res = await fetch(`${apiUrl}/simulate-series-by-name`, {
        method:"POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({home_name: homeName, away_name: awayName, n})
      });
      if(!res.ok) throw new Error(await res.text());
      setSeries(await res.json());
    } catch(e){ setError(String(e)); } finally { setLoading(false); }
  }} disabled={loading} style={{padding:"12px 20px", borderRadius:12}}>
    {loading ? "Running…" : "Run Series by Name"}
  </button>
</div>

    </div>
  );
}


function Histogram({values, title}){
  if(!values || values.length === 0) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const bins = 20;
  const width = 600, height = 200, padding = 24;
  const step = (max - min) / bins || 1;
  const counts = new Array(bins).fill(0);
  values.forEach(v=>{
    const idx = Math.min(bins-1, Math.max(0, Math.floor((v - min) / step)));
    counts[idx]++;
  });
  const maxCount = Math.max(...counts) || 1;
  const barW = (width - padding*2) / bins;
  return (
    <svg width={width} height={height} style={{border:'1px solid #ddd', borderRadius:12}}>
      <text x={padding} y={16} fontSize={12}>{title}</text>
      {counts.map((c,i)=>{
        const barH = (c / maxCount) * (height - padding*2);
        const x = padding + i * barW;
        const y = height - padding - barH;
        return <rect key={i} x={x} y={y} width={Math.max(1, barW-2)} height={barH} />;
      })}
      <text x={padding} y={height-4} fontSize={10}>{min.toFixed(1)}</text>
      <text x={width-padding-24} y={height-4} fontSize={10} textAnchor="end">{max.toFixed(1)}</text>
    </svg>
  );
}

function WinGauge({p}){
  const pct = Math.round(p*100);
  return (
    <div style={{display:'grid', gap:6, width:600}}>
      <div style={{display:'flex', justifyContent:'space-between'}}>
        <b>Home win %</b><span>{pct}%</span>
      </div>
      <div style={{height:18, background:'#eee', borderRadius:12, overflow:'hidden'}}>
        <div style={{width:`${pct}%`, height:'100%'}}></div>
      </div>
    </div>
  );
}

export default function App(){
  const [apiUrl, setApiUrl] = useState("http://localhost:8000");
  const [homeName, setHomeName] = useState("");
  const [awayName, setAwayName] = useState("");
  const [home, setHome] = useState({
    name: "Home U", off_rush: 20, off_pass: 20, def_rush: 10, def_pass: 10, st: 0
  });
  const [away, setAway] = useState({
    name: "Away Tech", off_rush: 10, off_pass: 10, def_rush: 20, def_pass: 20, st: 0
  });
  const [result, setResult] = useState(null);
  const [series, setSeries] = useState(null);
  const [n, setN] = useState(500);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const post = async (path, body) => {
    const res = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body)
    });
    if(!res.ok) throw new Error(await res.text());
    return await res.json();
  };

  const sim = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const data = await post("/simulate-game", {home, away});
      setResult(data);
    } catch (e){ setError(String(e)); } finally { setLoading(false); }
  };

  const simByName = async () => {
    if(!homeName || !awayName){ setError("Pick both teams first."); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const data = await post("/simulate-by-name", {home_name: homeName, away_name: awayName});
      setResult(data);
    } catch (e){ setError(String(e)); } finally { setLoading(false); }
  };

  const runSeries = async () => {
    setLoading(true); setError(null); setSeries(null);
    try {
      const data = await post("/simulate-series", {home, away, n, include_samples: true});
      setSeries(data);
    } catch (e){ setError(String(e)); } finally { setLoading(false); }
  };

  return (
    <div style={{maxWidth:1000, margin:"40px auto", fontFamily:"system-ui, sans-serif"}}>
      <h1>CFB Drive Sim — UI</h1>
      <p>Set your API URL (deploy the backend to Vercel or run locally):</p>
      <input value={apiUrl} onChange={e=>setApiUrl(e.target.value)} style={{width:"100%"}} />

      <h2 style={{marginTop:16}}>Simulate using team names (from DB)</h2>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16}}>
        <TeamPicker apiUrl={apiUrl} label="Home" value={homeName} onChange={setHomeName} />
        <TeamPicker apiUrl={apiUrl} label="Away" value={awayName} onChange={setAwayName} />
      </div>
      <div style={{display:"flex", gap:12, marginTop:8}}>
        <button onClick={simByName} disabled={loading} style={{padding:"10px 16px", borderRadius:12}}>
          {loading ? "Simulating…" : "Simulate by Name"}
        </button>
      </div>

      <h2 style={{marginTop:24}}>Or simulate with manual ratings</h2>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:24}}>
        <section style={{padding:16, border:"1px solid #ddd", borderRadius:12}}>
          <h3>Home</h3>
          <input value={home.name} onChange={e=>setHome({...home, name:e.target.value})} />
          <NumberField label="Off Rush" value={home.off_rush} onChange={v=>setHome({...home, off_rush:v})} />
          <NumberField label="Off Pass" value={home.off_pass} onChange={v=>setHome({...home, off_pass:v})} />
          <NumberField label="Def Rush" value={home.def_rush} onChange={v=>setHome({...home, def_rush:v})} />
          <NumberField label="Def Pass" value={home.def_pass} onChange={v=>setHome({...home, def_pass:v})} />
          <NumberField label="Special Teams" value={home.st} onChange={v=>setHome({...home, st:v})} />
        </section>
        <section style={{padding:16, border:"1px solid #ddd", borderRadius:12}}>
          <h3>Away</h3>
          <input value={away.name} onChange={e=>setAway({...away, name:e.target.value})} />
          <NumberField label="Off Rush" value={away.off_rush} onChange={v=>setAway({...away, off_rush:v})} />
          <NumberField label="Off Pass" value={away.off_pass} onChange={v=>setAway({...away, off_pass:v})} />
          <NumberField label="Def Rush" value={away.def_rush} onChange={v=>setAway({...away, def_rush:v})} />
          <NumberField label="Def Pass" value={away.def_pass} onChange={v=>setAway({...away, def_pass:v})} />
          <NumberField label="Special Teams" value={away.st} onChange={v=>setAway({...away, st:v})} />
        </section>
      </div>

      <div style={{display:"flex", gap:12, marginTop:16}}>
        <button onClick={sim} disabled={loading} style={{padding:"12px 20px", borderRadius:12}}>
          {loading ? "Simulating…" : "Simulate Game"}
        </button>
        <input type="number" value={n} onChange={e=>setN(parseInt(e.target.value||'0'))} />
        <button onClick={runSeries} disabled={loading} style={{padding:"12px 20px", borderRadius:12}}>
          {loading ? "Running…" : "Run Series"}
        </button>
      </div>

      {error && <pre style={{color:"crimson"}}>{error}</pre>}
      {result && (
        <div style={{marginTop:16}}>
          <h3>Result</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
      
{series && (
  <div style={{marginTop:16}}>
    <h3>Series</h3>
    <pre>{JSON.stringify(series, null, 2)}</pre>
    {series.samples_detail ? (()=>{
      const hs = series.samples_detail.home || [];
      const as = series.samples_detail.away || [];
      const marginValues = hs.map((h,i)=> h - (as[i] || 0));
      return (
        <div style={{display:'grid', gap:12, marginTop:12}}>
          <WinGauge p={series.home_win_pct} />
          <Histogram values={marginValues} title="Point margin (Home - Away)" />
        </div>
      );
    })() : <i>Run with include_samples=true (the button already does this) to see charts.</i>}
  </div>
)}

    

<h2 style={{marginTop:24}}>Automation helpers</h2>
<div style={{display:"flex", gap:12, flexWrap:"wrap"}}>
  <button onClick={async ()=>{
    try{ await fetch(`${apiUrl}/ingest/teams`, {method:"POST"}); alert("Teams ingested"); }catch(e){ alert(e); }
  }}>Ingest Teams</button>
  <button onClick={async ()=>{
    const season = prompt("Season to ingest (e.g., 2024):");
    if(!season) return;
    try{ await fetch(`${apiUrl}/ingest/games?season=${encodeURIComponent(season)}`, {method:"POST"}); alert("Games ingested"); }catch(e){ alert(e); }
  }}>Ingest Games</button>
  <button onClick={async ()=>{
    const season = prompt("Season to seed ratings from (e.g., 2024):");
    if(!season) return;
    try{ await fetch(`${apiUrl}/ratings/seed?season=${encodeURIComponent(season)}&scale=10`, {method:"POST"}); alert("Ratings seeded"); }catch(e){ alert(e); }
  }}>Seed Ratings</button>
  <button onClick={async ()=>{
    try{ const r = await fetch(`${apiUrl}/cron/nightly`); const j = await r.json(); alert("Cron hit: " + JSON.stringify(j)); }catch(e){ alert(e); }
  }}>Run Nightly Cron Now</button>
</div>

<h2 style={{marginTop:24}}>Series by Name</h2>
<div style={{display:"flex", gap:12, alignItems:"center"}}>
  <button onClick={async ()=>{
    if(!homeName || !awayName){ alert("Pick both teams first."); return; }
    setLoading(true); setError(null); setSeries(null);
    try {
      const res = await fetch(`${apiUrl}/simulate-series-by-name`, {
        method:"POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({home_name: homeName, away_name: awayName, n})
      });
      if(!res.ok) throw new Error(await res.text());
      setSeries(await res.json());
    } catch(e){ setError(String(e)); } finally { setLoading(false); }
  }} disabled={loading} style={{padding:"12px 20px", borderRadius:12}}>
    {loading ? "Running…" : "Run Series by Name"}
  </button>
</div>

    </div>
  );
}
