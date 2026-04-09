import { createContext, useContext, useState, useEffect } from 'react';

const ModeContext = createContext({ mode: 'quick', setMode: () => {} });

export function ModeProvider({ children }) {
  const [mode, setModeState] = useState('quick');

  useEffect(() => {
    const stored = localStorage.getItem('piq_view_mode');
    if (stored === 'pro' || stored === 'quick') setModeState(stored);
  }, []);

  function setMode(m) {
    setModeState(m);
    localStorage.setItem('piq_view_mode', m);
  }

  return (
    <ModeContext.Provider value={{ mode, setMode, isQuick: mode === 'quick', isPro: mode === 'pro' }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  return useContext(ModeContext);
}
