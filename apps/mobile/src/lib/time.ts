import { useEffect, useState } from 'react';

// Current time that re-renders every minute, so "overdue" badges stay correct without calling Date.now() during render.
export function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
