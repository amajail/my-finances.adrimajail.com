// Shared helpers for the "call the API, then either use the result or show
// the failure the way this call site already does" pattern repeated across
// every page script (banners, tbody rows, alert()s, toasts, disabled-button
// resets, …).

/**
 * Awaits `fn` and returns its resolved value. If it rejects, calls
 * `onError(err)` — so the caller can surface the failure however it already
 * does (banner text, `alert()`, a toast, re-enabling a button, …) — and then
 * returns the sentinel `undefined`, so the caller can bail out with
 * `if (result === undefined) return;`.
 *
 * `undefined` is safe as a "failure" sentinel here: every `api()` call in
 * this codebase resolves to either a parsed JSON object or `null` (on 204),
 * never `undefined`.
 */
export async function attempt(fn, onError) {
  try {
    return await fn();
  } catch (err) {
    onError(err);
    return undefined;
  }
}

/**
 * The common "fetch, then render into a DOM node, or show the error in that
 * same node" pattern used by every read-only listing page.
 *
 * - `renderError(err)` returns the failure string (exact per-page wording is
 *   preserved by the caller, not this helper).
 * - `mode: 'text'` (default) writes it via `textContent` into a dedicated
 *   `#error-banner`-style element and un-hides it — matching the existing
 *   `banner.textContent = …; show(banner);` call sites.
 * - `mode: 'html'` writes it via `innerHTML` — for a `<tbody>` that already
 *   renders its rows as markup on success (no separate "hidden" banner).
 */
export async function loadInto(target, fetchFn, onSuccess, renderError, { mode = 'text' } = {}) {
  const data = await attempt(fetchFn, (err) => {
    const message = renderError(err);
    if (mode === 'html') {
      target.innerHTML = message;
    } else {
      target.textContent = message;
      target.classList.remove('hidden');
    }
  });
  if (data === undefined) return;
  await onSuccess(data);
}
