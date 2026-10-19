#!/usr/bin/env python3
# Broccoli — browser-native search results clustering.
# Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
"""
Builds the single-file distributions from the ES modules in src/ with
nothing but Python 3 (no Node.js, no npm):

  dist/broccoli.js   classic script; defines window.Broccoli (also works as a
                   CommonJS/UMD module and from file:// pages)
  dist/broccoli.mjs  single-file ES module (default export + named exports)

Each module becomes a function scope; imports become destructuring of the
exporting module's namespace. Supported syntax (what src/ uses):
  import { a, b as c } from './x.js';     import * as ns from './x.js';
  export function / async function / class / const / let / var NAME
  export { a, b as c };                    export { a, b as c } from './x.js';
  export * from './x.js';
Not supported (the build fails loudly): export default, dynamic import(),
import.meta, circular imports.

Usage:  python3 tools/build.py [--check]
        --check  only verify that dist/ is up to date (exit 1 if not)
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')
ENTRY = os.path.join(SRC, 'index.js')
WORKER_MODULE = os.path.join(SRC, 'engine', 'worker.js')

IMPORT_RE = re.compile(
    r'^[ \t]*import\s+(?:\{([^}]*)\}|\*\s+as\s+([A-Za-z_$][\w$]*))\s+from\s+[\'"]([^\'"]+)[\'"]\s*;?[ \t]*$',
    re.M)
REEXPORT_RE = re.compile(r'^[ \t]*export\s+\{([^}]*)\}\s+from\s+[\'"]([^\'"]+)[\'"]\s*;?[ \t]*$', re.M)
STAR_RE = re.compile(r'^[ \t]*export\s+\*\s+from\s+[\'"]([^\'"]+)[\'"]\s*;?[ \t]*$', re.M)
LOCAL_LIST_RE = re.compile(r'^[ \t]*export\s+\{([^}]*)\}\s*;?[ \t]*$', re.M)
DECL_RE = re.compile(r'^([ \t]*)export\s+((?:async\s+)?function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)', re.M)
FORBIDDEN = [
    (re.compile(r'^\s*export\s+default\b', re.M), 'export default'),
    (re.compile(r'\bimport\s*\('), 'dynamic import()'),
    (re.compile(r'\bimport\.meta\b'), 'import.meta'),
]


class BuildError(Exception):
    pass


def parse_names(spec):
    """'a, b as c' -> [('a', 'a'), ('b', 'c')] as (imported, local)."""
    out = []
    for part in spec.replace('\n', ' ').split(','):
        part = part.strip()
        if not part:
            continue
        m = re.match(r'^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$', part)
        if not m:
            raise BuildError('cannot parse binding list: %r' % part)
        out.append((m.group(1), m.group(2) or m.group(1)))
    return out


def resolve(from_file, spec):
    if not spec.startswith('.'):
        raise BuildError('%s: only relative imports are supported (%s)' % (rel(from_file), spec))
    path = os.path.normpath(os.path.join(os.path.dirname(from_file), spec))
    if not os.path.isfile(path):
        raise BuildError('%s: cannot resolve %s' % (rel(from_file), spec))
    return path


def rel(path):
    return os.path.relpath(path, ROOT).replace(os.sep, '/')


def module_var(path):
    return '__m_' + re.sub(r'[^\w]', '_', os.path.relpath(path, SRC))


class Module:
    def __init__(self, path):
        self.path = path
        with open(path, encoding='utf-8') as fh:
            self.source = fh.read()
        for rx, what in FORBIDDEN:
            if rx.search(strip_comments(self.source)):
                raise BuildError('%s: %s is not supported by the bundler' % (rel(path), what))
        self.deps = []
        self.imports = []      # (module path, [(imported, local)] | None, namespace local | None)
        self.exports = []      # (exported name, expression)
        self.body = self._transform()

    def _dep(self, spec):
        p = resolve(self.path, spec)
        if p not in self.deps:
            self.deps.append(p)
        return p

    def _transform(self):
        src = self.source

        def on_import(m):
            names, ns, spec = m.group(1), m.group(2), m.group(3)
            p = self._dep(spec)
            self.imports.append((p, parse_names(names) if names is not None else None, ns))
            return ''

        def on_reexport(m):
            p = self._dep(m.group(2))
            for imported, exported in parse_names(m.group(1)):
                self.exports.append((exported, '%s.%s' % (module_var(p), imported)))
            return ''

        def on_star(m):
            p = self._dep(m.group(1))
            self.exports.append(('*', module_var(p)))
            return ''

        def on_local_list(m):
            for local, exported in parse_names(m.group(1)):
                self.exports.append((exported, local))
            return ''

        def on_decl(m):
            self.exports.append((m.group(3), m.group(3)))
            return m.group(1) + m.group(2) + ' ' + m.group(3)

        src = IMPORT_RE.sub(on_import, src)
        src = REEXPORT_RE.sub(on_reexport, src)
        src = STAR_RE.sub(on_star, src)
        src = LOCAL_LIST_RE.sub(on_local_list, src)
        src = DECL_RE.sub(on_decl, src)
        leftover = re.search(r'^\s*(?:import|export)\b', strip_comments(src), re.M)
        if leftover:
            line = src[leftover.start():].splitlines()[0] if src[leftover.start():] else ''
            raise BuildError('%s: unsupported module syntax near: %s' % (rel(self.path), line.strip()))
        return src

    def emit(self):
        lines = ['  // ---- %s' % rel(self.path), '  const %s = (function () {' % module_var(self.path)]
        for p, names, ns in self.imports:
            if ns:
                lines.append('    const %s = %s;' % (ns, module_var(p)))
            else:
                parts = [imp if imp == loc else '%s: %s' % (imp, loc) for imp, loc in names]
                lines.append('    const { %s } = %s;' % (', '.join(parts), module_var(p)))
        body = self.body.strip('\n')
        lines.extend(('    ' + l if l.strip() else '') for l in body.splitlines())
        stars = [e for n, e in self.exports if n == '*']
        own = ['%s: %s' % (n, e) if n != e else n for n, e in self.exports if n != '*']
        obj = '{ ' + ', '.join(own) + ' }' if own else '{}'
        if stars:
            lines.append('    return Object.assign({}, %s, %s);' % (', '.join(stars), obj))
        else:
            lines.append('    return %s;' % obj)
        lines.append('  })();')
        return '\n'.join(lines)

    def export_names(self, modules):
        names = []
        for n, e in self.exports:
            if n == '*':
                target = [m for m in modules.values() if module_var(m.path) == e][0]
                names.extend(target.export_names(modules))
            else:
                names.append(n)
        return names


def strip_comments(src):
    """Removes comments and string contents well enough for syntax checks."""
    out = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    out = re.sub(r'(?m)//.*$', '', out)
    out = re.sub(r"'(?:\\.|[^'\\\n])*'", "''", out)
    out = re.sub(r'"(?:\\.|[^"\\\n])*"', '""', out)
    out = re.sub(r'`(?:\\.|[^`\\])*`', '``', out, flags=re.S)
    return out


def load_graph(entry):
    modules = {}
    order = []
    visiting = set()

    def visit(path, chain):
        if path in modules and path not in visiting:
            return
        if path in visiting:
            raise BuildError('circular import: ' + ' -> '.join(rel(p) for p in chain + [path]))
        visiting.add(path)
        mod = Module(path)
        modules[path] = mod
        for dep in mod.deps:
            visit(dep, chain + [path])
        visiting.discard(path)
        order.append(path)

    visit(entry, [])
    return modules, order


def read_version():
    with open(os.path.join(SRC, 'engine', 'engine.js'), encoding='utf-8') as fh:
        m = re.search(r"export const VERSION = '([^']+)'", fh.read())
    return m.group(1) if m else '0.0.0'


def build():
    modules, order = load_graph(ENTRY)
    if WORKER_MODULE not in modules:
        raise BuildError('src/engine/worker.js must be reachable from src/index.js')
    version = read_version()
    banner = ('/*! Broccoli v%s | MIT License | Copyright (c) 2026 Decentralized Science Labs LLC\n'
              ' *  Browser-native search results clustering (Lingo, STC, Bisecting k-means) with PubMed integration.\n'
              ' *  Generated by tools/build.py from src/ — edit the sources, not this file. */\n') % version
    factory_body = '\n\n'.join(modules[p].emit() for p in order)
    entry_var = module_var(ENTRY)
    factory = ('function broccoliFactory() {\n  \'use strict\';\n\n%s\n\n'
               '  %s.setBundleSource(\'(\' + broccoliFactory.toString() + \')\');\n'
               '  return %s;\n}') % (factory_body, module_var(WORKER_MODULE), entry_var)

    umd = banner + (
        '(function (root, factory) {\n'
        '  var api = factory();\n'
        '  if (typeof module === \'object\' && module && module.exports) module.exports = api;\n'
        '  else root.Broccoli = api;\n'
        '})(typeof globalThis !== \'undefined\' ? globalThis : typeof self !== \'undefined\' ? self : this, %s);\n'
    ) % factory

    names = modules[ENTRY].export_names(modules)
    dupes = sorted({n for n in names if names.count(n) > 1})
    if dupes:
        raise BuildError('duplicate exports from src/index.js: ' + ', '.join(dupes))
    esm = banner + 'const Broccoli = (%s)();\n\nexport default Broccoli;\nexport const {\n  %s,\n} = Broccoli;\n' % (
        factory, ',\n  '.join(names))
    return {'broccoli.js': umd, 'broccoli.mjs': esm}, len(order), version


def main():
    check = '--check' in sys.argv[1:]
    try:
        outputs, count, version = build()
    except BuildError as err:
        print('build failed: %s' % err, file=sys.stderr)
        return 2
    os.makedirs(DIST, exist_ok=True)
    stale = []
    for name, text in outputs.items():
        target = os.path.join(DIST, name)
        current = open(target, encoding='utf-8').read() if os.path.exists(target) else None
        if current != text:
            stale.append(name)
            if not check:
                with open(target, 'w', encoding='utf-8', newline='\n') as fh:
                    fh.write(text)
    if check:
        if stale:
            print('dist/ is out of date: ' + ', '.join(stale) + ' (run python3 tools/build.py)', file=sys.stderr)
            return 1
        print('dist/ is up to date (v%s, %d modules)' % (version, count))
        return 0
    for name, text in outputs.items():
        print('dist/%-10s %7.1f KB' % (name, len(text.encode('utf-8')) / 1024.0))
    print('built v%s from %d modules' % (version, count))
    return 0


if __name__ == '__main__':
    sys.exit(main())
