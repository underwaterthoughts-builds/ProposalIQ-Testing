// Run `tasks` (an array of zero-arg async fns) with at most `limit`
// in flight at once. Returns results in input order, with per-task
// failures captured as { ok: false, error } so a single bad task doesn't
// reject the whole batch.
//
// Used by buildCoverageMatrix to fan out per-requirement LLM calls
// without blowing OpenAI's rate limit on RFPs with 25+ requirements.
async function pMap(tasks, limit = 5) {
  const results = new Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= tasks.length) return;
      try {
        const value = await tasks[i]();
        results[i] = { ok: true, value };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  }
  const n = Math.min(limit, tasks.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

module.exports = { pMap };
