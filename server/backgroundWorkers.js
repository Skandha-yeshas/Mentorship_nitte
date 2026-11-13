export function startBackgroundWorkers(tasks) {
  let stopped = false;
  const timers = new Set();
  const active = new Set();
  const schedule = (task, delay) => {
    if (stopped) return;
    const timer = setTimeout(async () => {
      timers.delete(timer);
      let worked = false;
      const work = task(); active.add(work);
      try { worked = await work; }
      catch { console.warn('[Background jobs] Work is waiting for the database or configuration. It will retry.'); }
      finally { active.delete(work); }
      schedule(task, worked ? 25 : 2000);
    }, delay);
    timer.unref(); timers.add(timer);
  };
  tasks.forEach(task => schedule(task, 100));
  return async () => { stopped = true; for (const timer of timers) clearTimeout(timer); timers.clear(); await Promise.allSettled([...active]); };
}
