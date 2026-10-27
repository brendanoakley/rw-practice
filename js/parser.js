/* Parses a College Board Question Bank PDF export (Reading and Writing) into question objects.
   Runs entirely in the browser with pdf.js. */
(function () {
  const DOMAINS = ['Information and Ideas', 'Craft and Structure', 'Expression of Ideas', 'Standard English Conventions'];
  const SKILLS = {
    'Words in Context': 'Craft and Structure',
    'Text Structure and Purpose': 'Craft and Structure',
    'Cross-Text Connections': 'Craft and Structure',
    'Central Ideas and Details': 'Information and Ideas',
    'Command of Evidence': 'Information and Ideas',
    'Inferences': 'Information and Ideas',
    'Boundaries': 'Standard English Conventions',
    'Form, Structure, and Sense': 'Standard English Conventions',
    'Transitions': 'Expression of Ideas',
    'Rhetorical Synthesis': 'Expression of Ideas',
  };

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const norm = (s) => s.replace(/\s+/g, ' ').trim();

  function mul(m, n) {
    return [
      m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ];
  }
  function boxThrough(m, x0, x1, y0, y1) {
    const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }

  // Collect painted shapes (rects, paths, images) in page coordinates.
  function scanOps(ops) {
    const O = pdfjsLib.OPS;
    const PAINT = new Set([O.fill, O.eoFill, O.stroke, O.fillStroke, O.eoFillStroke, O.closeStroke, O.closeFillStroke, O.closeEOFillStroke]);
    const IMG = new Set([O.paintImageXObject, O.paintInlineImageXObject, O.paintImageMaskXObject, O.paintJpegXObject, O.paintImageXObjectRepeat, O.paintSolidColorImageMask].filter((v) => v !== undefined));
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    let pending = null;
    const shapes = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], args = ops.argsArray[i];
      if (fn === O.save) stack.push(ctm);
      else if (fn === O.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === O.transform) ctm = mul(ctm, args);
      else if (fn === O.constructPath) {
        const mm = args[2];
        if (mm && isFinite(mm[0])) {
          const b = boxThrough(ctm, mm[0], mm[1], mm[2], mm[3]);
          const onlyRects = args[0].every((op) => op === O.rectangle);
          pending = pending ? { ...pending, x0: Math.min(pending.x0, b.x0), x1: Math.max(pending.x1, b.x1), y0: Math.min(pending.y0, b.y0), y1: Math.max(pending.y1, b.y1), rect: pending.rect && onlyRects } : { ...b, rect: onlyRects };
        }
      } else if (PAINT.has(fn)) {
        if (pending) shapes.push({ ...pending, kind: fn === O.stroke || fn === O.closeStroke ? 'stroke' : 'fill' });
        pending = null;
      } else if (fn === O.endPath) pending = null;
      else if (IMG.has(fn)) shapes.push({ ...boxThrough(ctm, 0, 1, 0, 1), kind: 'image', rect: false });
    }
    return shapes;
  }

  // The export uses unnamed Type3 fonts, so styles are inferred per page: the most common font is
  // regular, another font used inline next to regular text is italic, and a font that fills whole
  // lines on its own (labels, "Text 1" headings) is bold.
  // Curly quotes, dashes and accented letters come from a fallback font, so they take their neighbors' style.
  const isSpecial = (t) => /^[^\x00-\x7F]+$/.test(t.str.trim());
  function inferStyles(lines) {
    const chars = {};
    for (const ln of lines) for (const t of ln.toks) if (!isSpecial(t)) chars[t.font] = (chars[t.font] || 0) + t.str.trim().length;
    const regular = Object.keys(chars).sort((a, b) => chars[b] - chars[a])[0];
    for (const ln of lines) {
      const mixed = ln.toks.some((t) => t.font === regular && t.str.trim());
      for (const t of ln.toks) t.f = t.font === regular || isSpecial(t) ? {} : mixed ? { italic: true } : { bold: true };
      const real = ln.toks.filter((t) => t.str.trim());
      real.forEach((t, i) => {
        if (!isSpecial(t)) return;
        const prev = real.slice(0, i).reverse().find((k) => !isSpecial(k));
        const next = real.slice(i + 1).find((k) => !isSpecial(k));
        if (prev && next && prev.f.italic && next.f.italic) t.f = { italic: true };
        else if ((!prev || prev.f.bold) && (!next || next.f.bold) && (prev || next)) t.f = { bold: true };
      });
    }
  }

  // Build text lines from pdf.js items.
  function buildLines(items, pageNo) {
    const toks = [];
    for (const it of items) {
      if (!it.str) continue;
      // pdf.js injects a fake space where this PDF kerns "rt" tightly (e.g. "repor ted"); real spaces are separate items
      let str = it.str;
      if (str.length > 2 && !/\s/.test(str.replace(/r t/g, ''))) str = str.replace(/r t/g, 'rt');
      const t = it.transform;
      const rotated = Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01;
      toks.push({ str, x: t[4], y: t[5], w: it.width, h: it.height || Math.abs(t[3]), rotated, font: it.fontName });
    }
    const flat = toks.filter((t) => !t.rotated);
    const main = flat.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const t of main) {
      let ln = lines.length ? lines[lines.length - 1] : null;
      if (!ln || Math.abs(ln.y - t.y) > 2) { ln = { y: t.y, toks: [], page: pageNo }; lines.push(ln); }
      ln.toks.push(t);
    }
    // A short run sitting just above a line is a superscript (e.g. isotope numbers); fold it into that line
    for (let i = lines.length - 2; i >= 0; i--) {
      const up = lines[i], dn = lines[i + 1];
      const d = up.y - dn.y, txt = up.toks.map((t) => t.str).join('').trim();
      if (d > 2 && d < 8 && txt.length <= 12) {
        up.toks.forEach((t) => { t.sup = true; t.y = dn.y; });
        dn.toks.push(...up.toks);
        lines.splice(i, 1);
      }
    }
    for (const ln of lines) {
      ln.toks.sort((a, b) => a.x - b.x);
      const real = ln.toks.filter((t) => t.str.trim());
      ln.x0 = real.length ? real[0].x : ln.toks[0].x;
      const last = ln.toks[ln.toks.length - 1];
      ln.x1 = last.x + last.w;
    }
    inferStyles(lines);
    for (const ln of lines) {
      ln.text = joinToks(ln.toks, false);
      const real = ln.toks.filter((t) => t.str.trim());
      ln.bold = real.length > 0 && real.every((t) => t.f.bold);
    }
    return { lines, rotated: toks.filter((t) => t.rotated) };
  }

  function joinToks(toks, html) {
    let out = '', prevEnd = null, prevStr = '';
    // Group adjacent tokens with the same style so tags aren't fragmented
    let cur = null;
    const runs = [];
    for (const t of toks) {
      let s = t.str;
      if (prevEnd !== null && t.x - prevEnd > 1.2 && !/\s$/.test(prevStr) && !/^\s/.test(s)) s = ' ' + s;
      prevEnd = t.x + t.w; prevStr = t.str;
      const f = t.f || {};
      const key = `${f.bold ? 1 : 0}${f.italic ? 1 : 0}${t.u ? 1 : 0}${t.sup ? 1 : 0}`;
      if (!cur || cur.key !== key) { cur = { key, s: '', b: f.bold, i: f.italic, u: t.u, sup: t.sup }; runs.push(cur); }
      cur.s += s;
    }
    if (!html) return runs.map((r) => r.s).join('').replace(/\s+/g, ' ').trim();
    for (const r of runs) {
      let s = esc(r.s.replace(/\s+/g, ' '));
      const wrap = (tag) => {
        // keep surrounding whitespace outside the tag
        const m = s.match(/^(\s*)(.*?)(\s*)$/);
        s = m[1] + (m[2] ? `<${tag}>${m[2]}</${tag}>` : '') + m[3];
      };
      if (r.sup) wrap('sup');
      if (r.u) wrap('u');
      if (r.i) wrap('em');
      if (r.b) wrap('strong');
      out += s;
    }
    return out.replace(/<\/(u|em|strong)>(\s*)<\1>/g, '$2');
  }

  const lineHTML = (ln) => joinToks(ln.toks, true).trim();

  function joinLineTexts(parts) {
    let s = '';
    for (const p of parts) {
      if (!s) { s = p; continue; }
      const plain = s.replace(/<[^>]+>/g, '');
      if (/[—–-]$/.test(plain) && !/\s[—–-]$/.test(plain) && !/^(and|or|to)\b/.test(p)) s += p;
      else s += ' ' + p;
    }
    return s;
  }

  // Split a run of lines into paragraphs by vertical gap.
  function paragraphs(lines, gapLimit) {
    const paras = [];
    let cur = [];
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i], prev = lines[i - 1];
      if (prev) {
        let brk;
        if (ln.page !== prev.page) brk = prev.short; // continue across page breaks unless previous line ended a paragraph
        else brk = prev.y - ln.y > gapLimit + (ln.toks.some((t) => t.sup) ? 6 : 0) || ln.bullet;
        if (brk) { paras.push(cur); cur = []; cur.gapBefore = ln.page === prev.page ? prev.y - ln.y : 99; }
      }
      cur.push(ln);
    }
    if (cur.length) paras.push(cur);
    return paras;
  }

  // Width of the first word on a line; pdf.js often splits a word into several items.
  function firstWordWidth(ln) {
    let w = 0, started = false;
    for (const t of ln.toks) {
      const s = t.str;
      if (!started) { if (!s.trim()) continue; started = true; }
      const ws = s.search(/\s/);
      if (ws === 0) break;
      if (ws > 0) { w += (t.w / s.length) * ws; break; }
      w += t.w;
    }
    return w;
  }

  function renderParas(paras, left, right, lineGap) {
    const blocks = []; // {type:'p'|'verse'|'ul'|'head', items:[...]}
    for (const p of paras) {
      if (p[0].bullet) {
        const last = blocks[blocks.length - 1];
        const item = joinLineTexts(p.map(lineHTML));
        if (last && last.type === 'ul') last.items.push(item); else blocks.push({ type: 'ul', items: [item] });
        continue;
      }
      // Excerpts are indented on both sides, so narrow the wrap width to match.
      const base = Math.min(...p.map((l) => l.x0));
      const limit = right - Math.max(0, base - left);
      // Detect hard line breaks (poetry) where the next word would have fit on the line.
      const vis = [];
      let curParts = [], curIndent = p[0].x0 - base;
      p.forEach((ln, i) => {
        curParts.push(lineHTML(ln));
        const next = p[i + 1];
        const hard = next && (ln.x1 + 4 + firstWordWidth(next) < limit - 2 || Math.abs(next.x0 - ln.x0) > 4);
        if (!next || hard) { vis.push({ indent: curIndent, text: joinLineTexts(curParts) }); curParts = []; if (next) curIndent = next.x0 - base; }
      });
      const isHead = p.length === 1 && (p[0].bold || /^Text [12]$/.test(p[0].text));
      if (isHead) { blocks.push({ type: 'head', items: [vis[0].text.replace(/<\/?strong>/g, '')] }); continue; }
      const shortSingle = p.length === 1 && p[0].x1 < limit - 40 && base - left > 6;
      const last = blocks[blocks.length - 1];
      // Consecutive short indented lines with modest spacing are lines of one poem stanza.
      if (shortSingle && last && last.type === 'verse' && last.tightOk && p.gapBefore < lineGap * 2.1) {
        last.items.push(...vis);
        continue;
      }
      if (vis.length > 1 || vis[0].indent >= 6 || shortSingle) blocks.push({ type: 'verse', items: vis, tightOk: shortSingle || vis.length > 1 });
      else blocks.push({ type: 'p', items: [vis[0].text] });
    }
    return blocks.map((b) => {
      if (b.type === 'ul') return '<ul>' + b.items.map((x) => `<li>${x}</li>`).join('') + '</ul>';
      if (b.type === 'head') return `<p class="txt-head"><strong>${b.items[0]}</strong></p>`;
      if (b.type === 'verse') return '<p class="verse">' + b.items.map((v) => `<span class="ln"${v.indent >= 3 ? ` style="padding-left:${(v.indent / 10).toFixed(1)}em"` : ''}>${v.text}</span>`).join('') + '</p>';
      return `<p>${b.items[0]}</p>`;
    }).join('');
  }

  function textOfHTML(h) { return h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim(); }

  // pdf.js can't draw some embedded chart fonts (they fail the browser's font checks), so with font faces
  // disabled those labels are drawn here from the text layer instead.
  function drawTextOverlay(ctx, vp, items) {
    for (const it of items) {
      const [a, b, c, d, e, f] = it.transform;
      const size = Math.hypot(c, d);
      if (!size) continue;
      ctx.save();
      ctx.setTransform(...vp.transform);
      ctx.transform(a / size, b / size, c / size, d / size, e, f);
      ctx.scale(1, -1);
      ctx.font = `${size}px "Noto Sans", "Open Sans", Arial, sans-serif`;
      const w = ctx.measureText(it.str).width;
      const k = w ? it.width / w : 1;
      if (k > 0.6 && k < 1.6) ctx.scale(k, 1);
      ctx.fillStyle = '#1e1e1e';
      ctx.fillText(it.str, 0, 0);
      ctx.restore();
    }
  }

  async function renderCrop(page, box, overlay) {
    const scale = 2.2;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    if (overlay && overlay.length) drawTextOverlay(ctx, vp, overlay);
    const [ax, ay, bx, by] = vp.convertToViewportRectangle([box.x0, box.y0, box.x1, box.y1]);
    const sx = Math.max(0, Math.floor(Math.min(ax, bx))), sy = Math.max(0, Math.floor(Math.min(ay, by)));
    const sw = Math.min(canvas.width - sx, Math.ceil(Math.abs(bx - ax))), sh = Math.min(canvas.height - sy, Math.ceil(Math.abs(by - ay)));
    const out = document.createElement('canvas');
    out.width = sw; out.height = sh;
    out.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    let url = out.toDataURL('image/png');
    if (url.length > 700000) url = out.toDataURL('image/jpeg', 0.85);
    return { src: url, w: Math.round(box.x1 - box.x0), h: Math.round(box.y1 - box.y0) };
  }

  function classifyHeader(rowLines, cols) {
    const cells = { domain: [], skill: [], difficulty: [] };
    for (const ln of rowLines) for (const t of ln.toks) {
      if (!t.str.trim()) continue;
      const cx = t.x + 1;
      const key = cx >= cols.difficulty - 2 ? 'difficulty' : cx >= cols.skill - 2 ? 'skill' : cx >= cols.domain - 2 ? 'domain' : null;
      if (key) cells[key].push(t);
    }
    const txt = (arr) => norm(joinToks(arr.sort((a, b) => b.y - a.y || a.x - b.x), false));
    // joinToks sorts nothing; ensure lines are joined in reading order with spaces
    const lineJoin = (arr) => {
      const byLine = {};
      arr.forEach((t) => { const k = Math.round(t.y); (byLine[k] = byLine[k] || []).push(t); });
      return norm(Object.keys(byLine).sort((a, b) => b - a).map((k) => joinToks(byLine[k].sort((a, b) => a.x - b.x), false)).join(' '));
    };
    return { domain: lineJoin(cells.domain), skill: lineJoin(cells.skill), difficulty: lineJoin(cells.difficulty) || txt(cells.difficulty) };
  }

  function canonicalSkill(s) {
    const k = Object.keys(SKILLS).find((x) => x.toLowerCase() === s.toLowerCase());
    return k || s;
  }

  async function parse(data, onProgress) {
    try { await document.fonts.load('12px "Noto Sans"'); } catch (e) { /* falls back to Arial */ }
    const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false, disableFontFace: true }).promise;
    const n = pdf.numPages;
    const questions = [];
    const warnings = [];
    let q = null; // current question accumulator

    const finish = async () => {
      if (!q) return;
      try { questions.push(await buildQuestion(q)); } catch (e) { warnings.push(`${q.id}: ${e.message}`); }
      q = null;
    };

    for (let p = 1; p <= n; p++) {
      const page = await pdf.getPage(p);
      const [tc, ops] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
      const shapes = scanOps(ops);
      const { lines, rotated } = buildLines(tc.items, p);
      const isType3 = (name) => { try { const f = page.commonObjs.get(name); return !f || !!f.isType3Font; } catch (e) { return true; } };
      const overlay = tc.items.filter((it) => it.str.trim() && !isType3(it.fontName));
      const pageInfo = { page, shapes, rotated, lines, overlay, pageNo: p };

      let start = 0;
      const idIdx = lines.findIndex((l) => /^Question ID:/.test(l.text));
      if (idIdx >= 0) {
        // lines before the ID belong to the previous question
        if (q) q.lines.push(...lines.slice(0, idIdx));
        await finish();
        q = { id: lines[idIdx].text.replace(/^Question ID:\s*/, '').trim(), lines: [], firstPage: pageInfo };
        start = idIdx + 1;
      }
      if (q) {
        q.lines.push(...lines.slice(start));
        // mark bullets: tiny filled shapes immediately left of a line
        for (const ln of lines) {
          const b = shapes.find((s) => s.kind === 'fill' && s.x1 - s.x0 < 6 && s.y1 - s.y0 < 6 && s.x1 < ln.x0 && ln.x0 - s.x1 < 16 && s.y0 > ln.y - 2 && s.y1 < ln.y + 10);
          if (b) ln.bullet = true;
        }
      }
      if (onProgress) onProgress(p, n, questions.length);
      page.cleanup();
    }
    await finish();
    await pdf.destroy();
    return { questions, warnings };
  }

  async function buildQuestion(q) {
    const L = q.lines;
    const fp = q.firstPage;
    const find = (re, from = 0) => { for (let i = from; i < L.length; i++) if (re.test(L[i].text)) return i; return -1; };
    const hdrIdx = find(/^Assessment\b.*Difficulty/);
    const qIdx = find(/^Question$/);
    const aIdx = find(/^Answer$/, qIdx + 1);
    const cIdx = find(/^Correct Answer:/, aIdx + 1);
    const rIdx = find(/^Rationale$/, cIdx + 1);
    if (hdrIdx < 0 || qIdx < 0 || aIdx < 0 || cIdx < 0) throw new Error('missing section labels');

    // Header table
    const hdr = L[hdrIdx];
    const colX = (word) => { const t = hdr.toks.find((k) => k.str.trim() === word); return t ? t.x : null; };
    const cols = { domain: colX('Domain'), skill: colX('Skill'), difficulty: colX('Difficulty') };
    const meta = classifyHeader(L.slice(hdrIdx + 1, qIdx), cols);
    const domain = DOMAINS.find((d) => d.toLowerCase() === meta.domain.toLowerCase()) || meta.domain;
    const skill = canonicalSkill(meta.skill);
    const difficulty = (meta.difficulty.match(/Easy|Medium|Hard/) || ['Unknown'])[0];

    // Body region (on first page): between "Question" label and "Answer" label
    const qLabel = L[qIdx];
    const body = L.slice(qIdx + 1, aIdx);
    const left = 18;
    const right = Math.max(...L.filter((l) => l.page === fp.pageNo).map((l) => l.x1), 590);

    // Figures: non-underline shapes between Question label and the end of body on the first page
    const bodyFirst = body.filter((l) => l.page === fp.pageNo);
    const bottomY = (aIdx < L.length && L[aIdx].page === fp.pageNo) ? L[aIdx].y : 0;
    const inRegion = (s) => s.y1 < qLabel.y - 2 && s.y0 > bottomY;
    const regionShapes = fp.shapes.filter(inRegion);
    const isThinH = (s) => s.rect && s.y1 - s.y0 <= 1.6 && s.x1 - s.x0 > 2;
    const isBullet = (s) => s.x1 - s.x0 < 6 && s.y1 - s.y0 < 6;
    let figShapes = regionShapes.filter((s) => !isThinH(s) && !isBullet(s));
    fp.rotated.forEach((t) => { if (t.y < qLabel.y && t.y > bottomY) figShapes.push({ x0: t.x - 12, x1: t.x + 2, y0: t.y - 2, y1: t.y + t.w + 2 }); });
    let figure = null, figBox = null;
    if (figShapes.length) {
      figBox = figShapes.reduce((a, s) => ({ x0: Math.min(a.x0, s.x0), x1: Math.max(a.x1, s.x1), y0: Math.min(a.y0, s.y0), y1: Math.max(a.y1, s.y1) }), { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 });
      // extend with thin rules that belong to the figure (table borders)
      for (const s of regionShapes) if (isThinH(s) && s.y0 >= figBox.y0 - 2 && s.y1 <= figBox.y1 + 2) { figBox.x0 = Math.min(figBox.x0, s.x0); figBox.x1 = Math.max(figBox.x1, s.x1); }
      // titles/labels above or inside the figure
      const top = figBox.y1;
      for (const ln of bodyFirst) {
        const inside = ln.y <= figBox.y1 + 2 && ln.y >= figBox.y0 - 2;
        const above = ln.y > top;
        const label = ln.y < figBox.y0 && ln.y >= figBox.y0 - 16 && ln.x0 > left + 20 && ln.x1 - ln.x0 < 0.6 * (right - left);
        if (inside || above || label) {
          ln.inFigure = true;
          figBox.y1 = Math.max(figBox.y1, ln.y + 12); figBox.y0 = Math.min(figBox.y0, ln.y - 4);
          figBox.x0 = Math.min(figBox.x0, ln.x0); figBox.x1 = Math.max(figBox.x1, ln.x1);
        }
      }
      // rotated labels below the plot area that are part of the figure
      const pad = 6;
      figBox = { x0: Math.max(0, figBox.x0 - pad), x1: figBox.x1 + pad, y0: figBox.y0 - pad, y1: Math.min(qLabel.y - 4, figBox.y1 + pad) };
      figure = await renderCrop(fp.page, figBox, fp.overlay.filter((it) => it.transform[4] >= figBox.x0 - 20 && it.transform[4] <= figBox.x1 && it.transform[5] >= figBox.y0 - 20 && it.transform[5] <= figBox.y1));
    }

    // Underlines: thin horizontal rects not part of the figure, mapped onto tokens just above them
    const underRects = regionShapes.filter((s) => isThinH(s) && !(figBox && s.y0 >= figBox.y0 && s.y1 <= figBox.y1));
    if (underRects.length) {
      for (const ln of bodyFirst) for (const t of ln.toks) {
        const cx = t.x + t.w / 2;
        if (underRects.some((r) => r.y1 <= t.y + 0.5 && r.y1 >= t.y - 4.5 && cx >= r.x0 - 1 && cx <= r.x1 + 1)) t.u = true;
      }
    }

    // Mark paragraph-ending lines (for page-break continuation logic)
    for (let i = 0; i < L.length; i++) {
      const ln = L[i], nx = L[i + 1];
      ln.short = !nx || ln.x1 + 4 + firstWordWidth(nx) < right - 2;
    }

    const textLines = body.filter((l) => !l.inFigure);
    const gaps = [];
    for (let i = 1; i < L.length; i++) if (L[i].page === L[i - 1].page) { const g = L[i - 1].y - L[i].y; if (g > 8 && g < 30) gaps.push(g); }
    gaps.sort((a, b) => a - b);
    const lineGap = gaps.length ? gaps[Math.floor(gaps.length * 0.3)] : 14.3;
    const gapLimit = lineGap * 1.3;

    const paras = paragraphs(textLines, gapLimit);
    if (!paras.length) throw new Error('empty question body');
    const stemPara = paras.pop();
    const passage = renderParas(paras, left, right, lineGap);
    const stem = renderParas([stemPara], left, right, lineGap);

    // Choices
    const choiceLines = L.slice(aIdx + 1, cIdx);
    const choices = [];
    for (const ln of choiceLines) {
      const m = ln.text.match(/^([A-D])\.\s/);
      if (m && ln.x0 < left + 8) choices.push([ln]);
      else if (choices.length) choices[choices.length - 1].push(ln);
    }
    const choiceHTML = choices.map((ls) => joinLineTexts(ls.map(lineHTML)).replace(/^([A-D])\.\s*/, ''));
    if (choiceHTML.length !== 4) throw new Error(`found ${choiceHTML.length} choices`);
    const answer = (L[cIdx].text.match(/Correct Answer:\s*([A-D])/) || [])[1];
    if (!answer) throw new Error('no correct answer');

    const ratLines = rIdx >= 0 ? L.slice(rIdx + 1) : [];
    const rationale = renderParas(paragraphs(ratLines, gapLimit), left, right, lineGap);

    return {
      id: q.id, domain: SKILLS[skill] || domain, skill, difficulty,
      figure, passage, stem, choices: choiceHTML, answer, rationale,
      text: textOfHTML(passage + ' ' + stem).slice(0, 400),
    };
  }

  window.QBParser = { parse, SKILLS, DOMAINS };
})();
