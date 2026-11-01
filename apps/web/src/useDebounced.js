import { useEffect, useState } from 'react';

/** The value after it stopped changing for `ms`, so search boxes do not call the API on every keystroke. */
export function useDebounced(value, ms = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}
