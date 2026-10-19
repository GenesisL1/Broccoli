#!/usr/bin/env python3
# Broccoli — browser-native search results clustering.
# Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
"""
Runs the test suite in a browser, against both the ES modules in src/
(tests/index.html) and the single-file build (tests/dist.html), and prints
the results here.

Two ways to run it:

  python3 tools/run_tests.py --system
      Uses the browser already on this computer and nothing else: the two
      test pages open in it, report back, and the summary is printed here.
      Needs only Python 3.

  python3 tools/run_tests.py [--browser chromium|firefox|webkit]
      Headless, through Playwright for Python, which suits CI. Playwright's
      package carries its own driver (a bundled Node.js runtime it starts
      internally); nothing comes from npm. To install it in a virtual env:
        python3 -m venv .venv && . .venv/bin/activate
        pip install playwright && python -m playwright install chromium

Without --system and without Playwright installed, --system is used.
You can also just run  python3 tools/serve.py  and open
http://localhost:8000/tests/ and http://localhost:8000/tests/dist.html.
"""

import argparse
import functools
import http.server
import json
import os
import secrets
import socketserver
import sys
import threading
import time
import urllib.parse
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = [('src', 'index.html'), ('dist', 'dist.html')]


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map, **{
        '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json',
    })
    reports = None   # dict page -> results, set per server
    token = None
    arrived = None   # threading.Event

    def log_message(self, *args):
        pass

    def do_POST(self):
        url = urllib.parse.urlsplit(self.path)
        query = dict(urllib.parse.parse_qsl(url.query))
        if url.path != '/__report' or query.get('token') != self.token:
            self.send_error(404)
            return
        length = int(self.headers.get('Content-Length') or 0)
        try:
            self.reports[query.get('page', '')] = json.loads(self.rfile.read(length).decode('utf-8'))
        except ValueError:
            self.send_error(400)
            return
        self.send_response(204)
        self.end_headers()
        self.arrived.set()


def serve():
    state = {'reports': {}, 'token': secrets.token_hex(8), 'arrived': threading.Event()}
    handler_class = type('BoundHandler', (Handler,), dict(state))
    handler = functools.partial(handler_class, directory=ROOT)
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', 0), handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, handler_class


def print_result(label, browser, result, errors=()):
    for r in result['results']:
        if not r['ok']:
            print('  FAIL [%s] %s :: %s\n      %s' % (label, r['group'], r['name'], r['error'].replace('\n', '\n      ')))
    for e in errors:
        print('  page error [%s]: %s' % (label, e))
    print('%-4s %s: %d passed, %d failed' % (label, browser, result['passed'], result['failed']))
    return result['failed'] + len(errors)


def run_system(pages, timeout):
    httpd, handler = serve()
    base = 'http://127.0.0.1:%d/tests/' % httpd.server_address[1]
    for label, page_name in pages:
        url = base + page_name + '?' + urllib.parse.urlencode({'report': handler.token, 'page': label})
        print('Opening', url)
        if not webbrowser.open_new_tab(url):
            print('Could not start a browser; open the address above yourself.')
    deadline = time.time() + timeout
    while len(handler.reports) < len(pages) and time.time() < deadline:
        handler.arrived.wait(0.5)
        handler.arrived.clear()
    failed = 0
    for label, _ in pages:
        result = handler.reports.get(label)
        if result is None:
            print('%-4s no results after %d s (is the page open?)' % (label, timeout))
            failed += 1
        else:
            failed += print_result(label, 'browser', result)
    httpd.shutdown()
    return 1 if failed else 0


def run_playwright(pages, browser_name, timeout):
    from playwright.sync_api import sync_playwright
    httpd, _ = serve()
    base = 'http://127.0.0.1:%d/tests/' % httpd.server_address[1]
    failed_total = 0
    with sync_playwright() as pw:
        browser = getattr(pw, browser_name).launch()
        for label, page_name in pages:
            page = browser.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(base + page_name)
            page.wait_for_function('window.__TEST_RESULTS__ !== undefined', timeout=timeout * 1000)
            failed_total += print_result(label, browser_name, page.evaluate('window.__TEST_RESULTS__'), errors)
            page.close()
        browser.close()
    httpd.shutdown()
    return 1 if failed_total else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--system', action='store_true', help='use the browser installed on this computer')
    parser.add_argument('--browser', default='chromium', choices=['chromium', 'firefox', 'webkit'], help='Playwright browser')
    parser.add_argument('--only', choices=['src', 'dist'])
    parser.add_argument('--timeout', type=int, default=180, help='seconds to wait for each page')
    args = parser.parse_args()
    pages = [p for p in PAGES if not args.only or p[0] == args.only]
    if not args.system:
        try:
            import playwright.sync_api  # noqa: F401
        except ImportError:
            print('Playwright is not installed; using the browser on this computer instead (see --help).')
            args.system = True
    if args.system:
        return run_system(pages, args.timeout)
    return run_playwright(pages, args.browser, args.timeout)


if __name__ == '__main__':
    sys.exit(main())
