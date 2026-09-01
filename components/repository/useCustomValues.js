import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_SECTORS, DEFAULT_TYPES, DEFAULT_CURRENCIES } from './shared';

// ─── CUSTOM VALUES HOOK ───────────────────────────────────────────────────────

function useCustomValues() {
  const [sectors, setSectors] = useState(DEFAULT_SECTORS);
  const [types, setTypes] = useState(DEFAULT_TYPES);
  const [currencies, setCurrencies] = useState(DEFAULT_CURRENCIES);

  useEffect(()=>{
    fetch('/api/custom-values').then(r=>r.json()).then(d=>{
      if(d.values?.sector) setSectors(d.values.sector);
      if(d.values?.project_type) setTypes(d.values.project_type);
      if(d.values?.currency) setCurrencies(d.values.currency);
    }).catch(e => console.error('[repository] custom values load:', e.message));
  },[]);

  async function persist(category, value) {
    try { await fetch('/api/custom-values',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category,value})}); } catch {}
  }

  const addSector = useCallback((v)=>{ if(!sectors.includes(v)){ setSectors(s=>[...s,v]); persist('sector',v); }}, [sectors]);
  const addType = useCallback((v)=>{ if(!types.includes(v)){ setTypes(t=>[...t,v]); persist('project_type',v); }}, [types]);
  const addCurrency = useCallback((v)=>{ const u=v.toUpperCase().slice(0,8); if(!currencies.includes(u)){ setCurrencies(c=>[...c,u]); persist('currency',u); } return u; }, [currencies]);

  return { sectors, types, currencies, addSector, addType, addCurrency };
}

export { useCustomValues };
