import { useState, useEffect, useCallback, useRef, memo } from 'react';

// ────────────────────────────────────────────────────────────────────────────
// Debounce hook + uncontrolled input components that prevent parent re-renders
// on every keystroke.
//
// THE PROBLEM:
// React controlled inputs (value={state} onChange={e => setState(e.target.value)})
// re-render the entire parent on every keystroke. When the parent is a 2700-line
// component with 40+ state variables and 380 inline styles, this causes visible
// input lag.
//
// THE FIX:
// These components manage their own internal state and only call back to the
// parent after a debounce delay (or on blur). The parent doesn't re-render
// on every keystroke — only when the user pauses or leaves the field.
//
// USAGE:
//   import { DebouncedInput, DebouncedTextarea } from '../lib/useDebounce';
//   <DebouncedInput value={name} onCommit={setName} delay={300} />
//   <DebouncedTextarea value={bio} onCommit={setBio} delay={500} />
// ────────────────────────────────────────────────────────────────────────────

// Hook: returns a debounced version of a value
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// Hook: returns a debounced callback
export function useDebouncedCallback(callback, delay = 300) {
  const ref = useRef();
  return useCallback((...args) => {
    clearTimeout(ref.current);
    ref.current = setTimeout(() => callback(...args), delay);
  }, [callback, delay]);
}

// ── Debounced Input ──────────────────────────────────────────────────────
// Manages its own text state internally. Calls onCommit after `delay` ms
// of inactivity, or immediately on blur. Parent never re-renders mid-typing.
export const DebouncedInput = memo(function DebouncedInput({
  value: externalValue,
  onCommit,
  delay = 300,
  className = '',
  style = {},
  ...props
}) {
  const [local, setLocal] = useState(externalValue ?? '');
  const timerRef = useRef();
  const committedRef = useRef(externalValue);

  // Sync from parent when the external value changes (not from our own commit)
  useEffect(() => {
    if (externalValue !== committedRef.current) {
      setLocal(externalValue ?? '');
      committedRef.current = externalValue;
    }
  }, [externalValue]);

  function handleChange(e) {
    const v = e.target.value;
    setLocal(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      committedRef.current = v;
      if (onCommit) onCommit(v);
    }, delay);
  }

  function handleBlur() {
    clearTimeout(timerRef.current);
    if (local !== committedRef.current) {
      committedRef.current = local;
      if (onCommit) onCommit(local);
    }
  }

  return (
    <input
      value={local}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
      style={style}
      {...props}
    />
  );
});

// ── Debounced Textarea ───────────────────────────────────────────────────
// Same pattern as DebouncedInput but for <textarea>.
export const DebouncedTextarea = memo(function DebouncedTextarea({
  value: externalValue,
  onCommit,
  delay = 400,
  className = '',
  style = {},
  ...props
}) {
  const [local, setLocal] = useState(externalValue ?? '');
  const timerRef = useRef();
  const committedRef = useRef(externalValue);

  useEffect(() => {
    if (externalValue !== committedRef.current) {
      setLocal(externalValue ?? '');
      committedRef.current = externalValue;
    }
  }, [externalValue]);

  function handleChange(e) {
    const v = e.target.value;
    setLocal(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      committedRef.current = v;
      if (onCommit) onCommit(v);
    }, delay);
  }

  function handleBlur() {
    clearTimeout(timerRef.current);
    if (local !== committedRef.current) {
      committedRef.current = local;
      if (onCommit) onCommit(local);
    }
  }

  return (
    <textarea
      value={local}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
      style={style}
      {...props}
    />
  );
});

// ── Debounced Search ─────────────────────────────────────────────────────
// Specialised for search bars: fires onSearch after delay, shows a loading
// indicator, and debounces the actual search trigger (not the display value).
export const DebouncedSearch = memo(function DebouncedSearch({
  value: externalValue,
  onSearch,
  delay = 400,
  className = '',
  style = {},
  ...props
}) {
  const [local, setLocal] = useState(externalValue ?? '');
  const timerRef = useRef();

  useEffect(() => {
    setLocal(externalValue ?? '');
  }, [externalValue]);

  function handleChange(e) {
    const v = e.target.value;
    setLocal(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (onSearch) onSearch(v);
    }, delay);
  }

  // Commit immediately on Enter
  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      clearTimeout(timerRef.current);
      if (onSearch) onSearch(local);
    }
  }

  return (
    <input
      value={local}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      className={className}
      style={style}
      {...props}
    />
  );
});
