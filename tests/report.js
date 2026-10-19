/* Renders test results on the runner pages and exposes them for tools/run_tests.py. */
export async function renderResults(runAll) {
  const list = document.getElementById('results');
  const summary = document.getElementById('summary');
  const escapeHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  let result;
  try {
    result = await runAll((r) => {
      const li = document.createElement('li');
      li.className = r.ok ? 'ok' : 'fail';
      li.innerHTML = '<span class="group">' + escapeHtml(r.group) + '</span> ' + escapeHtml(r.name) +
        ' <span class="ms">' + r.ms + ' ms</span>' + (r.ok ? '' : '<pre>' + escapeHtml(r.error) + '</pre>');
      list.appendChild(li);
    });
  } catch (err) {
    result = { passed: 0, failed: 1, results: [{ group: 'runner', name: 'load', ok: false, ms: 0, error: String(err && err.stack || err) }] };
  }
  summary.textContent = result.failed ? result.failed + ' failed, ' + result.passed + ' passed' : 'All ' + result.passed + ' tests passed';
  summary.className = result.failed ? 'fail' : 'ok';
  window.__TEST_RESULTS__ = result;
  // tools/run_tests.py --system opens this page with ?report=…&page=… and waits for the results.
  const query = new URLSearchParams(location.search);
  if (query.has('report')) {
    try {
      await fetch('/__report?' + new URLSearchParams({ token: query.get('report'), page: query.get('page') || '' }), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      summary.textContent += '. Results sent to the terminal; you can close this tab.';
    } catch (err) {
      summary.textContent += '. Could not send the results to the terminal: ' + err.message;
    }
  }
}
