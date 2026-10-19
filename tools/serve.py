#!/usr/bin/env python3
# Broccoli — browser-native search results clustering.
# Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
"""
Serves the project folder on http://localhost:8000/ with correct MIME
types for ES modules and fonts. Any static web server works just as well;
this one only needs Python 3.

  python3 tools/serve.py [port]
"""

import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map, **{
        '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json',
    })


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(Handler, directory=ROOT)
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as httpd:
        print('Broccoli on http://localhost:%d/  (tests: http://localhost:%d/tests/)  Ctrl+C to stop' % (port, port))
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
