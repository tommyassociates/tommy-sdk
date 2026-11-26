import { parseDocument, LineCounter } from 'yaml';

export function parseManifest(source) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(source, { lineCounter, prettyErrors: false });

  const yamlErrors = doc.errors.map((err) => {
    const pos = err.pos?.[0] ?? 0;
    const lp = lineCounter.linePos(pos);
    return { line: lp.line, col: lp.col, message: err.message };
  });

  // toJS() on a doc with fatal errors can throw; guard so the YAML layer owns it.
  let data = null;
  if (yamlErrors.length === 0) {
    try {
      data = doc.toJS();
    } catch (e) {
      yamlErrors.push({ line: 1, col: 1, message: e.message });
    }
  }

  return { doc, data, lineCounter, yamlErrors };
}

export function locateLine(doc, lineCounter, path, opts = {}) {
  const offsetToLine = (offset) => lineCounter.linePos(offset).line;

  if (opts.key != null) {
    const parent = doc.getIn(path, true);
    if (parent && Array.isArray(parent.items)) {
      const pair = parent.items.find(
        (it) => it?.key && String(it.key.value) === String(opts.key),
      );
      if (pair?.key?.range) return offsetToLine(pair.key.range[0]);
    }
  }

  let p = [...path];
  while (p.length >= 0) {
    const node = doc.getIn(p, true);
    if (node?.range) return offsetToLine(node.range[0]);
    if (node && Array.isArray(node.items) && node.items[0]?.key?.range) {
      return offsetToLine(node.items[0].key.range[0]);
    }
    if (p.length === 0) break;
    p = p.slice(0, -1);
  }
  return 1;
}

export function pointerToPath(pointer) {
  if (!pointer) return [];
  return pointer
    .split('/')
    .slice(1)
    .map((seg) => {
      const unescaped = seg.replace(/~1/g, '/').replace(/~0/g, '~');
      return /^\d+$/.test(unescaped) ? Number(unescaped) : unescaped;
    });
}

export function pathToDisplay(path) {
  let out = '';
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else out += out ? `.${seg}` : seg;
  }
  return out || '(root)';
}
