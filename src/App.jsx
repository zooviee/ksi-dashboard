import { useState, useEffect, useReducer, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, AreaChart, Area, ReferenceLine, Line,
  RadarChart, PolarGrid, PolarAngleAxis, Radar, Legend,
} from "recharts";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  fatal:"#E74C3C",fatalDim:"rgba(231,76,60,0.18)",
  safe:"#2ECC71",safeDim:"rgba(46,204,113,0.18)",
  warn:"#F39C12",warnDim:"rgba(243,156,18,0.18)",
  info:"#3498DB",infoDim:"rgba(52,152,219,0.18)",
  purple:"#9B59B6",
  bg:"#0B0F1A",surface:"#131929",card:"#1A2236",
  border:"rgba(255,255,255,0.07)",text:"#F0F4FF",
  muted:"#8896B0",dim:"#4A5568",
};

const rateColor = r => r>20?C.fatal:r>16?"#E67E22":r>13?C.warn:C.safe;

// ── Filter reducer ────────────────────────────────────────────────────────────
const INIT = { wards:[], yearRange:[2006,2023], hours:[], lights:[], surfs:[], users:[], ctrls:[], fatalOnly:false };

function toggle(arr, v){ const s=new Set(arr); s.has(v)?s.delete(v):s.add(v); return[...s]; }

function reducer(state, a){
  switch(a.type){
    case "TOGGLE_WARD":   return{...state,wards:toggle(state.wards,a.v)};
    case "TOGGLE_LIGHT":  return{...state,lights:toggle(state.lights,a.v)};
    case "TOGGLE_SURF":   return{...state,surfs:toggle(state.surfs,a.v)};
    case "TOGGLE_USER":   return{...state,users:toggle(state.users,a.v)};
    case "TOGGLE_CTRL":   return{...state,ctrls:toggle(state.ctrls,a.v)};
    case "TOGGLE_HOUR":   return{...state,hours:toggle(state.hours,a.v)};
    case "SET_YEAR":      return{...state,yearRange:a.v};
    case "TOGGLE_FATAL":  return{...state,fatalOnly:!state.fatalOnly};
    case "RESET":         return{...INIT};
    default: return state;
  }
}

// ── Data loading ──────────────────────────────────────────────────────────────
function useRaw(){
  const [raw,setRaw]=useState(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    fetch("/ksi_data.json").then(r=>r.json()).then(d=>{setRaw(d);setLoading(false);}).catch(()=>setLoading(false));
  },[]);
  return{raw,loading};
}

// ── Fast mask computation ─────────────────────────────────────────────────────
function computeMask(raw,f){
  const n=raw.n, m=new Uint8Array(n);
  const{yearRange,wards,lights,surfs,users,ctrls,hours,fatalOnly}=f;
  for(let i=0;i<n;i++){
    if(raw.year[i]<yearRange[0]||raw.year[i]>yearRange[1])continue;
    if(wards.length&&!wards.includes(raw.ward[i]))continue;
    if(lights.length&&!lights.includes(raw.light[i]))continue;
    if(surfs.length&&!surfs.includes(raw.surf[i]))continue;
    if(users.length&&!users.includes(raw.user[i]))continue;
    if(ctrls.length&&!ctrls.includes(raw.ctrl[i]))continue;
    if(hours.length&&!hours.includes(raw.hour[i]))continue;
    if(fatalOnly&&!raw.fatal[i])continue;
    m[i]=1;
  }
  return m;
}

function aggBy(raw,mask,key,vals){
  const tot=new Int32Array(vals.length),fat=new Int32Array(vals.length);
  for(let i=0;i<raw.n;i++){
    if(!mask[i])continue;
    const idx=raw[key][i]; tot[idx]++; if(raw.fatal[i])fat[idx]++;
  }
  return vals.map((label,i)=>({label,total:tot[i],fatal:fat[i],rate:tot[i]?+(fat[i]/tot[i]*100).toFixed(1):0}));
}

function aggYear(raw,mask){
  const y={};
  for(let i=0;i<raw.n;i++){
    if(!mask[i])continue;
    const yr=raw.year[i];
    if(!y[yr])y[yr]={total:0,fatal:0};
    y[yr].total++;if(raw.fatal[i])y[yr].fatal++;
  }
  return Object.entries(y).sort(([a],[b])=>+a-+b).map(([yr,v])=>({year:+yr,...v,rate:+(v.fatal/v.total*100).toFixed(1)}));
}

function aggHour(raw,mask){
  const b=Array.from({length:24},()=>({total:0,fatal:0}));
  for(let i=0;i<raw.n;i++){if(!mask[i])continue;b[raw.hour[i]].total++;if(raw.fatal[i])b[raw.hour[i]].fatal++;}
  return b.map((v,h)=>({h:h.toString().padStart(2,"0"),hour:h,...v,rate:v.total?+(v.fatal/v.total*100).toFixed(1):0}));
}

function aggTopInt(raw,mask){
  const c={};
  for(let i=0;i<raw.n;i++){
    if(!mask[i]||!raw.fatal[i])continue;
    const k=`${raw.st1V[raw.st1[i]]} & ${raw.st2V[raw.st2[i]]}`;
    c[k]=(c[k]||0)+1;
  }
  return Object.entries(c).sort(([,a],[,b])=>b-a).slice(0,10).map(([label,fatal],i)=>({rank:i+1,label,fatal}));
}

function getKpi(raw,mask){
  let tot=0,fat=0;
  for(let i=0;i<raw.n;i++){if(!mask[i])continue;tot++;if(raw.fatal[i])fat++;}
  return{total:tot,fatal:fat,rate:tot?+(fat/tot*100).toFixed(1):0};
}

// ── Small UI components ───────────────────────────────────────────────────────
const Chip=({label,color=C.fatal,onRemove})=>(
  <span style={{display:"inline-flex",alignItems:"center",gap:5,background:`${color}22`,
    border:`1px solid ${color}44`,color,borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:600}}>
    {label}<span onClick={onRemove} style={{cursor:"pointer",fontSize:14,lineHeight:1,opacity:0.7}}>×</span>
  </span>
);

const KPI=({label,value,sub,color=C.info})=>(
  <div style={{background:C.card,borderRadius:12,padding:"15px 18px",
    border:`1px solid ${C.border}`,borderLeft:`3px solid ${color}`}}>
    <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>{label}</div>
    <div style={{fontSize:26,fontWeight:800,color,fontVariantNumeric:"tabular-nums",lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:11,color:C.muted,marginTop:5}}>{sub}</div>}
  </div>
);

const CardBox=({children,style={}})=>(
  <div style={{background:C.card,borderRadius:12,padding:16,border:`1px solid ${C.border}`,...style}}>{children}</div>
);

const STitle=({children,sub,count})=>(
  <div style={{marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
    <div>
      <div style={{fontSize:13,fontWeight:700,color:C.text}}>{children}</div>
      {sub&&<div style={{fontSize:11,color:C.muted,marginTop:2}}>{sub}</div>}
    </div>
    {count!==undefined&&<span style={{fontSize:11,color:C.muted,background:C.surface,
      padding:"2px 8px",borderRadius:99,border:`1px solid ${C.border}`}}>{count.toLocaleString()}</span>}
  </div>
);

const Tip=({active,payload,label,pct})=>{
  if(!active||!payload?.length)return null;
  return(
    <div style={{background:"#0D1321",border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",fontSize:12}}>
      <div style={{color:C.muted,marginBottom:6,fontWeight:600}}>{label}</div>
      {payload.map((p,i)=>(
        <div key={i} style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:2}}>
          <span style={{color:C.muted}}>{p.name}</span>
          <span style={{fontWeight:700,color:p.color||C.text}}>{pct?+(p.value).toFixed(1)+"%":p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

// Clickable cross-filter bar chart
const XBar=({data,labelKey="label",valueKey="rate",activeSet,onToggle,colorFn,height=160,pct=true,barSize=18,yFmt})=>(
  <ResponsiveContainer width="100%" height={height}>
    <BarChart data={data} barSize={barSize}
      onClick={e=>e?.activePayload&&onToggle&&onToggle(e.activePayload[0]?.payload)}>
      <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false}/>
      <XAxis dataKey={labelKey} tick={{fill:C.muted,fontSize:9}} tickLine={false} axisLine={false}/>
      <YAxis tick={{fill:C.muted,fontSize:9}} tickLine={false} axisLine={false}
        tickFormatter={yFmt||(v=>pct?v+"%":v)}/>
      <Tooltip content={<Tip pct={pct}/>}/>
      <Bar dataKey={valueKey} name={pct?"Fatal rate":"Count"} radius={[3,3,0,0]} cursor="pointer">
        {data.map((d,i)=>{
          const isActive=!activeSet||activeSet.size===0||activeSet.has(i);
          const fill=colorFn?colorFn(d,i):rateColor(d[valueKey]);
          return<Cell key={i} fill={isActive?fill:`${fill}33`}
            stroke={activeSet?.has(i)?C.text:"none"} strokeWidth={activeSet?.has(i)?1.5:0}/>;
        })}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

// ── Filter chip bar ───────────────────────────────────────────────────────────
const FilterBar=({f,dispatch,raw})=>{
  const hasActive=f.wards.length||f.lights.length||f.surfs.length||f.users.length||
    f.ctrls.length||f.hours.length||f.fatalOnly||f.yearRange[0]!==2006||f.yearRange[1]!==2023;
  if(!hasActive)return null;
  return(
    <div style={{background:`${C.fatal}10`,border:`1px solid ${C.fatal}30`,borderRadius:10,
      padding:"8px 14px",marginBottom:12,display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
      <span style={{fontSize:11,color:C.muted}}>Active filters:</span>
      {(f.yearRange[0]!==2006||f.yearRange[1]!==2023)&&
        <Chip label={`${f.yearRange[0]}–${f.yearRange[1]}`} color={C.info}
          onRemove={()=>dispatch({type:"SET_YEAR",v:[2006,2023]})}/>}
      {f.fatalOnly&&<Chip label="Fatal only" color={C.fatal} onRemove={()=>dispatch({type:"TOGGLE_FATAL"})}/>}
      {raw&&f.wards.map(i=><Chip key={i} label={raw.wardV[i]?.split(" (")[0]} color={C.purple}
        onRemove={()=>dispatch({type:"TOGGLE_WARD",v:i})}/>)}
      {raw&&f.lights.map(i=><Chip key={i} label={raw.lightV[i]} color={C.warn}
        onRemove={()=>dispatch({type:"TOGGLE_LIGHT",v:i})}/>)}
      {raw&&f.users.map(i=><Chip key={i} label={raw.userV[i]} color={C.info}
        onRemove={()=>dispatch({type:"TOGGLE_USER",v:i})}/>)}
      {raw&&f.surfs.map(i=><Chip key={i} label={raw.surfV[i]} color={C.safe}
        onRemove={()=>dispatch({type:"TOGGLE_SURF",v:i})}/>)}
      {raw&&f.ctrls.map(i=><Chip key={i} label={raw.ctrlV[i]} color={C.purple}
        onRemove={()=>dispatch({type:"TOGGLE_CTRL",v:i})}/>)}
      {f.hours.map(h=><Chip key={h} label={`${h.toString().padStart(2,"0")}:00`} color={C.warn}
        onRemove={()=>dispatch({type:"TOGGLE_HOUR",v:h})}/>)}
      <button onClick={()=>dispatch({type:"RESET"})} style={{marginLeft:"auto",fontSize:11,color:C.muted,
        background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 10px",cursor:"pointer"}}>
        Clear all ×
      </button>
    </div>
  );
};

// ── Drill-through panel ───────────────────────────────────────────────────────
const DrillPanel=({wardIdx,raw,mask,onClose})=>{
  if(wardIdx===null)return null;
  const wm=new Uint8Array(raw.n);
  for(let i=0;i<raw.n;i++)if(mask[i]&&raw.ward[i]===wardIdx)wm[i]=1;
  const tot=wm.reduce((a,b)=>a+b,0);
  const fat=Array.from({length:raw.n},(_,i)=>wm[i]&&raw.fatal[i]?1:0).reduce((a,b)=>a+b,0);
  const hourD=aggHour(raw,wm);
  const lightD=aggBy(raw,wm,"light",raw.lightV).filter(d=>d.total>0).sort((a,b)=>b.rate-a.rate);
  const userD=aggBy(raw,wm,"user",raw.userV).filter(d=>d.total>0).sort((a,b)=>b.rate-a.rate);

  return(
    <div style={{position:"fixed",top:0,right:0,width:400,height:"100vh",
      background:C.surface,borderLeft:`1px solid ${C.border}`,zIndex:1000,
      overflowY:"auto",padding:20,animation:"si 0.25s ease"}}>
      <style>{`@keyframes si{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:C.text}}>{raw.wardV[wardIdx]}</div>
          <div style={{fontSize:11,color:C.muted,marginTop:2}}>Ward drill-through</div>
        </div>
        <button onClick={onClose} style={{background:"transparent",border:`1px solid ${C.border}`,
          color:C.muted,fontSize:18,borderRadius:8,width:32,height:32,cursor:"pointer"}}>×</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
        <KPI label="Total KSI" value={tot.toLocaleString()} color={C.info}/>
        <KPI label="Fatal" value={fat} sub={`${tot?+(fat/tot*100).toFixed(1):0}% rate`} color={C.fatal}/>
      </div>
      <CardBox style={{marginBottom:10}}>
        <STitle sub="Hourly fatality rate">Hourly pattern</STitle>
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={hourD} barSize={8}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false}/>
            <XAxis dataKey="h" tick={{fill:C.muted,fontSize:7}} tickLine={false} axisLine={false}/>
            <YAxis tick={{fill:C.muted,fontSize:7}} tickLine={false} axisLine={false} tickFormatter={v=>v+"%"}/>
            <Tooltip content={<Tip pct/>}/>
            <Bar dataKey="rate" name="Fatal rate" radius={[2,2,0,0]}>
              {hourD.map((d,i)=><Cell key={i} fill={rateColor(d.rate)}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardBox>
      {[["Lighting",lightD,raw.lightV],["Road user",userD,raw.userV]].map(([title,d])=>(
        <CardBox key={title} style={{marginBottom:10}}>
          <STitle sub="% fatal">{title}</STitle>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {d.map(row=>(
              <div key={row.label} style={{display:"flex",alignItems:"center",gap:8,fontSize:11}}>
                <span style={{width:80,color:C.muted,flexShrink:0,fontSize:10,textTransform:"capitalize"}}>{row.label}</span>
                <div style={{flex:1,height:7,background:C.surface,borderRadius:4}}>
                  <div style={{width:`${Math.min(row.rate/35*100,100)}%`,height:"100%",borderRadius:4,background:rateColor(row.rate)}}/>
                </div>
                <span style={{color:rateColor(row.rate),fontWeight:700,width:34,textAlign:"right"}}>{row.rate}%</span>
              </div>
            ))}
          </div>
        </CardBox>
      ))}
    </div>
  );
};

// ── Pages ─────────────────────────────────────────────────────────────────────

function PageOverview({raw,mask,f,dispatch}){
  const yearD=useMemo(()=>aggYear(raw,mask),[mask]);
  const hourD=useMemo(()=>aggHour(raw,mask),[mask]);
  const kpi=useMemo(()=>getKpi(raw,mask),[mask]);
  const aH=new Set(f.hours);
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
        <KPI label="Filtered KSI" value={kpi.total.toLocaleString()} sub="Killed or seriously injured" color={C.info}/>
        <KPI label="Fatal" value={kpi.fatal.toLocaleString()} sub={`${kpi.rate}% of filtered KSI`} color={C.fatal}/>
        <KPI label="Non-fatal" value={(kpi.total-kpi.fatal).toLocaleString()} sub="Serious injury" color={C.safe}/>
        <KPI label="Fatality rate" value={`${kpi.rate}%`}
          sub={`vs 14.1% city average`} color={kpi.rate>14.1?C.fatal:C.safe}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"3fr 1fr",gap:12,marginBottom:12}}>
        <CardBox>
          <STitle sub="Fatal collisions by year · COVID dip 2020 · data-lag zone excludes 2024–2026" count={kpi.total}>
            Trend over time
          </STitle>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={yearD}>
              <defs>
                <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.fatal} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={C.fatal} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="year" tick={{fill:C.muted,fontSize:10}} tickLine={false}/>
              <YAxis tick={{fill:C.muted,fontSize:10}} tickLine={false} axisLine={false}/>
              <Tooltip content={<Tip/>}/>
              <ReferenceLine x={2020} stroke={C.warn} strokeDasharray="4 4"
                label={{value:"COVID",position:"top",fill:C.warn,fontSize:9}}/>
              <Area type="monotone" dataKey="fatal" name="Fatal" stroke={C.fatal} strokeWidth={2.5} fill="url(#tg)"/>
            </AreaChart>
          </ResponsiveContainer>
        </CardBox>
        <CardBox>
          <STitle sub="Fatal / total KSI">Seasonal rate</STitle>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={[{s:"Winter",r:14.4},{s:"Spring",r:12.8},{s:"Summer",r:15.6},{s:"Fall",r:14.9}]} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false}/>
              <XAxis dataKey="s" tick={{fill:C.muted,fontSize:10}} tickLine={false} axisLine={false}/>
              <YAxis tick={{fill:C.muted,fontSize:9}} tickLine={false} axisLine={false} tickFormatter={v=>v+"%"} domain={[10,18]}/>
              <Tooltip content={<Tip pct/>}/>
              <ReferenceLine y={14.1} stroke={C.muted} strokeDasharray="3 3"/>
              <Bar dataKey="r" name="Fatal rate" radius={[4,4,0,0]}>
                {[C.info,C.safe,C.fatal,C.warn].map((c,i)=><Cell key={i} fill={c}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardBox>
      </div>
      <CardBox>
        <STitle sub="Click any bar to cross-filter the entire dashboard by that hour of day">
          Fatality rate by hour — click to cross-filter ↓
        </STitle>
        <XBar data={hourD} labelKey="h" valueKey="rate" activeSet={aH}
          onToggle={d=>dispatch({type:"TOGGLE_HOUR",v:d.hour})}
          colorFn={d=>rateColor(d.rate)} height={140} barSize={18}/>
        <div style={{display:"flex",gap:14,marginTop:8,fontSize:10,flexWrap:"wrap"}}>
          {[[C.fatal,"≥20%"],["#E67E22","16–20%"],[C.warn,"13–16%"],[C.safe,"<13%"]].map(([c,l])=>(
            <span key={l} style={{display:"flex",alignItems:"center",gap:4,color:C.muted}}>
              <span style={{width:8,height:8,borderRadius:2,background:c,flexShrink:0}}/>{l}
            </span>
          ))}
          {f.hours.length>0&&<span style={{color:C.fatal,fontSize:10,marginLeft:8}}>
            ● {f.hours.length} hour(s) selected — cross-filtering all charts
          </span>}
        </div>
      </CardBox>
    </div>
  );
}

function PageGeo({raw,mask,f,dispatch}){
  const [drill,setDrill]=useState(null);
  const wardD=useMemo(()=>aggBy(raw,mask,"ward",raw.wardV),[mask]);
  const topInt=useMemo(()=>aggTopInt(raw,mask),[mask]);
  const max=Math.max(...wardD.map(w=>w.rate),1);
  const aW=new Set(f.wards);

  return(
    <div>
      <DrillPanel wardIdx={drill} raw={raw} mask={mask} onClose={()=>setDrill(null)}/>
      <div style={{background:`${C.info}10`,border:`1px solid ${C.info}25`,borderRadius:8,
        padding:"7px 12px",marginBottom:12,fontSize:11,color:C.info}}>
        ◈ Click ward block to cross-filter all charts · Click ward name button for drill-through panel →
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <CardBox>
          <STitle sub="Shaded by fatality rate · click to filter · number = ward ID">
            Ward choropleth
          </STitle>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:3,marginBottom:10}}>
            {wardD.map(w=>{
              const t=Math.max(0,Math.min(1,(w.rate-8)/(max-8)));
              const r=Math.round(231*t+52*(1-t)),g=Math.round(76*t+152*(1-t)),b=Math.round(60*t+219*(1-t));
              const idx=raw.wardV.indexOf(w.label);
              const isActive=aW.size===0||aW.has(idx);
              const num=w.label.match(/\((\d+)\)/)?.[1]||"?";
              return(
                <div key={w.label} onClick={()=>dispatch({type:"TOGGLE_WARD",v:idx})}
                  title={`${w.label}\n${w.total.toLocaleString()} KSI · ${w.fatal} fatal · ${w.rate}%`}
                  style={{background:`rgba(${r},${g},${b},${isActive?0.3+t*0.55:0.08})`,
                    borderRadius:6,padding:"5px 3px",textAlign:"center",cursor:"pointer",
                    border:aW.has(idx)?`2px solid ${C.text}`:`1px solid ${isActive?"rgba(255,255,255,0.15)":C.border}`,
                    opacity:isActive?1:0.35,transition:"all 0.15s"}}>
                  <div style={{fontSize:11,fontWeight:800,color:C.text}}>{num}</div>
                  <div style={{fontSize:8,color:"rgba(255,255,255,0.75)"}}>{w.rate.toFixed(0)}%</div>
                  <div style={{fontSize:7,color:C.fatal}}>▲{w.fatal}</div>
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,fontSize:10,color:C.muted,marginBottom:10}}>
            <span>Low</span>
            <div style={{flex:1,height:5,borderRadius:3,background:"linear-gradient(to right,#3498DB,#F39C12,#E74C3C)"}}/>
            <span>High</span>
            {aW.size>0&&<button onClick={()=>dispatch({type:"RESET"})} style={{fontSize:10,color:C.muted,
              background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,padding:"2px 7px",cursor:"pointer"}}>clear</button>}
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {wardD.filter(w=>w.total>0).sort((a,b)=>b.rate-a.rate).slice(0,6).map(w=>{
              const idx=raw.wardV.indexOf(w.label);
              return(
                <button key={w.label} onClick={()=>setDrill(idx)} style={{fontSize:10,background:C.fatalDim,
                  color:C.fatal,border:`1px solid ${C.fatal}44`,borderRadius:6,padding:"2px 8px",cursor:"pointer"}}>
                  {w.label.split(" (")[0]} {w.rate}% →
                </button>
              );
            })}
          </div>
        </CardBox>

        <CardBox>
          <STitle sub="Click to filter · all 25 wards ranked">Ward ranking</STitle>
          <div style={{overflowY:"auto",maxHeight:330,display:"flex",flexDirection:"column",gap:3}}>
            {wardD.filter(w=>w.total>0).sort((a,b)=>b.rate-a.rate).map((w,i)=>{
              const idx=raw.wardV.indexOf(w.label);
              const isActive=aW.size===0||aW.has(idx);
              return(
                <div key={w.label} onClick={()=>dispatch({type:"TOGGLE_WARD",v:idx})}
                  style={{display:"flex",alignItems:"center",gap:6,fontSize:11,cursor:"pointer",
                    opacity:isActive?1:0.4,padding:"2px 4px",borderRadius:4,
                    background:aW.has(idx)?`${C.purple}22`:"transparent",transition:"all 0.1s"}}>
                  <span style={{width:18,color:C.muted,textAlign:"right",flexShrink:0}}>{i+1}</span>
                  <span style={{flex:1,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:10}}>{w.label}</span>
                  <div style={{width:70,height:7,background:C.surface,borderRadius:4,flexShrink:0}}>
                    <div style={{width:`${Math.min(w.rate/max*100,100)}%`,height:"100%",borderRadius:4,background:rateColor(w.rate),transition:"width 0.3s"}}/>
                  </div>
                  <span style={{width:38,textAlign:"right",fontWeight:700,fontSize:10,color:rateColor(w.rate)}}>{w.rate.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </CardBox>
      </div>

      <CardBox>
        <STitle sub="Dynamically updates with your current filters · 50m GPS clustering">
          Top 10 fatal intersections (live with filters)
        </STitle>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead>
            <tr style={{borderBottom:`1px solid ${C.border}`}}>
              {["#","Intersection","Fatal"].map(h=>(
                <th key={h} style={{textAlign:"left",padding:"6px 10px",color:C.muted,fontSize:10,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topInt.map((r,i)=>(
              <tr key={i} style={{borderBottom:`1px solid ${C.border}`,background:i%2?"transparent":C.surface}}>
                <td style={{padding:"8px 10px",color:i<3?C.fatal:C.muted,fontWeight:700}}>{r.rank}</td>
                <td style={{padding:"8px 10px",color:C.text,fontWeight:i<3?600:400}}>{r.label}</td>
                <td style={{padding:"8px 10px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:80,height:7,background:C.surface,borderRadius:4}}>
                      <div style={{width:`${Math.min(r.fatal/20*100,100)}%`,height:"100%",borderRadius:4,background:C.fatal}}/>
                    </div>
                    <span style={{color:C.fatal,fontWeight:700}}>{r.fatal}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBox>
    </div>
  );
}

function PageRisk({raw,mask,f,dispatch}){
  const lightD=useMemo(()=>aggBy(raw,mask,"light",raw.lightV).filter(d=>d.total>0),[mask]);
  const userD =useMemo(()=>aggBy(raw,mask,"user",raw.userV).filter(d=>d.total>0),[mask]);
  const surfD =useMemo(()=>aggBy(raw,mask,"surf",raw.surfV).filter(d=>d.total>0),[mask]);
  const ctrlD =useMemo(()=>aggBy(raw,mask,"ctrl",raw.ctrlV).filter(d=>d.total>0),[mask]);
  const aL=new Set(f.lights),aU=new Set(f.users),aS=new Set(f.surfs),aC=new Set(f.ctrls);

  const crossBar=(data,valKey,activeSet,onToggle,title,sub)=>(
    <CardBox>
      <STitle sub={`${sub} · ${activeSet.size>0?activeSet.size+" selected":"click to filter"}`}>{title}</STitle>
      <XBar data={data} labelKey="label" valueKey={valKey} activeSet={activeSet}
        onToggle={d=>{const idx=data.findIndex(x=>x.label===d.label);onToggle(idx);}}
        colorFn={d=>rateColor(d[valKey])} height={160}/>
    </CardBox>
  );

  return(
    <div>
      <div style={{background:`${C.warn}12`,border:`1px solid ${C.warn}28`,borderRadius:8,
        padding:"7px 12px",marginBottom:12,fontSize:11,color:C.warn}}>
        ↕ Click any bar to cross-filter all four pages simultaneously. Multiple selections = AND logic.
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <CardBox>
          <STitle sub={`${aL.size>0?aL.size+" selected":"click to filter"}`}>Lighting — click to filter</STitle>
          <XBar data={lightD} activeSet={aL}
            onToggle={d=>{const idx=raw.lightV.indexOf(d.label);dispatch({type:"TOGGLE_LIGHT",v:idx});}}
            colorFn={d=>rateColor(d.rate)} height={160}/>
        </CardBox>
        <CardBox>
          <STitle sub={`${aU.size>0?aU.size+" selected":"click to filter"}`}>Road user — click to filter</STitle>
          <XBar data={userD} activeSet={aU}
            onToggle={d=>{const idx=raw.userV.indexOf(d.label);dispatch({type:"TOGGLE_USER",v:idx});}}
            colorFn={d=>rateColor(d.rate)} height={160}/>
        </CardBox>
        <CardBox>
          <STitle sub={`${aS.size>0?aS.size+" selected":"click to filter"}`}>Road surface — click to filter</STitle>
          <XBar data={surfD} activeSet={aS}
            onToggle={d=>{const idx=raw.surfV.indexOf(d.label);dispatch({type:"TOGGLE_SURF",v:idx});}}
            colorFn={d=>rateColor(d.rate)} height={160}/>
        </CardBox>
        <CardBox>
          <STitle sub={`${aC.size>0?aC.size+" selected":"click to filter"}`}>Traffic control — click to filter</STitle>
          <XBar data={ctrlD.map(d=>({...d,label:d.label.length>14?d.label.slice(0,13)+"…":d.label,_orig:d.label}))}
            activeSet={aC}
            onToggle={d=>{const idx=raw.ctrlV.indexOf(d._orig||d.label);dispatch({type:"TOGGLE_CTRL",v:idx});}}
            colorFn={d=>rateColor(d.rate)} height={160}/>
        </CardBox>
      </div>
      <CardBox>
        <STitle sub="Static reference · Random Forest feature importances · ⚠ reporting-bias note for aggressive/distracted">
          Feature importance (reference)
        </STitle>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart layout="vertical" barSize={12} data={[
            {l:"Distracted driving ⚠",v:0.1156},{l:"Aggressive driving ⚠",v:0.1022},
            {l:"Older adult (65+)",v:0.0980},{l:"Traffic signal control",v:0.0875},
            {l:"Hour of day",v:0.0718},{l:"Weekend collision",v:0.0591},
            {l:"Turning movement",v:0.0576},{l:"Minor arterial road",v:0.0502},
            {l:"Non-intersection loc.",v:0.0446},{l:"Age of person",v:0.0390},
            {l:"Wet road surface",v:0.0385},{l:"Rear-end collision",v:0.0371},
            {l:"Cyclist collision",v:0.0368},{l:"School-age child",v:0.0334},
            {l:"Dark lighting",v:0.0283},
          ]}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false}/>
            <XAxis type="number" tick={{fill:C.muted,fontSize:9}} tickFormatter={v=>v.toFixed(3)} tickLine={false} axisLine={false}/>
            <YAxis type="category" dataKey="l" width={170} tick={{fill:C.muted,fontSize:9}} tickLine={false} axisLine={false}/>
            <Tooltip content={<Tip/>}/>
            <Bar dataKey="v" name="Importance" radius={[0,4,4,0]}>
              {Array.from({length:15},(_,i)=><Cell key={i} fill={i<2?C.warn:i<5?C.fatal:i<9?C.info:C.safe}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardBox>
    </div>
  );
}

function PageRecs(){
  const [sel,setSel]=useState(null);
  const RECS=[
    {n:"R1",title:"Traffic signal upgrades at uncontrolled intersections",priority:"HIGH",
     evidence:"χ²(5)=78.68, p<0.001 · uncontrolled 16.1% vs signal 12.6% (H4)",
     locs:"Don Valley East (16), Scarborough-Agincourt (22), Scarborough SW (20)",agency:"Transportation Services"},
    {n:"R2",title:"Streetlight upgrades in high-night-fatal wards",priority:"HIGH",
     evidence:"Dark OR=1.80 [1.59–2.04], p<0.001 · H1 χ²(8)=75.84",
     locs:"Scarborough-Rouge Park (25), Davenport (9), Humber River-BC (7)",agency:"Infrastructure & Parks"},
    {n:"R3",title:"Targeted impaired driving enforcement (RIDE checkpoints)",priority:"HIGH",
     evidence:"Drivcond χ²(6)=230.93, V=0.106 · strongest H2 effect",
     locs:"Scarborough SW (20), Etobicoke North (1), Etobicoke-Lakeshore (3)",agency:"Toronto Police Service"},
    {n:"R4",title:"Pedestrian islands + protected cyclist lanes",priority:"HIGH",
     evidence:"Pedestrian O/E=1.28 · χ²(7)=179.81, p<0.001 · H3",
     locs:"Lawrence & Warden, Steeles & Middlefield, Lake Shore & Bay",agency:"Transportation Services"},
    {n:"R5",title:"Peak-window patrols + signal timing adjustments",priority:"MEDIUM",
     evidence:"Fatal peak 194/hr at 18:00 · July–Aug 856 fatals (30% of annual total)",
     locs:"City-wide · Scarborough wards prioritised",agency:"TPS + Transportation Services"},
    {n:"R6",title:"XGBoost batch scoring for corridor prioritisation",priority:"MEDIUM",
     evidence:"Test AUC=0.8776 · 10-fold CV=0.9809±0.0024 · H5 met",
     locs:"Toronto Transportation Services — city-wide",agency:"Transportation Services + IT"},
  ];
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
        <KPI label="High priority" value="4" sub="R1–R4 · immediate" color={C.fatal}/>
        <KPI label="Medium priority" value="2" sub="R5–R6 · planned" color={C.warn}/>
        <KPI label="Wards targeted" value="12" sub="Across 6 recommendations" color={C.info}/>
      </div>
      <div style={{background:`${C.info}10`,border:`1px solid ${C.info}25`,borderRadius:8,
        padding:"7px 12px",marginBottom:12,fontSize:11,color:C.info}}>
        ◫ Click any recommendation card to expand full evidence, locations, and responsible agency.
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        {RECS.map((r,i)=>(
          <div key={r.n} onClick={()=>setSel(sel===i?null:i)} style={{
            background:sel===i?`${C.fatal}12`:C.card,
            border:`1px solid ${sel===i?C.fatal:C.border}`,
            borderRadius:12,padding:"14px 16px",cursor:"pointer",
            borderLeft:`4px solid ${r.priority==="HIGH"?C.fatal:C.warn}`,transition:"all 0.2s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <span style={{fontWeight:800,color:C.fatal,fontSize:14}}>{r.n}</span>
              <span style={{fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:99,
                background:r.priority==="HIGH"?C.fatalDim:C.warnDim,
                color:r.priority==="HIGH"?C.fatal:C.warn}}>{r.priority}</span>
            </div>
            <div style={{fontWeight:600,color:C.text,fontSize:12,marginBottom:6}}>{r.title}</div>
            {sel===i?(
              <div style={{animation:"fi 0.2s ease"}}>
                <style>{`@keyframes fi{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}`}</style>
                <div style={{fontSize:11,color:C.muted,marginBottom:6,padding:"6px 10px",background:C.surface,borderRadius:6}}>
                  <span style={{color:C.info,fontWeight:600}}>Evidence: </span>{r.evidence}
                </div>
                <div style={{fontSize:11,color:C.muted,marginBottom:5}}>
                  <span style={{color:C.purple,fontWeight:600}}>Locations: </span>{r.locs}
                </div>
                <div style={{fontSize:11,color:C.muted}}>
                  <span style={{color:C.safe,fontWeight:600}}>Agency: </span>{r.agency}
                </div>
              </div>
            ):<div style={{fontSize:10,color:C.muted}}>{r.locs.split(",")[0]}… · {r.agency.split("+")[0].trim()}</div>}
          </div>
        ))}
      </div>
      <CardBox>
        <STitle sub="Statistical basis for all recommendations">Hypothesis evidence summary</STitle>
        {[
          ["H1 — Environmental",C.info,"χ²(8)=75.84, p<0.001, V=0.061 · Dark OR=1.80 [1.59–2.04]"],
          ["H2 — Behavioural",C.warn,"χ²(6)=230.93, p<0.001, V=0.106 · Strongest effect of all hypotheses"],
          ["H3 — Vulnerable users",C.safe,"χ²(7)=179.81, p<0.001, V=0.094 · Pedestrian O/E=1.28"],
          ["H4 — Infrastructure",C.purple,"χ²(5)=78.68, p<0.001, V=0.062 · Uncontrolled 16.1% vs 12.6%"],
          ["H5 — ML classifier",C.fatal,"XGBoost AUC=0.8776 ✓ · 10-fold CV=0.9809±0.0024 · Fatal recall=63.1%"],
        ].map(([h,c,e])=>(
          <div key={h} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:`1px solid ${C.border}`,alignItems:"flex-start"}}>
            <div style={{width:3,background:c,borderRadius:2,flexShrink:0,alignSelf:"stretch",minHeight:20}}/>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:3}}>{h}</div>
              <div style={{fontSize:11,color:C.muted}}>{e}</div>
            </div>
          </div>
        ))}
      </CardBox>
    </div>
  );
}

// ── App shell ─────────────────────────────────────────────────────────────────
const PAGES=[
  {id:"overview",label:"Overview",icon:"◎"},
  {id:"geo",label:"Geospatial",icon:"◈"},
  {id:"risk",label:"Risk Factors",icon:"◧"},
  {id:"recs",label:"Recommendations",icon:"◫"},
];

export default function App(){
  const [page,setPage]=useState("overview");
  const [f,dispatch]=useReducer(reducer,INIT);
  const {raw,loading}=useRaw();
  const mask=useMemo(()=>raw?computeMask(raw,f):null,[raw,f]);
  const kpi=useMemo(()=>raw&&mask?getKpi(raw,mask):{total:0,fatal:0,rate:0},[raw,mask]);

  if(loading)return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",
      background:C.bg,flexDirection:"column",gap:16}}>
      <div style={{width:48,height:48,border:`3px solid ${C.border}`,borderTop:`3px solid ${C.fatal}`,
        borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{color:C.muted,fontSize:14}}>Loading KSI dataset…</div>
    </div>
  );

  if(!raw)return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",
      background:C.bg,color:C.muted,fontSize:14,flexDirection:"column",gap:12}}>
      <div>⚠ Could not load ksi_data.json</div>
      <div style={{fontSize:12}}>Ensure public/ksi_data.json exists in the dashboard folder</div>
    </div>
  );

  const props={raw,mask,f,dispatch};

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"system-ui,-apple-system,sans-serif"}}>

      {/* Sticky header */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"10px 20px",
        display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:50}}>
        <div>
          <div style={{fontSize:15,fontWeight:800,display:"flex",alignItems:"center",gap:8,letterSpacing:"-0.02em"}}>
            <span style={{color:C.fatal,fontSize:17}}>⬟</span>
            KSI Collision Severity
            <span style={{color:C.muted,fontWeight:400,fontSize:14}}>Toronto 2006–2026</span>
          </div>
          <div style={{fontSize:10,color:C.muted,marginTop:2}}>
            Group 5 · DAMO-699-5 · University of Niagara Falls Canada · XGBoost AUC=0.878
          </div>
        </div>

        {/* Live KPI pills */}
        <div style={{display:"flex",gap:6,alignItems:"center",marginLeft:"auto"}}>
          {[["Filtered KSI",kpi.total.toLocaleString(),C.info],
            ["Fatal",kpi.fatal.toLocaleString(),C.fatal],
            ["Rate",kpi.rate+"%",kpi.rate>14.1?C.fatal:C.safe]].map(([l,v,c])=>(
            <div key={l} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,
              padding:"4px 12px",textAlign:"center",minWidth:68}}>
              <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</div>
              <div style={{color:c,fontWeight:800,fontSize:14}}>{v}</div>
            </div>
          ))}

          {/* Year slicer */}
          <div style={{display:"flex",alignItems:"center",gap:7,background:C.card,
            border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",fontSize:12}}>
            <span style={{color:C.muted}}>Year:</span>
            <input type="range" min={2006} max={2023} value={f.yearRange[0]} style={{width:65}}
              onChange={e=>dispatch({type:"SET_YEAR",v:[+e.target.value,Math.max(+e.target.value,f.yearRange[1])]})}/>
            <span style={{color:C.text,fontWeight:600,minWidth:30}}>{f.yearRange[0]}</span>
            <span style={{color:C.muted}}>–</span>
            <input type="range" min={2006} max={2023} value={f.yearRange[1]} style={{width:65}}
              onChange={e=>dispatch({type:"SET_YEAR",v:[Math.min(f.yearRange[0],+e.target.value),+e.target.value]})}/>
            <span style={{color:C.text,fontWeight:600,minWidth:30}}>{f.yearRange[1]}</span>
          </div>

          <button onClick={()=>dispatch({type:"TOGGLE_FATAL"})} style={{fontSize:11,fontWeight:600,
            padding:"6px 12px",borderRadius:8,cursor:"pointer",transition:"all 0.15s",
            background:f.fatalOnly?C.fatal:"transparent",
            color:f.fatalOnly?"#fff":C.muted,
            border:`1px solid ${f.fatalOnly?C.fatal:C.border}`}}>
            Fatal only
          </button>
        </div>
      </div>

      {/* Nav tabs */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 20px",display:"flex"}}>
        {PAGES.map(p=>(
          <button key={p.id} onClick={()=>setPage(p.id)} style={{
            padding:"10px 18px",fontSize:12,fontWeight:600,background:"transparent",border:"none",
            borderBottom:`2px solid ${page===p.id?C.fatal:"transparent"}`,
            color:page===p.id?C.text:C.muted,cursor:"pointer",
            display:"flex",alignItems:"center",gap:5,transition:"all 0.15s"}}>
            {p.icon} {p.label}
          </button>
        ))}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",fontSize:10,color:C.dim}}>
          Story 12 · Interactive cross-filter dashboard
        </div>
      </div>

      {/* Active filter chips */}
      <div style={{padding:"10px 20px 0"}}>
        <FilterBar f={f} dispatch={dispatch} raw={raw}/>
      </div>

      {/* Page content */}
      <div style={{padding:"12px 20px 40px",maxWidth:1400,margin:"0 auto"}}>
        {page==="overview"&&<PageOverview {...props}/>}
        {page==="geo"     &&<PageGeo {...props}/>}
        {page==="risk"    &&<PageRisk {...props}/>}
        {page==="recs"    &&<PageRecs/>}
      </div>

      <div style={{borderTop:`1px solid ${C.border}`,padding:"8px 20px",
        display:"flex",justifyContent:"space-between",fontSize:10,color:C.dim,background:C.surface}}>
        <span>City of Toronto KSI Open Data · Toronto Police Service · 2006–2026</span>
        <span>⚠ Research tool only — not for operational or enforcement use</span>
      </div>
    </div>
  );
}