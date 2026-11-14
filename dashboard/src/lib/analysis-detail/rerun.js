/**
 * "Re-run now" on the failed-run banner.
 *
 * POSTs /analysis/weekly/run, which runs the analysis for TODAY and can take
 * several minutes. Two outcomes are normal:
 *  - the response arrives → go to the new analysis;
 *  - the connection drops first (the platform's HTTP window is shorter than a
 *    slow run) → the run is still going server-side, so poll the read
 *    endpoint for a result newer than the click instead of starting another
 *    paid run.
 */

const POLL_EVERY_MS = 15000;
const POLL_FOR_MS = 12 * 60 * 1000;
// Gateway-style statuses mean "the response was lost", not "the run failed".
const LOST_RESPONSE = new Set([502, 503, 504]);

function todayUtc(now) {
  return new Date(now).toISOString().slice(0, 10);
}

export function wireRerun({
  button,
  statusEl,
  api,
  now = () => Date.now(),
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  navigate = (date) => { window.location.href = `?date=${encodeURIComponent(date)}`; },
}) {
  if (!button || button.dataset.wired === 'true') return;
  button.dataset.wired = 'true';

  const say = (text) => { if (statusEl) statusEl.textContent = text; };

  async function pollForResult(startedAt) {
    const date = todayUtc(startedAt);
    const deadline = startedAt + POLL_FOR_MS;
    while (now() < deadline) {
      await wait(POLL_EVERY_MS);
      try {
        const detail = await api(`/analysis/weekly/${date}`);
        if (detail && detail.generatedAt && Date.parse(detail.generatedAt) >= startedAt) {
          return date;
        }
      } catch (_err) {
        // 404 until the run lands, or a transient error — keep polling.
      }
    }
    return null;
  }

  button.addEventListener('click', async () => {
    const startedAt = now();
    button.disabled = true;
    say('Running… this usually takes a few minutes. Keep this page open.');
    try {
      const result = await api('/analysis/weekly/run', { method: 'POST', body: {} });
      navigate(result.date);
    } catch (err) {
      if (err && err.status && !LOST_RESPONSE.has(err.status)) {
        // A real answer from the API (e.g. 409: already running / frozen).
        say(`Not started: ${err.message}`);
        button.disabled = false;
        return;
      }
      say('Still running… waiting for the result.');
      const date = await pollForResult(startedAt);
      if (date) {
        navigate(date);
      } else {
        say('No result yet. Check the Analysis list in a few minutes before running again.');
        button.disabled = false;
      }
    }
  });
}
