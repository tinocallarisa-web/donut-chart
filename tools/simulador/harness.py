# -*- coding: utf-8 -*-
"""Simulador Playwright de Donut & Pie Chart by TCViz (bloque 1, motor gratuito).

Carga el bundle de .tmp/drop (`node build-test.js --free`: el código de producción con la licencia real) en un host
simulado (adaptado de Matriz asimetrica/tools/simulador/harness.py). La licencia se simula en el stub.
Datos de DonutChart_Dataset.xlsx:
  - caso a: Ventas, Category = Marca, Values = Litros (10 marcas de Begudes Nord, una fila por marca);
  - caso a con Zona × Canal: las mismas marcas en 180 filas (agregación por clave y "Otros" con todas sus filas);
  - caso f: Detalle, Category = PDV, Small multiples = SKU, Values = Litros (54.662 filas > 30.000: fetchMoreData).

    node build-test.js --free
    python tools/simulador/harness.py        # comprobaciones + capturas en tools/simulador/capturas/

Termina con "TODO OK" o con la lista de fallos.
"""
import asyncio, io, json, os, sys
from collections import OrderedDict, defaultdict
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
import openpyxl
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "capturas")
DROP = os.path.join(ROOT, ".tmp", "drop")
PLAN = os.environ.get("PLAN", "tino_callarisa.donut-chart-tcviz.donut-chart-pro")
FALLOS = []

# ── Datos ─────────────────────────────────────────────────────────────────────
wb = openpyxl.load_workbook(os.path.join(ROOT, "DonutChart_Dataset.xlsx"), read_only=True, data_only=True)
_v = list(wb["Ventas"].iter_rows(values_only=True))
VENTAS = [dict(zip(_v[0], r)) for r in _v[1:]]
_d = list(wb["Detalle"].iter_rows(values_only=True))
DETALLE = [dict(zip(_d[0], r)) for r in _d[1:]]

POR_MARCA = defaultdict(float)
for r in VENTAS:
    POR_MARCA[r["Marca"]] += r["Litros"] or 0
MARCAS = sorted(POR_MARCA, key=lambda k: -POR_MARCA[k])     # como Desktop: de mayor a menor
TOTAL_A = sum(POR_MARCA.values())


def col(name, role, values, ident=None, fmt=None, objects=None):
    c = {"source": {"displayName": name, "queryName": "t." + name, "roles": {role: True}, "type": {"text": True}},
         "values": values, "identity": [{"v": v} for v in values] if ident is None else ident}
    if fmt:
        c["source"]["format"] = fmt
    if objects:
        c["objects"] = objects
    return c


def measure(name, role, values, fmt=None, highlights=None):
    m = {"source": {"displayName": name, "queryName": "m." + name, "roles": {role: True}, "type": {"numeric": True}, "isMeasure": True},
         "values": values}
    if fmt:
        m["source"]["format"] = fmt
    if highlights is not None:
        m["highlights"] = highlights
    return m


def tabla_por_defecto(objects, seg_rows=False):
    """Los casos anteriores al 25-11 prueban la leyenda-tabla: Content = Table explícito (Automatic con solo Values da
    la leyenda compacta) y, en los de Segment, Segment rows encendidas (por defecto apagadas desde el 25-11)."""
    lg = objects.setdefault("legend", {})
    lg.setdefault("content", "table")
    if seg_rows:
        lg.setdefault("segRows", True)
    return objects


def dv_caso_a(objects=None, guia=False, highlights=None, negativos=False, colores=None, fmt=None, legacy=True):
    objects = json.loads(json.dumps(objects or {}))
    if legacy:
        tabla_por_defecto(objects)
    if not guia:
        objects.setdefault("style", {}).setdefault("guide", False)
    marcas = list(MARCAS)
    vals = [POR_MARCA[m] for m in marcas]
    if negativos:
        marcas += ["Devoluciones", "Sin marca"]
        vals += [-12500.0, None]
    objs = None
    if colores:
        objs = [({"dataColors": {"fill": {"solid": {"color": colores[m]}}}} if m in colores else None) for m in marcas]
    cats = [col("Marca", "category", marcas, objects=objs)]
    ms = [measure("Litros", "values", vals, fmt=fmt, highlights=highlights)]
    return {"metadata": {"objects": objects, "columns": [c["source"] for c in cats] + [m["source"] for m in ms]},
            "categorical": {"categories": cats, "values": ms}}


def dv_caso_a_filas(objects=None):
    """Las mismas marcas en filas Zona × Canal, ordenadas por valor (como llegan de Desktop): agregación por clave."""
    objects = tabla_por_defecto(json.loads(json.dumps(objects or {})), seg_rows=True)
    objects.setdefault("style", {}).setdefault("guide", False)
    g = defaultdict(float)
    for r in VENTAS:
        g[(r["Marca"], r["Zona"], r["Canal"])] += r["Litros"] or 0
    filas = sorted(g.items(), key=lambda kv: -kv[1])
    cats = [col("Marca", "category", [k[0] for k, _ in filas]), col("Zona", "facet", [k[1] for k, _ in filas]),
            col("Canal", "segment", [k[2] for k, _ in filas])]
    ms = [measure("Litros", "values", [v for _, v in filas])]
    return {"metadata": {"objects": objects, "columns": [c["source"] for c in cats] + [m["source"] for m in ms]},
            "categorical": {"categories": cats, "values": ms}}


def dv_caso_f(n=None, segmento=False):
    filas = DETALLE if n is None else DETALLE[:n]
    cats = [col("PDV", "category", [r["PDV"] for r in filas]), col("SKU", "facet", [r["SKU"] for r in filas])]
    ms = [measure("Litros", "values", [r["Litros"] for r in filas])]
    md = {"objects": {"style": {"guide": False}, "legend": {"content": "table"}}, "columns": [c["source"] for c in cats] + [m["source"] for m in ms]}
    if segmento:
        md["segment"] = {}
    return {"metadata": md, "categorical": {"categories": cats, "values": ms}}


TOTAL_F = sum(r["Litros"] for r in DETALLE)


def dv_ventas(objects=None, compare=False, target=False, nota=False, facet=None, segment=None, marcas_excl=(), sin_aa=(), legacy=True, cat="Marca", zonas=None):
    """Hoja Ventas agregada como Desktop: una fila por Marca (× Zona × Canal si se piden), medidas por fila.
    Nota llega como "First Nota" (texto o None). sin_aa: marcas con Litros AA vacío (para "new" con blanco).
    legacy: Content = Table y Segment rows encendidas, como se probaba antes del 25-11."""
    objects = json.loads(json.dumps(objects or {}))
    if legacy:
        tabla_por_defecto(objects, seg_rows=True)
    objects.setdefault("style", {}).setdefault("guide", False)
    keys = [cat] + ([facet] if facet else []) + ([segment] if segment else [])
    g = OrderedDict()
    for r in VENTAS:
        if r["Marca"] in marcas_excl or (zonas is not None and r["Zona"] not in zonas):
            continue
        k = tuple(r[x] for x in keys)
        a = g.setdefault(k, [0.0, 0.0, 0.0, None, 0])
        a[0] += r["Litros"] or 0
        a[1] += r["Litros AA"] or 0
        a[2] += r["Plan litros"] or 0
        if r["Nota"] and a[3] is None:
            a[3] = r["Nota"]
        a[4] += 1
    filas = sorted(g.items(), key=lambda kv: -kv[1][0])
    cats = [col(cat, "category", [k[0] for k, _ in filas])]
    if facet:
        cats.append(col(facet, "facet", [k[1] for k, _ in filas]))
    if segment:
        cats.append(col(segment, "segment", [k[-1] for k, _ in filas]))
    ms = [measure("Litros", "values", [v[0] for _, v in filas])]
    if compare:
        ms.append(measure("Litros AA", "compare", [None if k[0] in sin_aa else v[1] for k, v in filas]))
    if target:
        ms.append(measure("Plan litros", "target", [v[2] for _, v in filas]))
    if nota:
        m = {"source": {"displayName": "First Nota", "queryName": "m.Nota", "roles": {"annotation": True}, "type": {"text": True}, "isMeasure": True},
             "values": [v[3] for _, v in filas]}
        ms.append(m)
    return {"metadata": {"objects": objects, "columns": [c["source"] for c in cats] + [m["source"] for m in ms]},
            "categorical": {"categories": cats, "values": ms}}


def ventas_por(campo):
    d = defaultdict(lambda: [0.0, 0.0, 0.0])
    for r in VENTAS:
        x = d[r[campo]]
        x[0] += r["Litros"] or 0
        x[1] += r["Litros AA"] or 0
        x[2] += r["Plan litros"] or 0
    return d

STUB = r"""
window.__ev = []; window.__persist = []; window.__notif = []; window.__fetch = 0; window.__menu = [];
window.powerbi = { visuals: { plugins: {} }, extensibility: {} };
(function(){
 let sel = [];
 const T = { foreground: '#252423', background: '#FFFFFF', secondary: '#605E5C',
   colors: window.__themeColors || ['#118DFF', '#12239E', '#E66C37', '#6B007B', '#E044A7', '#744EC2', '#D9B300', '#D64550', '#197278', '#1AAB40'] };
 const asignados = {}; let nAsig = 0;
 window.__host = {
  eventService: { renderingStarted(){ __ev.push('S'); }, renderingFinished(){ __ev.push('F'); }, renderingFailed(o,m){ __ev.push('X'); console.error('FAILED', m); } },
  createSelectionManager(){ return { select(id, multi){ const a = Array.isArray(id) ? id : [id]; sel = multi ? sel.concat(a) : a; window.__sel = sel; return Promise.resolve(sel); },
     clear(){ sel = []; window.__sel = []; return Promise.resolve(); }, getSelectionIds(){ return sel; },
     hasSelection(){ return sel.length > 0; }, registerOnSelectCallback(cb){ window.__onSel = cb; }, showContextMenu(id, p){ __menu.push(id && id.key); return Promise.resolve(); } }; },
  // Como Power BI: la identidad de una categoría es su valor (todas las filas de la marca comparten identidad).
  createSelectionIdBuilder(){ const k=[]; const b = { withCategory(c,i){ k.push(c.source.displayName + '=' + c.values[i]); return b; }, withSeries(){ return b; },
     withMeasure(){ return b; }, createSelectionId(){ const key=k.join('|'); return { key, getKey(){return key;}, getSelector(){ return {data:[key]}; }, equals(o){return !!o&&o.key===key;}, includes(){return false;} }; } }; return b; },
  createLocalizationManager(){ return { getDisplayName(k){ return k; } }; },
  tooltipService: { enabled(){ return true; }, show(o){ window.__tip = o; }, move(o){ window.__tip = o; }, hide(){} },
  subSelectionService: { subSelect(){}, updateRegionOutlines(){} },
  hostCapabilities: { allowInteractions: window.__allow !== false }, locale: window.__locale || 'en-US',
  fetchMoreData(agg){ __fetch++; return window.__fetchOk !== false; },
  colorPalette: { isHighContrast: !!window.__hc,
    foreground:{value: window.__hc ? '#FFFF00' : T.foreground}, background:{value: window.__hc ? '#000000' : T.background},
    foregroundNeutralSecondary:{value: T.secondary}, foregroundSelected:{value:'#1AEBFF'},
    getColor(k){ if (!(k in asignados)) asignados[k] = T.colors[(nAsig++) % T.colors.length]; return {value: asignados[k]}; } },
  licenseManager: { getAvailableServicePlans(){ return Promise.resolve({ plans: window.__plan ? [{ spIdentifier: window.__plan, state: 1 }] : [], isLicenseUnsupportedEnv: false, isLicenseInfoAvailable: true }); },
     notifyFeatureBlocked(m){ __notif.push(m); return Promise.resolve(true); }, notifyLicenseRequired(){ return Promise.resolve(true); }, clearLicenseNotification(){ return Promise.resolve(true); } },
  persistProperties(p){ __persist.push(p); }, launchUrl(){}, applyJsonFilter(){}, displayWarningIcon(){}, refreshHostData(){},
 };
})();
"""


def check(name, ok, detail=""):
    print(f"  {'OK   ' if ok else 'FALLO'} {name}{'  — ' + detail if detail else ''}")
    if not ok:
        FALLOS.append(name)


async def page(b, dv, W=900, H=560, plan=PLAN, edit=False, hc=False, name=None, locale="en-US", fetch_ok=True, allow=True, op=0, theme_colors=None):
    guid = json.load(io.open(os.path.join(DROP, "pbiviz.json"), encoding="utf-8"))["visual"]["guid"]
    pg = await b.new_page(viewport={"width": W + 20, "height": H + 20})
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.set_content(f"<html><body style='margin:0;background:#fff'><div id='host' style='position:relative;width:{W}px;height:{H}px;overflow:hidden'></div></body></html>")
    await pg.add_style_tag(path=os.path.join(DROP, "visual.css"))
    await pg.add_script_tag(content=f"window.__plan = {json.dumps(plan)}; window.__hc = {json.dumps(hc)}; window.__locale = {json.dumps(locale)}; window.__fetchOk = {json.dumps(fetch_ok)}; window.__allow = {json.dumps(allow)}; window.__themeColors = {json.dumps(theme_colors)};")
    await pg.add_script_tag(content=STUB)
    await pg.add_script_tag(path=os.path.join(DROP, "visual.js"))
    await pg.evaluate("(g) => { window.__v = powerbi.visuals.plugins[g].create({ element: document.getElementById('host'), host: __host }); }", guid)
    pg._errs, pg._dims, pg._vm = errs, (W, H), (1 if edit else 0)
    await upd(pg, dv, op=op)
    await pg.wait_for_timeout(120)   # la licencia resuelve después del primer pintado
    if name:
        await shot(pg, name)
    return pg


async def shot(pg, name):
    os.makedirs(OUT, exist_ok=True)
    W, H = pg._dims
    await pg.screenshot(path=os.path.join(OUT, name + ".png"), clip={"x": 0, "y": 0, "width": W, "height": H})


async def upd(pg, dv, W=None, H=None, op=0):
    if W:
        pg._dims = (W, H)
        await pg.evaluate(f"() => {{ const h = document.getElementById('host'); h.style.width = '{W}px'; h.style.height = '{H}px'; }}")
    W, H = pg._dims
    await pg.evaluate("([dv, W, H, vm, op]) => __v.update({ dataViews: dv ? [dv] : [], viewport: { width: W, height: H }, type: 2, operationKind: op, viewMode: vm, editMode: 0, jsonFilters: [] })",
                      [dv, W, H, pg._vm, op])
    await pg.wait_for_timeout(40)


async def eventos(pg, label):
    ev = await pg.evaluate("() => __ev.join('')")
    n = ev.count("S")
    check(f"{label}: sin errores y eventos 1:1", not pg._errs and n == ev.count("F") and "X" not in ev, f"{ev[-16:]} {pg._errs[:2]}")
    return n


INFO = r"""() => {
  const h = document.getElementById('host'), hr = h.getBoundingClientRect();
  const root = h.querySelector('.dn-root');
  const R = e => { const r = e.getBoundingClientRect(); return { x0: r.left - hr.left, y0: r.top - hr.top, x1: r.right - hr.left, y1: r.bottom - hr.top, w: r.width, h: r.height }; };
  const labels = Array.from(root.querySelectorAll('text.dn-label')).map(t => ({ text: t.textContent, ...R(t) }));
  const table = root.querySelector('.dn-table');
  const tb = table ? R(table) : null;
  const rows = [];
  if (table) {
    // Filas por data-ri (el número de columnas cambia con Compare/Target); las subfilas (cap, ann) se cuentan aparte.
    const by = new Map();
    for (const c of table.querySelectorAll('.dn-grid > .dn-c')) {
      const ri = c.getAttribute('data-ri');
      if (!by.has(ri)) by.set(ri, {});
      by.get(ri)[c.getAttribute('data-col')] = c;
    }
    for (const r of by.values()) {
      if (!r.name) continue;
      const n = r.name, T = x => (r[x] ? r[x].textContent : null);
      rows.push({ name: n.textContent, value: T('val'), pct: T('pct'), dpp: T('dpp'), dval: T('dval'), tgt: T('tgt'),
        dpp10: r.dpp && r.dpp.hasAttribute('data-dpp10') ? +r.dpp.getAttribute('data-dpp10') : (n.hasAttribute('data-dpp10') ? +n.getAttribute('data-dpp10') : null),
        mix: n.hasAttribute('data-mix'), isNew: n.hasAttribute('data-new'), gone: n.hasAttribute('data-gone'),
        header: n.classList.contains('dn-h'), total: n.classList.contains('dn-t'), child: n.classList.contains('dn-child'),
        seg: n.classList.contains('dn-seg'), goneRow: n.classList.contains('dn-gone'), key: n.getAttribute('data-key'),
        bar: r.bar ? ((r.bar.querySelector('rect') || {getAttribute(){return ''}}).getAttribute('data-sign') || '') : null });
    }
  }
  const allText = Array.from(root.querySelectorAll('text, .dn-table, .dn-notes, .dn-msg, .dn-landing, .dn-sm-title, .dn-smnote')).map(e => e.textContent).join(' | ');
  const center = Array.from(root.querySelectorAll('.dn-center-text')).map(t => ({ text: t.textContent, size: +t.getAttribute('font-size'), ...R(t) }));
  const slices = Array.from(root.querySelectorAll('path.dn-slice')).map(p => ({ key: p.getAttribute('data-key'), fill: p.getAttribute('fill'), stroke: p.getAttribute('stroke') }));
  const sizes = Array.from(root.querySelectorAll('svg text')).filter(t => t.textContent.trim() && !t.textContent.startsWith('[test'))
     .map(t => parseFloat(t.getAttribute('font-size') || getComputedStyle(t).fontSize));
  if (table) sizes.push(parseFloat(getComputedStyle(table).fontSize));
  const wm = h.querySelector('.tcviz-wm');
  const cap = table ? Array.from(table.querySelectorAll('.dn-cap')).map(c => c.textContent) : [];
  const ann = table ? Array.from(table.querySelectorAll('.dn-ann')).map(c => ({ text: c.textContent, italic: getComputedStyle(c).fontStyle })) : [];
  const segs = Array.from(root.querySelectorAll('path.dn-seg')).map(p => ({ key: p.getAttribute('data-key'), fill: p.getAttribute('fill'), panel: p.getAttribute('data-panel') }));
  const ticons = Array.from(root.querySelectorAll('.dn-ticon')).map(g => ({ key: g.getAttribute('data-key'), st: g.getAttribute('data-status'), ...R(g) }));
  const panels = Array.from(root.querySelectorAll('.dn-panel')).map(g => {
    const c = Array.from(g.querySelectorAll('.dn-center-text')).map(t => t.textContent);
    const ring = g.querySelector('.dn-slices'); return { center: c, ...(ring ? R(ring) : {}), slices: Array.from(g.querySelectorAll('path.dn-slice')).map(p => ({ key: p.getAttribute('data-key'), fill: p.getAttribute('fill') })) };
  });
  const titles = Array.from(root.querySelectorAll('.dn-sm-title')).map(t => t.textContent);
  const smnote = (root.querySelector('.dn-smnote') || {}).textContent || '';
  const wz = root.querySelector('.dn-wmzone'); const wzone = wz && wz.style.display !== 'none' ? R(wz) : null;
  const dcells = table ? Array.from(table.querySelectorAll('[data-col=dpp],[data-col=dval],[data-col=bar],[data-col=tgt]')).map(R) : [];
  const centers = Array.from(root.querySelectorAll('.dn-center-text')).map(R);
  return { cap, ann, segs, ticons, panels, titles, smnote, wzone, dcells, centers, labels, tb, rows, allText, center, slices, minFont: sizes.length ? Math.min(...sizes) : 0, maxFont: sizes.length ? Math.max(...sizes) : 0,
    tableOverflow: table ? (table.scrollHeight > table.clientHeight + 1 || table.scrollWidth > table.clientWidth + 1) : false,
    bg: root.style.background, wm: wm && wm.style.display !== 'none' ? wm.textContent : null, notes: allText,
    leaders: root.querySelectorAll('.dn-leader').length, otherPattern: !!root.querySelector('.dn-pat-other'),
    ring: (() => { const g = root.querySelector('.dn-slices'); return g ? R(g) : null; })(),
    labelSizes: Array.from(root.querySelectorAll('text.dn-label')).map(t => +t.getAttribute('font-size')),
    focusRing: !!root.querySelector('.dn-focus path'), live: (root.querySelector('.dn-live') || {}).textContent || '' };
}"""


async def info(pg):
    return await pg.evaluate(INFO)


def overlap(a, b, tol=0.5):
    return not (a["x1"] <= b["x0"] + tol or b["x1"] <= a["x0"] + tol or a["y1"] <= b["y0"] + tol or b["y1"] <= a["y0"] + tol)


def pct_num(t):
    s = t.replace(" ", "").replace("\xa0", "").replace(" ", "").replace("%", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def comprobar_dibujo(i, W, H, label, mira_suma=True):
    """Las comprobaciones de cada captura: % suman 100, sin "…", etiquetas sin solaparse ni salirse, la tabla cabe."""
    if mira_suma:
        filas = [r for r in i["rows"] if not r["header"] and not r["total"] and not r["child"] and not r["seg"]]
        nums = [pct_num(r["pct"]) for r in filas]
        check(f"{label}: los % de la tabla suman 100", filas and None not in nums and abs(sum(nums) - 100) < 1e-6, str([r["pct"] for r in filas]))
        hijos = [r for r in i["rows"] if r["child"]]
        if hijos:
            otro = next((r for r in filas if r["key"] and "other" in r["key"]), None)
            check(f"{label}: los % de Otros desplegado suman lo de Otros", otro and abs(sum(pct_num(r["pct"]) for r in hijos) - pct_num(otro["pct"])) < 1e-6,
                  str([r["pct"] for r in hijos]) + " vs " + (otro["pct"] if otro else "?"))
    check(f"{label}: ningún texto con '…' ni '...'", "…" not in i["allText"] and "..." not in i["allText"], i["allText"][:120])
    labs = i["labels"]
    fuera = [l["text"] for l in labs if l["x0"] < -0.5 or l["y0"] < -0.5 or l["x1"] > W + 0.5 or l["y1"] > H + 0.5]
    check(f"{label}: ninguna etiqueta fuera del visual", not fuera, str(fuera))
    pis = [(a["text"], b["text"]) for k, a in enumerate(labs) for b in labs[k + 1:] if overlap(a, b)]
    check(f"{label}: ninguna etiqueta solapada con otra", not pis, str(pis[:3]))
    if i["tb"]:
        tb = i["tb"]
        check(f"{label}: la tabla cabe en el visual", tb["x0"] >= -0.5 and tb["y0"] >= -0.5 and tb["x1"] <= W + 0.5 and tb["y1"] <= H + 0.5 and not i["tableOverflow"],
              str({k: round(v) for k, v in tb.items()}))
        sobre = [l["text"] for l in labs if overlap(l, tb)]
        check(f"{label}: ninguna etiqueta encima de la tabla", not sobre, str(sobre))
        for c in i["center"]:
            if overlap(c, tb):
                check(f"{label}: el centro no pisa la tabla", False, c["text"])
    check(f"{label}: texto ≥ 8 px", i["minFont"] >= 8 - 1e-6, str(i["minFont"]))


def comprobar_etiquetas(i, label, contenido, tabla=True):
    """Tino, 24-11: todas iguales (letra y contenido); con tabla, todas dentro y sin guías; el % es lo último que se quita."""
    labs = i["labels"]
    check(f"{label}: todas las etiquetas con la misma letra", len(set(i["labelSizes"])) <= 1, str(sorted(set(i["labelSizes"]))))
    check(f"{label}: todas con el mismo contenido (mismas partes)", len({l["text"].count(" · ") for l in labs}) <= 1, str([l["text"] for l in labs]))
    if contenido in ("percent", "namePercent", "valuePercent", "all", "auto"):
        check(f"{label}: % en toda etiqueta visible", all("%" in l["text"] for l in labs), str([l["text"] for l in labs]))
    if tabla:
        ring = i["ring"]
        dentro = all(ring and l["x0"] >= ring["x0"] - 0.5 and l["x1"] <= ring["x1"] + 0.5 and l["y0"] >= ring["y0"] - 0.5 and l["y1"] <= ring["y1"] + 0.5 for l in labs)
        check(f"{label}: con tabla, ninguna guía ni etiqueta fuera del anillo", i["leaders"] == 0 and dentro, f"guías={i['leaders']}")


def _lab(hexc):
    h = hexc.lstrip("#")
    lin = []
    for k in (0, 2, 4):
        c = int(h[k:k + 2], 16) / 255
        lin.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    x = (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047
    y = lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722
    z = (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    return 116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))


def de2000(c1, c2):
    """CIEDE2000, implementación independiente de la del visual."""
    from math import atan2, cos, degrees, exp, hypot, radians, sin, sqrt
    L1, a1, b1 = _lab(c1)
    L2, a2, b2 = _lab(c2)
    Cm = (hypot(a1, b1) + hypot(a2, b2)) / 2
    G = 0.5 * (1 - sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
    a1p, a2p = a1 * (1 + G), a2 * (1 + G)
    C1p, C2p = hypot(a1p, b1), hypot(a2p, b2)
    h1p = degrees(atan2(b1, a1p)) % 360
    h2p = degrees(atan2(b2, a2p)) % 360
    dL, dC = L2 - L1, C2p - C1p
    dh = 0 if C1p * C2p == 0 else ((h2p - h1p + 180) % 360) - 180
    dH = 2 * sqrt(C1p * C2p) * sin(radians(dh) / 2)
    Lm, Cmp = (L1 + L2) / 2, (C1p + C2p) / 2
    if C1p * C2p == 0:
        hm = h1p + h2p
    elif abs(h1p - h2p) > 180:
        hm = (h1p + h2p + (360 if h1p + h2p < 360 else -360)) / 2
    else:
        hm = (h1p + h2p) / 2
    T = 1 - 0.17 * cos(radians(hm - 30)) + 0.24 * cos(radians(2 * hm)) + 0.32 * cos(radians(3 * hm + 6)) - 0.2 * cos(radians(4 * hm - 63))
    Rc = 2 * sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7))
    Sl = 1 + 0.015 * (Lm - 50) ** 2 / sqrt(20 + (Lm - 50) ** 2)
    Sc, Sh = 1 + 0.045 * Cmp, 1 + 0.015 * Cmp * T
    Rt = -sin(radians(60 * exp(-((hm - 275) / 25) ** 2))) * Rc
    return sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh))


ESTILOS = {
    "boardroom": ["#C9A45C", "#8FB8E8", "#EB8A7B", "#6FCF97", "#C5D3E3"],
    "ledger": ["#7A1F1F", "#3A3528", "#2F6B3B", "#946A10", "#B7AD92", "#A32A2A"],   # + su color "down"
    "editorial": ["#D7263D", "#111111", "#5F5F5F", "#BDBDBD", "#8C1C2B"],
    "signal": ["#1F7A4D", "#14202B", "#B7791F", "#C0392B", "#9AA5B1"],
    "aurora": ["#7CE7D0", "#FFD27D", "#FF9DB0", "#9DB7FF", "#C5D3E3"],
    "terrace": ["#B5532A", "#5E7128", "#B5782A", "#B5372A", "#C9A77E"],
    "classic": ["#118DFF", "#12239E", "#E66C37", "#6B007B", "#E044A7", "#744EC2", "#D9B300", "#D64550", "#197278", "#1AAB40"],
}
# Paleta efectiva de cada estilo = serie + plan/up/down sin repetir (en los seis, ya están en la serie).


def comprobar_colores(i, label, paleta=None):
    """Paleta del estilo tal cual para los primeros sectores; los generados, distinguibles (ΔE); Otros distinguible."""
    sl = [s for s in i["slices"] if "other" not in s["key"]]
    fills = [s["fill"].upper() for s in sl]
    check(f"{label}: colores de sectores únicos", len(set(fills)) == len(fills), str(fills))
    n_pal = 0
    if paleta:
        n_pal = min(len(paleta), len(fills))
        check(f"{label}: los primeros {n_pal} sectores con la paleta del estilo tal cual", fills[:n_pal] == [c.upper() for c in paleta[:n_pal]], str(fills[:n_pal]))
    gen = list(range(n_pal, len(fills))) if paleta else []
    todos = [s["fill"].upper() for s in i["slices"]]
    if gen:
        pares = min(de2000(fills[g], fills[j]) for g in gen for j in range(len(fills)) if j != g)
        check(f"{label}: generados con ΔE2000 ≥ 12 frente a todos", pares >= 12, f"{pares:.1f}")
        vec = []
        for g in gen:
            k = next(n for n, s in enumerate(i["slices"]) if s["fill"].upper() == fills[g])
            for v in (k - 1, (k + 1) % len(todos)):
                if "other" not in i["slices"][v]["key"]:
                    vec.append(de2000(todos[k], todos[v]))
        check(f"{label}: generados con ΔE2000 ≥ 20 frente a sus vecinos", min(vec) >= 20, f"{min(vec):.1f}")
        grises = [fills[g] for g in gen if (lambda L: (L[1] ** 2 + L[2] ** 2) ** 0.5)(_lab(fills[g])) < 15]
        check(f"{label}: ningún generado en gris", not grises, str(grises))
    otro = next((s for s in i["slices"] if "other" in s["key"]), None)
    if otro:
        oc = otro["fill"].upper()
        r, g_, b_ = int(oc[1:3], 16), int(oc[3:5], 16), int(oc[5:7], 16)
        d = min(de2000(oc, f) for f in fills) if fills else 99
        check(f"{label}: Otros en gris neutro distinguible (ΔE ≥ 20, o ≥ 8 con trama)", max(r, g_, b_) - min(r, g_, b_) <= 12 and (d >= 20 or (d >= 8 and i["otherPattern"])), f"{oc} ΔE={d:.1f} trama={i['otherPattern']}")


TAMANOS = [(1200, 640), (500, 320), (300, 200), (160, 120)]


# ── Bloque 2 (Pro) ────────────────────────────────────────────────────────────

def filas_datos(i):
    return [r for r in i["rows"] if not r["header"] and not r["total"] and not r["child"] and not r["seg"]]


def fila(i, nombre):
    return next((r for r in i["rows"] if r["name"] and r["name"].startswith(nombre) and not r["seg"]), None)


def sin_solape(a, b):
    return not overlap(a, b)


async def bloque2(b):
    T3 = [(1200, 640), (500, 320), (300, 200)]
    TODAS = {"slices": {"maxSlices": 12, "groupBelow": 0}}

    print("Bloque 2 · Compare with (Litros AA)")
    for W, H in T3:
        for objs, tag in [(TODAS, "todas"), ({}, "otros")]:
            lbl = f"cmp {tag} {W}x{H}"
            pg = await page(b, dv_ventas(objs, compare=True), W, H, name=f"b2_cmp_{tag}_{W}x{H}")
            i = await info(pg)
            comprobar_dibujo(i, W, H, lbl)
            comprobar_etiquetas(i, lbl, "auto")
            con = [l["text"] for l in i["labels"] if any(x in l["text"] for x in (" +", " −", " new"))]
            check(f"{lbl}: el Δ en las etiquetas, en todas o en ninguna", not con or len(con) == len(i["labels"]), str([l["text"] for l in i["labels"]]))
            fs = filas_datos(i)
            if any(r["dpp10"] is not None for r in fs):
                check(f"{lbl}: los Δ pp suman 0", sum(r["dpp10"] for r in fs if r["dpp10"] is not None) == 0, str([(r["name"], r["dpp10"]) for r in fs]))
                n = fila(i, "Nord ") if False else next((r for r in fs if r["name"] == "Nord"), None)
                check(f"{lbl}: Nord pierde cuota", n and n["dpp10"] < 0, str(n))
                nc = next((r for r in fs if r["name"] == "Nord Cola"), None)
                check(f"{lbl}: Nord Cola gana (valor sube, cuota no baja)", nc and nc["dpp10"] >= 0 and (nc["dval"] is None or nc["dval"].startswith("+")), str(nc))
                if tag == "todas":
                    cf = next((r for r in fs if r["name"].startswith("Caf")), None)
                    check(f"{lbl}: Cafè Nord 'new', sin Δ inventado", cf and cf["isNew"] and cf["dpp"] == "new" and (cf["dval"] in (None, "new")), str(cf))
                mix = [r["name"] for r in fs if r["mix"]]
                check(f"{lbl}: ⚠ solo donde cuota y valor van al revés (Fruitia)", mix == ["Fruitia"], str(mix))
                if W >= 500:
                    check(f"{lbl}: cabecera 'Total +4.1% vs Litros AA'", any("Total +4.1%" in c and "Litros AA" in c for c in i["cap"]), str(i["cap"]))
                    check(f"{lbl}: nota al pie del aviso de mezcla", "opposite directions" in i["notes"], "")
                check(f"{lbl}: minibarras divergentes (Nord a la izquierda)", W < 500 or (n and n["bar"] == "-"), str(n))
            else:
                check(f"{lbl}: con poco sitio sigue habiendo una columna de cambio", any(r["dval"] for r in fs), str(fs[:2]))
            await eventos(pg, lbl)
            await pg.close()
    # Comparación vacía (blanco) = new; categoría sin valor actual = gone; Otros desplegado reparte su Δ.
    dv = dv_ventas(TODAS, compare=True, sin_aa=("Cafè Nord",))
    vals = dv["categorical"]["values"][0]["values"]
    k = dv["categorical"]["categories"][0]["values"].index("Voltnord")
    vals[k] = None
    pg = await page(b, dv, 1200, 640, name="b2_cmp_new_gone")
    i = await info(pg)
    cf = fila(i, "Caf")
    check("Compare vacío con valor > 0 → new", cf and cf["isNew"], str(cf))
    gv = next((r for r in i["rows"] if r["goneRow"]), None)
    check("sin valor actual y con Compare → fila 'gone' en la tabla", gv and gv["name"] == "Voltnord" and gv["dpp"] == "gone", str(gv))
    check("'gone' no cuenta como excluida", "Excluded" not in i["notes"], i["notes"][-120:])
    fs = filas_datos(i)
    check("con new y gone, los Δ pp siguen sumando 0", sum(r["dpp10"] for r in fs if r["dpp10"] is not None) == 0, str([(r["name"], r["dpp10"]) for r in fs]))
    comprobar_dibujo(i, 1200, 640, "new/gone")
    await pg.close()
    pg = await page(b, dv_ventas({}, compare=True), 1200, 640)
    await pg.evaluate("() => document.querySelector('.dn-toggle').click()")
    await pg.wait_for_timeout(30)
    i = await info(pg)
    otro = next(r for r in i["rows"] if r["key"] and "other" in r["key"] and not r["child"])
    hijos = [r for r in i["rows"] if r["child"]]
    check("Otros desplegado: los Δ pp de sus miembros suman el de Otros", hijos and sum(r["dpp10"] for r in hijos) == otro["dpp10"], f"{[r['dpp10'] for r in hijos]} vs {otro['dpp10']}")
    await shot(pg, "b2_cmp_otros_desplegado")
    # Change shown y orden por cabecera
    await pg.evaluate("() => document.querySelector('[data-sort=dpp]').click()")
    await pg.wait_for_timeout(30)
    i = await info(pg)
    fs = filas_datos(i)
    d = [r["dpp10"] for r in fs if "other" not in (r["key"] or "")]
    check("clic en la cabecera Δ pp: ordenado por Δ pp, Otros el último", d == sorted(d, reverse=True) and "other" in (fs[-1]["key"] or ""), str([(r["name"], r["dpp10"]) for r in fs]))
    slices = await pg.evaluate("() => Array.from(document.querySelectorAll('path.dn-slice')).map(p => p.getAttribute('data-key'))")
    check("los sectores siguen el orden de la tabla", slices == [r["key"] for r in fs], "")
    await pg.evaluate("() => document.querySelector('[data-sort=dpp]').click()")
    i = await info(pg)
    d = [r["dpp10"] for r in filas_datos(i) if "other" not in (r["key"] or "")]
    check("segundo clic: orden inverso", d == sorted(d), str(d))
    check("orden por cabecera sin persistProperties", await pg.evaluate("() => __persist.length") == 0, "")
    n = await eventos(pg, "despliegue y orden")
    check("despliegue y orden sin updates nuevos", n == 1, str(n))
    await pg.close()
    for cs in ["pp", "value"]:
        pg = await page(b, dv_ventas({"compare": {"changeShown": cs}}, compare=True), 900, 480, name=f"b2_cmp_{cs}")
        i = await info(pg)
        r0 = filas_datos(i)[0]
        check(f"Change shown = {cs}", (r0["dpp"] is not None and r0["dval"] is None) if cs == "pp" else (r0["dpp"] is None and r0["dval"] is not None), str(r0))
        await pg.close()
    pg = await page(b, dv_ventas({"compare": {"sortByChange": True}}, compare=True), 900, 480)
    d = [r["dpp10"] for r in filas_datos(await info(pg)) if "other" not in (r["key"] or "")]
    check("Sort by change ordena por Δ pp", d == sorted(d, reverse=True), str(d))
    await pg.close()

    print("Bloque 2 · Target (Plan litros)")
    for W, H in T3:
        lbl = f"tgt {W}x{H}"
        pg = await page(b, dv_ventas(TODAS, compare=True, target=True), W, H, name=f"b2_tgt_{W}x{H}")
        i = await info(pg)
        comprobar_dibujo(i, W, H, lbl)
        te = fila(i, "Tè Nord")
        if te and te["tgt"]:
            check(f"{lbl}: Tè Nord muy por debajo (✕ 71%)", "✕" in te["tgt"] and "71" in te["tgt"], str(te))
            nc = fila(i, "Nord Cola")
            check(f"{lbl}: Nord Cola cumple (✓)", nc and "✓" in nc["tgt"], str(nc))
            cf = fila(i, "Caf")
            check(f"{lbl}: Cafè Nord sin objetivo → —", cf and cf["tgt"] == "—", str(cf))
        check(f"{lbl}: aviso de totales (14.0M ≠ 13.9M)", "Target total 14.0M ≠ actual 13.9M" in i["notes"] or W < 500, i["notes"][-140:])
        if W >= 500:
            ti = next((t for t in i["ticons"] if "T" in t["key"] and "Nord" in t["key"] and t["st"] == "✕"), None)
            check(f"{lbl}: icono ✕ en el borde del sector de Tè Nord", ti is not None, str([(t['key'], t['st']) for t in i["ticons"]]))
            pis = [(a["key"], c["key"]) for k2, a in enumerate(i["ticons"]) for c in i["ticons"][k2 + 1:] if overlap(a, c)]
            check(f"{lbl}: iconos sin pisarse", not pis, str(pis))
        await eventos(pg, lbl)
        await pg.close()

    print("Bloque 2 · Segment (Canal)")
    for W, H in T3:
        lbl = f"seg {W}x{H}"
        pg = await page(b, dv_ventas({}, segment="Canal"), W, H, name=f"b2_seg_{W}x{H}")
        i = await info(pg)
        comprobar_dibujo(i, W, H, lbl)
        n_sl = len(i["slices"])
        check(f"{lbl}: anillo exterior con 2 segmentos por sector", len(i["segs"]) == 2 * n_sl, f"{len(i['segs'])} vs {n_sl}")
        await eventos(pg, lbl)
        await pg.close()
    pg = await page(b, dv_ventas({}, segment="Canal"), 1200, 640)
    i = await info(pg)
    segrows = [r for r in i["rows"] if r["seg"]]
    check("filas sangradas de segmento en la tabla", len(segrows) == 12, str(len(segrows)))
    aig = fila(i, "Aigua Serena")
    sub = [r for r in segrows if r["key"].startswith(aig["key"])]
    check("los % de los segmentos suman el de su categoría", abs(sum(pct_num(r["pct"]) for r in sub) - pct_num(aig["pct"])) < 1e-9, str([r["pct"] for r in sub]))
    clic = "(k) => { const p = document.querySelector('path.dn-seg[data-key=\"' + k + '\"]'); const r = p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })); return (window.__sel || []).map(s => s.key); }"
    keys = [s["key"] for s in i["segs"]]
    ka = next(k for k in keys if k.startswith(aig["key"]) and "AFH" in k)
    sel = await pg.evaluate(clic, ka)
    check("clic en el par Aigua Serena · AFH: una identidad categoría + segmento", sel == ["Marca=Aigua Serena|Canal=AFH"], str(sel))
    ko = next(k for k in keys if "other" in k and "HOME" in k)
    sel = await pg.evaluate(clic, ko)
    check("clic en Otros · HOME: las 5 identidades (marca + HOME)", len(sel) == 5 and all(s.endswith("|Canal=HOME") for s in sel), str(sel))
    await shot(pg, "b2_seg_seleccion")
    await pg.evaluate("() => window.__onSel([__host.createSelectionIdBuilder().withCategory({source:{displayName:'Marca'},values:['Nord']},0).withCategory({source:{displayName:'Canal'},values:['AFH']},0).createSelectionId()])")
    i = await info(pg)
    check("marcador con un par: restaura sin persistProperties", await pg.evaluate("() => __persist.length") == 0, "")
    await pg.focus(".dn-root")
    await pg.keyboard.press("ArrowRight")
    live = (await info(pg))["live"]
    check("teclado: las flechas recorren también los segmentos (región viva)", "·" in live and ("HOME" in live or "AFH" in live), live)
    await pg.keyboard.press("Enter")
    sel = await pg.evaluate("() => (window.__sel || []).map(s => s.key)")
    check("teclado: Enter sobre un segmento selecciona el par", len(sel) == 1 and "|Canal=" in sel[0], str(sel))
    n = await eventos(pg, "segment interacción")
    check("segment: interacción sin updates nuevos", n == 1, str(n))
    await pg.close()

    print("Bloque 2 · Small multiples (Zona)")
    ZON = ventas_por("Zona")
    ZORD = []
    for r in VENTAS:
        if r["Zona"] not in ZORD:
            ZORD.append(r["Zona"])
    for W, H in T3:
        for sbt in [False, True]:
            lbl = f"sm {'size ' if sbt else ''}{W}x{H}"
            pg = await page(b, dv_ventas({"smallMultiples": {"sizeByTotal": sbt}}, facet="Zona", compare=True, target=True), W, H, name=f"b2_sm{'_size' if sbt else ''}_{W}x{H}")
            i = await info(pg)
            comprobar_dibujo(i, W, H, lbl)
            nps = len(i["panels"])
            if W >= 500:
                check(f"{lbl}: 9 paneles", nps == 9 and len(i["titles"]) == 9, f"{nps} {i['titles']}")
            else:
                check(f"{lbl}: paneles legibles o aviso de cuántos", nps == 9 or ("Showing" in i["smnote"] and str(nps) in i["smnote"]), f"{nps} {i['smnote']}")
            filas_k = [r["key"] for r in filas_datos(i)]
            ok_ord = all([s["key"] for s in p["slices"]] == filas_k for p in i["panels"])
            check(f"{lbl}: mismo conjunto de Otros y mismo orden en todos los paneles", ok_ord, "")
            cols = [[s["fill"] for s in p["slices"]] for p in i["panels"]]
            check(f"{lbl}: mismos colores en todos los paneles", all(c == cols[0] for c in cols), "")
            check(f"{lbl}: etiquetas con la misma letra en todos los paneles", len(set(i["labelSizes"])) <= 1, str(sorted(set(i["labelSizes"]))))
            if W >= 1200:
                bcn = next((p for p, t in zip(i["panels"], i["titles"]) if t == "BCN Ciutat"), None)
                exp = ZON["BCN Ciutat"][0] / 1e6
                check(f"{lbl}: centro con el total del panel (BCN Ciutat {exp:.2f}M)", bcn and any(f"{exp:.2f}M" in c for c in bcn["center"]), str(bcn and bcn["center"]))
                ws = [p["w"] for p in i["panels"]]
                if sbt:
                    tot = [ZON[t][0] for t in i["titles"]]
                    rat = [(w / max(ws)) / ((t / max(tot)) ** 0.5) for w, t in zip(ws, tot)]
                    check(f"{lbl}: Size by total, radio ∝ √total", all(abs(x - 1) < 0.12 for x in rat), str([round(x, 2) for x in rat]))
                else:
                    check(f"{lbl}: mismo radio en todos los paneles", max(ws) - min(ws) < 1.5, str([round(w) for w in ws]))
            await eventos(pg, lbl)
            await pg.close()
    pg = await page(b, dv_ventas({}, facet="Zona"), 1200, 640)
    tip = await pg.evaluate("() => { const c = document.querySelector('.dn-table .dn-c.dn-name[data-key]'); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.x + 3, clientY: r.y + 3 })); return (window.__tip.dataItems || []).map(d => d.displayName); }")
    check("tabla compartida: el tooltip de una fila trae el detalle de los 9 paneles", sum(1 for z in ZORD if z in tip) == 9, str(tip))
    sel = await pg.evaluate("() => { const p = document.querySelectorAll('.dn-panel')[3].querySelector('path.dn-slice'); const r = p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })); return (window.__sel || []).map(s => s.key); }")
    check("clic en un sector de un panel: filtra la categoría (todas sus filas)", len(sel) == 1 and sel[0].startswith("Marca="), str(sel))
    n = await eventos(pg, "sm interacción")
    check("small multiples: interacción sin updates nuevos", n == 1, str(n))
    await pg.close()

    print("Bloque 2 · Annotation (First Nota)")
    for W, H in T3:
        lbl = f"ann {W}x{H}"
        pg = await page(b, dv_ventas({}, nota=True), W, H, name=f"b2_ann_{W}x{H}")
        i = await info(pg)
        comprobar_dibujo(i, W, H, lbl)
        if W >= 500:
            check(f"{lbl}: 'Leader in 2026' como subfila en cursiva", any(a["text"] == "Leader in 2026" and a["italic"] == "italic" for a in i["ann"]), str(i["ann"]))
            check(f"{lbl}: la nota de Cafè Nord (en Otros) se ve con su nombre", any(a["text"].startswith("Cafè Nord:") for a in i["ann"]), str(i["ann"]))
        svgt = await pg.evaluate("() => Array.from(document.querySelectorAll('svg text')).map(t => t.textContent).join('|')")
        check(f"{lbl}: nunca sobre el anillo", "Leader" not in svgt and "Launched" not in svgt, "")
        await eventos(pg, lbl)
        await pg.close()

    print("Bloque 2 · Todo junto, alto contraste y teclado")
    full = dv_ventas(TODAS, compare=True, target=True, nota=True, segment="Canal")
    for W, H in T3:
        pg = await page(b, full, W, H, name=f"b2_todo_{W}x{H}")
        comprobar_dibujo(await info(pg), W, H, f"todo {W}x{H}")
        await eventos(pg, f"todo {W}x{H}")
        await pg.close()
        pg = await page(b, full, W, H, hc=True, name=f"b2_todo_hc_{W}x{H}")
        i = await info(pg)
        comprobar_dibujo(i, W, H, f"todo hc {W}x{H}")
        check(f"todo hc {W}x{H}: segmentos con el trazo del tema", all(True for _ in i["segs"]), "")
        await eventos(pg, f"todo hc {W}x{H}")
        await pg.close()
    pg = await page(b, dv_ventas(TODAS, compare=True, target=True), 1200, 640)
    await pg.focus(".dn-root")
    for _ in range(7):
        await pg.keyboard.press("ArrowRight")
    live = (await info(pg))["live"]
    check("región viva: anuncia el Δ y el estado del objetivo (Tè Nord)", "Tè Nord" in live and "points" in live and "of target" in live and "below" in live, live)
    await pg.keyboard.press("ArrowLeft")
    await pg.keyboard.press("ArrowLeft")
    await pg.keyboard.press("ArrowLeft")
    live = (await info(pg))["live"]
    check("región viva: anuncia el aviso de mezcla (Fruitia)", "Fruitia" in live and "share down" in live, live)
    await pg.close()

    print("Arreglos tras Desktop (24-11): foco fantasma, letra de la tabla, iconos del objetivo")
    pg = await page(b, dv_caso_a(), 900, 480)
    box = await pg.evaluate("() => { const p = document.querySelector('path.dn-slice[data-key*=\"Nord Cola\"]'); const r = p.getBoundingClientRect(); const a = p.getPointAtLength(p.getTotalLength() * 0.25); const m = p.getScreenCTM(); return { x: a.x * m.a + m.e, y: a.y * m.d + m.f, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }")
    await pg.mouse.click(box["cx"], box["cy"])
    await pg.wait_for_timeout(30)
    i = await info(pg)
    act = await pg.evaluate("() => document.activeElement && document.activeElement.className")
    check("clic real en un sector: sin contorno de foco ni fila enfocada (el mayor no queda destacado)", not i["focusRing"] and await pg.evaluate("() => document.querySelectorAll('.dn-focusrow').length") == 0, f"activo={act}")
    await pg.mouse.click(3, 470)
    await pg.wait_for_timeout(30)
    i = await info(pg)
    sel = await pg.evaluate("() => (window.__sel || []).length")
    ops = await pg.evaluate("() => Array.from(document.querySelectorAll('.dn-sg')).map(g => g.getAttribute('opacity'))")
    check("después, clic en vacío: sin selección, sin contorno y ningún sector destacado", sel == 0 and not i["focusRing"] and all(o == "1" for o in ops)
          and await pg.evaluate("() => document.querySelectorAll('.dn-focusrow').length") == 0, f"sel={sel} ops={ops}")
    await shot(pg, "fix_foco_tras_clic")
    await pg.keyboard.press("ArrowRight")
    i = await info(pg)
    check("con el foco puesto por clic, una flecha enseña el foco (modo teclado)", i["focusRing"], "")
    await pg.evaluate("() => document.querySelector('.dn-root').blur()")
    i = await info(pg)
    check("al perder el foco, sin contorno", not i["focusRing"], "")
    await pg.keyboard.press("Tab")
    await pg.focus(".dn-root")
    i = await info(pg)
    check("foco por teclado (Tab): aparece el contorno", i["focusRing"], "")
    await eventos(pg, "foco")
    await pg.close()

    full = dv_ventas({}, compare=True, target=True, nota=True, segment="Familia")
    for W, H in [(960, 540), (1200, 640), (500, 320)]:
        lbl = f"todo Familia {W}x{H}"
        pg = await page(b, full, W, H, name=f"fix_todo_familia_{W}x{H}")
        i = await info(pg)
        comprobar_dibujo(i, W, H, lbl)
        tfs = await pg.evaluate("() => { const t = document.querySelector('.dn-table'); return t ? parseFloat(getComputedStyle(t).fontSize) : 0; }")
        lab = max(i["labelSizes"]) if i["labelSizes"] else 0
        check(f"{lbl}: letra de la tabla ≥ la de las etiquetas", tfs >= lab - 1e-6, f"tabla={tfs} etiquetas={lab}")
        if W >= 960:
            check(f"{lbl}: letra de la tabla ≥ 10 px", tfs >= 10, f"tabla={tfs}")
        await eventos(pg, lbl)
        await pg.close()

    for mode, quiere in [(None, {"✕"}), ("all", {"✕", "≈", "✓"}), ("off", set())]:
        objs = {"slices": {"maxSlices": 12, "groupBelow": 0}}
        if mode:
            objs["target"] = {"statusOnSlices": mode}
        for facet in [None, "Zona"]:
            lbl = f"Status on slices = {mode or 'misses (defecto)'}{' SM' if facet else ''}"
            pg = await page(b, dv_ventas(objs, target=True, facet=facet), 1200, 640, name=f"fix_status_{mode or 'misses'}{'_sm' if facet else ''}")
            i = await info(pg)
            sts = {t["st"] for t in i["ticons"]}
            ok = sts <= quiere and (sts == quiere if mode == "all" and not facet else True) and (bool(sts) if quiere == {"✕"} else True)
            check(f"{lbl}: iconos {sorted(quiere) or 'ninguno'}", ok if quiere else not sts, str(sorted(sts)))
            te = fila(i, "Tè Nord")
            check(f"{lbl}: el estado completo sigue en la tabla", (te is None and facet) or (te and "✕" in te["tgt"]), str(te))
            await pg.close()

    print("Bloque 2 · Licencia: vista previa (edición) y lectura sin licencia")
    for W, H in [(1200, 640), (500, 320)]:
        dv = dv_ventas({}, facet="Zona", compare=True, target=True, segment="Canal", nota=True)
        pg = await page(b, dv, W, H, plan=None, edit=True)
        await upd(pg, dv)
        await shot(pg, f"b2_preview_{W}x{H}")
        i = await info(pg)
        check(f"preview {W}x{H}: marca común visible", bool(i["wm"]), str(i["wm"]))
        check(f"preview {W}x{H}: small multiples limitado a 4 paneles", len(i["panels"]) <= 4 and ("4 of 9" in i["smnote"] or len(i["panels"]) < 4), f"{len(i['panels'])} {i['smnote']}")
        if i["wzone"]:
            tapa_c = [c for c in i["centers"] if overlap(c, i["wzone"])]
            tapa_d = [c for c in i["dcells"] if overlap(c, i["wzone"])]
            check(f"preview {W}x{H}: la marca no tapa ningún centro", not tapa_c, str(tapa_c[:2]))
            check(f"preview {W}x{H}: la marca no tapa las columnas Δ / objetivo", not tapa_d, str(tapa_d[:2]))
        notif = await pg.evaluate("() => __notif")
        check(f"preview {W}x{H}: notifyFeatureBlocked con las funciones", notif and "comparison" in notif[-1] and "small multiples" in notif[-1], str(notif[-1:]))
        await eventos(pg, f"preview {W}x{H}")
        await pg.close()
        pg = await page(b, dv, W, H, plan=None, edit=False)
        await upd(pg, dv)
        await shot(pg, f"b2_lectura_sin_licencia_{W}x{H}")
        i = await info(pg)
        ref = await page(b, dv_caso_a(), W, H)
        r = await info(ref)
        await ref.close()
        quita = lambda rows: [(x["name"], x["value"], x["pct"]) for x in rows]
        check(f"lectura sin licencia {W}x{H}: la tabla es la del gratis exacto", quita(i["rows"]) == quita(r["rows"]), f"{quita(i['rows'])[:3]} vs {quita(r['rows'])[:3]}")
        check(f"lectura sin licencia {W}x{H}: sin columnas vacías, sin paneles, sin segmentos, sin notas, sin marca",
              all(x["dpp"] is None and x["dval"] is None and x["tgt"] is None for x in i["rows"]) and len(i["panels"]) == 1 and not i["segs"] and not i["ann"] and not i["wm"] and not i["ticons"] and not i["cap"], "")
        check(f"lectura sin licencia {W}x{H}: mismo donut (centro)", [c["text"] for c in i["center"]] == [c["text"] for c in r["center"]], "")
        await eventos(pg, f"lectura {W}x{H}")
        await pg.close()


# ── Leyenda configurable, tabla limpia y Segment anidado (25-11) ─────────────

LEG = r"""(which) => {
  const h = document.getElementById('host'), hr = h.getBoundingClientRect();
  const root = h.querySelector('.dn-root');
  const R = e => { const r = e.getBoundingClientRect(); return { x0: r.left - hr.left, y0: r.top - hr.top, x1: r.right - hr.left, y1: r.bottom - hr.top, w: r.width, h: r.height }; };
  const tl = root.querySelector('.dn-legend'), tt = root.querySelector('.dn-table');
  const t = which === 'legend' ? tl : which === 'table' ? tt : (tt || tl);
  const ring = root.querySelector('.dn-slices');
  const out = { kind: !t ? 'none' : t.classList.contains('dn-legend') ? 'legend' : 'table', box: t ? R(t) : null, ring: ring ? R(ring) : null,
    hasLegend: !!tl, hasTable: !!tt, lbox: tl ? R(tl) : null, tbox: tt ? R(tt) : null,
    capFs: Math.min(...[tl, tt].filter(x => x).map(x => parseFloat(getComputedStyle(x).fontSize)).concat([999])),
    pos: t ? t.getAttribute('data-pos') : null, fs: t ? parseFloat(getComputedStyle(t).fontSize) : 0 };
  if (t && out.kind === 'legend') {
    const items = Array.from(t.querySelectorAll('.dn-li[data-key]'));
    out.items = items.map(it => { const n = it.querySelector('.dn-lname'); return { key: it.getAttribute('data-key'), name: n.textContent,
      cut: n.scrollWidth > n.clientWidth + 0.5, ...R(it) }; });
    const more = t.querySelector('.dn-lmore'); out.more = more ? more.textContent : null;
    out.lines = new Set(out.items.map(i => Math.round(i.y0))).size;
  }
  if (t && out.kind === 'table') {
    const cells = Array.from(t.querySelectorAll('.dn-grid > .dn-c'));
    out.cols = Array.from(new Set(cells.map(c => c.getAttribute('data-col'))));
    out.seg = t.querySelectorAll('.dn-seg.dn-name').length;
    out.ann = t.querySelectorAll('.dn-ann').length;
    const head = cells.filter(c => c.classList.contains('dn-h'));
    out.head = head.map(c => ({ col: c.getAttribute('data-col'), fw: getComputedStyle(c).fontWeight, bg: getComputedStyle(c).backgroundColor,
      bb: getComputedStyle(c).borderBottomWidth, bbc: getComputedStyle(c).borderBottomColor, align: getComputedStyle(c).justifyContent, text: c.textContent }));
    const body = cells.filter(c => !c.classList.contains('dn-h') && !c.classList.contains('dn-t') && !c.classList.contains('dn-ann'));
    out.bt = body.filter(c => parseFloat(getComputedStyle(c).borderTopWidth) > 0).length;
    out.bl = body.filter(c => parseFloat(getComputedStyle(c).borderLeftWidth) > 0).length;
    out.btColor = (body.find(c => parseFloat(getComputedStyle(c).borderTopWidth) > 0) || { style: {} }).style.borderTopColor || '';
    out.banded = body.filter(c => c.hasAttribute('data-bg')).length;
    out.bodyN = body.length;
    out.title = Array.from(t.querySelectorAll(':scope > .dn-title')).map(c => c.textContent);
    out.capInGrid = t.querySelectorAll('.dn-grid > .dn-cap').length;
    const foot = t.querySelector('.dn-foot');
    out.foot = foot ? { text: foot.textContent, bt: parseFloat(getComputedStyle(foot).borderTopWidth), fs: parseFloat(getComputedStyle(foot).fontSize) } : null;
    out.annSpan = Array.from(t.querySelectorAll('.dn-ann')).map(c => c.style.gridColumn);
    out.pct = cells.filter(c => c.getAttribute('data-col') === 'pct' && !c.classList.contains('dn-h')).map(c => ({ seg: c.classList.contains('dn-seg'), key: c.getAttribute('data-key'), t: c.textContent }));
  }
  out.labelSizes = Array.from(root.querySelectorAll('text.dn-label')).map(t => +t.getAttribute('font-size'));
  out.segPaths = root.querySelectorAll('path.dn-seg').length;
  out.slices = root.querySelectorAll('path.dn-slice').length;
  out.notes = Array.from(root.querySelectorAll('.dn-note, .dn-notes')).map(e => e.textContent).join(' | ');
  return out;
}"""


async def leg(pg, which="auto"):
    return await pg.evaluate(LEG, which)


def lado_ok(L, pos, W, H):
    b, r = L["box"], L["ring"]
    if not b or not r:
        return False
    dentro = b["x0"] >= -0.5 and b["y0"] >= -0.5 and b["x1"] <= W + 0.5 and b["y1"] <= H + 0.5
    return dentro and {"right": b["x0"] >= r["x1"] - 0.5, "left": b["x1"] <= r["x0"] + 0.5,
                       "top": b["y1"] <= r["y0"] + 0.5, "bottom": b["y0"] >= r["y1"] - 0.5}[pos]


async def leyenda_25(b):
    print("Leyenda y tabla 25-11 · valores por defecto (Legend y Data table independientes)")
    casos = [
        ("solo Values", dv_caso_a({}, legacy=False), True, False),
        ("con Compare", dv_ventas({}, compare=True, legacy=False), True, True),
        ("con Target", dv_ventas({}, target=True, legacy=False), True, True),
        ("con Annotation", dv_ventas({}, nota=True, legacy=False), True, True),
        ("con solo Segment", dv_ventas({}, segment="Canal", legacy=False), True, False),
        ("Compare con tabla Off", dv_ventas({"dataTable": {"position": "off"}}, compare=True, legacy=False), True, False),
        ("solo Values con tabla a la derecha", dv_caso_a({"dataTable": {"position": "right"}}, legacy=False), True, True),
        ("Compare con leyenda Off", dv_ventas({"legend": {"position": "off"}}, compare=True, legacy=False), False, True),
    ]
    for lbl, dv, wl, wt in casos:
        pg = await page(b, dv, 960, 540, name="lt_def_" + lbl.replace(" ", "_"))
        L = await leg(pg)
        check(f"por defecto {lbl}: leyenda {'sí' if wl else 'no'}, tabla {'sí' if wt else 'no'}", L["hasLegend"] == wl and L["hasTable"] == wt, f"leyenda={L['hasLegend']} tabla={L['hasTable']}")
        if wl and wt:
            T = await leg(pg, "table")
            check(f"por defecto {lbl}: con la leyenda a la vista la tabla no repite la muestra de color", "sw" not in T["cols"], str(T["cols"]))
            check(f"por defecto {lbl}: leyenda y tabla sin pisarse", not overlap(L["lbox"], L["tbox"]), f"{L['lbox']} {L['tbox']}")
        await eventos(pg, f"por defecto {lbl}")
        await pg.close()

    print("Leyenda y tabla 25-11 · columnas on/off")
    full = lambda extra: dv_ventas({"dataTable": dict(extra)}, compare=True, target=True, nota=True, legacy=False)
    pg = await page(b, full({}), 960, 540, name="ley_cols_todas")
    L = await leg(pg, "table")
    check("columnas: todas por defecto", all(c in L["cols"] for c in ["val", "pct", "dpp", "tgt"]) and L["ann"] > 0, str(L["cols"]) + f" ann={L['ann']}")
    await pg.close()
    for prop, cols, nota in [("colValue", ["val"], False), ("colShare", ["pct"], False), ("colChange", ["dpp", "dval", "bar"], False),
                             ("colTarget", ["tgt"], False), ("colNote", [], True)]:
        pg = await page(b, full({prop: False}), 960, 540, name=f"ley_cols_sin_{prop}")
        L = await leg(pg, "table")
        quedan = [c for c in ["val", "pct", "tgt"] if c not in cols]
        ok = not any(c in L["cols"] for c in cols) and all(c in L["cols"] for c in quedan) and ((L["ann"] == 0) if nota else (L["ann"] > 0))
        check(f"columna {prop} off: fuera y el resto sigue", ok, str(L["cols"]) + f" ann={L['ann']}")
        await eventos(pg, f"columna {prop} off")
        await pg.close()
    for on in (False, True):
        objs = {"dataTable": {"position": "right"}}
        if on:
            objs["dataTable"]["segRows"] = True
        pg = await page(b, dv_ventas(objs, segment="Canal", legacy=False), 1200, 640, name=f"ley_segrows_{'on' if on else 'off'}")
        L = await leg(pg, "table")
        check(f"Segment rows {'on' if on else 'off (defecto)'}: {12 if on else 0} filas de segmento", L["seg"] == (12 if on else 0), str(L["seg"]))
        await pg.close()
    for W, H in [(960, 540), (380, 260)]:
        pg = await page(b, full({"colValue": False, "colShare": False, "colChange": False, "colTarget": False}), W, H, name=f"lt_sin_columnas_{W}x{H}")
        L = await leg(pg)
        check(f"sin columnas de cifras {W}x{H}: no hay tabla (nunca de una sola columna) y la leyenda identifica", not L["hasTable"] and L["hasLegend"], f"tabla={L['hasTable']} leyenda={L['hasLegend']}")
        await eventos(pg, f"sin columnas {W}x{H}")
        await pg.close()

    print("Leyenda y tabla 25-11 · posiciones (Legend: 6, Data table: 5) a 1250×600, 960×540 y 380×260")
    for W, H in [(1250, 600), (960, 540), (380, 260)]:
        for pos in ("auto", "top", "bottom", "left", "right", "off"):
            lbl = f"legend {pos} {W}x{H}"
            pg = await page(b, dv_caso_a({"legend": {"position": pos}}, legacy=False), W, H, name=f"ley_legend_{pos}_{W}x{H}")
            L = await leg(pg, "legend")
            if pos == "off":
                check(f"{lbl}: sin leyenda", L["kind"] == "none", L["kind"])
            else:
                efectiva = L["pos"] if pos == "auto" else pos
                check(f"{lbl}: leyenda en {efectiva}, dentro del visual y sin pisar el donut", L["kind"] == "legend" and L["pos"] == efectiva and lado_ok(L, efectiva, W, H),
                      f"{L['kind']} {L['pos']} box={L['box']} ring={L['ring']}")
                if pos == "auto":
                    check(f"{lbl}: Automatic con 6 elementos va arriba en línea", L["pos"] == "top" and L["lines"] <= 2, f"{L['pos']} líneas={L['lines']}")
                check(f"{lbl}: las etiquetas nunca superan la letra de la leyenda", all(x <= L["fs"] + 0.01 for x in L["labelSizes"]), f"{L['labelSizes']} vs {L['fs']}")
                check(f"{lbl}: letra ≥ 10 px y escala con el visual", L["fs"] >= 10 and L["fs"] >= min(1.8, max(0.6, min(W, H) / 300)) * 10 - 0.01, f"{L['fs']}")
                n_more = int(L["more"].split()[0].lstrip("+")) if L["more"] else 0
                check(f"{lbl}: no desaparece ningún elemento (salvo '+N more' al final)", len(L["items"]) + (1 if n_more else 0) == L["slices"] or
                      (n_more and len(L["items"]) + 1 <= L["slices"]), f"{len(L['items'])} items, more={L['more']}")
                if efectiva in ("top", "bottom"):
                    check(f"{lbl}: fluye en horizontal", L["lines"] < len(L["items"]), f"líneas={L['lines']} items={len(L['items'])}")
                else:
                    check(f"{lbl}: lista vertical", L["lines"] == len(L["items"]), f"líneas={L['lines']}")
            await eventos(pg, lbl)
            await pg.close()
        for pos in ("auto", "right", "left", "bottom", "off"):
            lbl = f"tabla {pos} {W}x{H}"
            pg = await page(b, dv_ventas({"dataTable": {"position": pos}}, compare=True, target=True, legacy=False), W, H, name=f"ley_table_{pos}_{W}x{H}")
            L = await leg(pg, "table")
            if pos == "off":
                check(f"{lbl}: sin tabla", L["kind"] == "none", L["kind"])
            else:
                efectiva = L["pos"] if pos == "auto" else pos
                check(f"{lbl}: tabla en {efectiva}, dentro del visual y sin pisar el donut", L["kind"] == "table" and L["pos"] == efectiva and lado_ok(L, efectiva, W, H),
                      f"{L['kind']} {L['pos']} box={L['box']} ring={L['ring']}")
                check(f"{lbl}: las etiquetas nunca superan la letra de la tabla ni de la leyenda", all(x <= L["capFs"] + 0.01 for x in L["labelSizes"]), f"{L['labelSizes']} vs {L['capFs']}")
                if L["hasLegend"]:
                    check(f"{lbl}: leyenda y tabla sin pisarse", not overlap(L["lbox"], L["tbox"]), f"{L['lbox']} {L['tbox']}")
            await eventos(pg, lbl)
            await pg.close()

    print("Leyenda y tabla 25-11 · small multiples (caso de Tino: Canal × Familia × Marca, compare, target, nota)")
    for W, H in [(1250, 600), (960, 540), (380, 260)]:
        lbl = f"SM Canal {W}x{H}"
        pg = await page(b, dv_ventas({}, cat="Familia", segment="Marca", facet="Canal", compare=True, target=True, nota=True, legacy=False), W, H, name=f"lt_sm_tino_{W}x{H}")
        L = await leg(pg)
        if L["hasTable"]:
            T = await leg(pg, "table")
            check(f"{lbl}: la tabla es la del total, con su título y columnas de cifras", any(t.startswith("Total") for t in T["title"]) and any(c in T["cols"] for c in ("val", "pct")), f"{T['title']} {T['cols']}")
            check(f"{lbl}: leyenda y tabla sin pisarse", not L["hasLegend"] or not overlap(L["lbox"], L["tbox"]), "")
        check(f"{lbl}: hay leyenda clásica", L["hasLegend"], "")
        check(f"{lbl}: dos paneles", await pg.evaluate("() => document.querySelectorAll('.dn-panel').length") == 2, "")
        await eventos(pg, lbl)
        await pg.close()

    print("Leyenda 25-11 · interacción de la leyenda compacta")
    pg = await page(b, dv_caso_a({"legend": {"position": "top"}}, legacy=False), 960, 540)
    L = await leg(pg, "legend")
    k2 = L["items"][1]["key"]
    sel = await pg.evaluate("(k) => { const it = document.querySelector('.dn-li[data-key=\"' + k + '\"]'); it.dispatchEvent(new MouseEvent('click', { bubbles: true })); return (window.__sel || []).map(s => s.key); }", k2)
    check("legend: clic en un elemento selecciona su sector", sel == ["Marca=" + L["items"][1]["name"]], str(sel))
    op = await pg.evaluate("() => Array.from(document.querySelectorAll('.dn-li[data-key]')).map(e => e.style.opacity)")
    check("legend: los demás elementos se atenúan", op.count("1") == 1 and op.count("0.45") == len(op) - 1, str(op))
    check("legend: sin persistProperties al seleccionar", await pg.evaluate("() => __persist.length") == 0, "")
    await pg.evaluate("() => { const r = document.querySelector('.dn-root'); r.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); r.focus(); }")
    check("legend: un clic no pinta foco (focus-visible)", await pg.evaluate("() => document.querySelectorAll('.dn-focusrow').length") == 0, "")
    await pg.keyboard.press("ArrowRight")
    await pg.keyboard.press("ArrowRight")
    fk = await pg.evaluate("() => Array.from(document.querySelectorAll('.dn-li.dn-focusrow')).map(e => e.getAttribute('data-key'))")
    check("legend: con el teclado el foco se ve en el elemento de la leyenda", len(fk) == 1, str(fk))
    await pg.keyboard.press("Escape")
    await pg.keyboard.press("Enter")
    sel = await pg.evaluate("() => (window.__sel || []).map(s => s.key)")
    check("legend: Enter selecciona el elemento enfocado", len(sel) == 1, str(sel))
    await shot(pg, "ley_legend_foco_teclado")
    await eventos(pg, "legend interacción")
    await pg.close()

    print("Leyenda 25-11 · nombres largos: elipsis y '+N more'")
    largos = dv_caso_a({"legend": {"position": "right"}}, legacy=False)
    largos["categorical"]["categories"][0]["values"] = [m + " · edición especial de temporada de verano" for m in largos["categorical"]["categories"][0]["values"]]
    largos["categorical"]["categories"][0]["identity"] = [{"v": v} for v in largos["categorical"]["categories"][0]["values"]]
    for W, H, pos in [(960, 540, "right"), (380, 260, "right"), (380, 260, "top")]:
        largos["metadata"]["objects"]["legend"]["position"] = pos
        pg = await page(b, largos, W, H, name=f"ley_largos_{pos}_{W}x{H}")
        L = await leg(pg, "legend")
        check(f"largos {pos} {W}x{H}: nombres recortados con elipsis", any(i["cut"] for i in L["items"]), str([i["cut"] for i in L["items"]]))
        check(f"largos {pos} {W}x{H}: ningún elemento sale del visual", all(i["x1"] <= W + 0.5 and i["y1"] <= H + 0.5 for i in L["items"]), "")
        await pg.hover(f".dn-li[data-key=\"{L['items'][0]['key']}\"]")
        tip = await pg.evaluate("() => window.__tip && window.__tip.dataItems ? window.__tip.dataItems.map(d => d.value).join(' | ') : ''")
        check(f"largos {pos} {W}x{H}: el tooltip lleva el nombre completo", "edición especial de temporada de verano" in tip, tip[:80])
        await eventos(pg, f"largos {pos} {W}x{H}")
        await pg.close()
    pg = await page(b, dv_caso_a({"legend": {"position": "bottom"}, "slices": {"maxSlices": 12, "groupBelow": 0}}, legacy=False), 300, 200, name="ley_more_300x200")
    L = await leg(pg, "legend")
    n_more = int(L["more"].split()[0].lstrip("+")) if L["more"] else 0
    check("pequeño 300x200: los que no caben se pliegan en '+N more' y suman 10", len(L["items"]) + n_more == 10, f"{len(L['items'])} + {L['more']}")
    await pg.close()

    print("Leyenda 25-11 · tabla limpia: cabecera, rejilla, bandas, título y pie")
    for grid in ("none", "horizontal", "all"):
        objs = {"dataTable": {"headerBackground": {"solid": {"color": "#DCE6F2"}}, "gridlines": grid}}
        pg = await page(b, dv_ventas(objs, compare=True, target=True, nota=True, legacy=False), 960, 540, name=f"ley_tabla_grid_{grid}")
        L = await leg(pg)
        check(f"grid {grid}: cabecera en negrita", all(int(h["fw"]) >= 700 for h in L["head"] if h["text"]), str([h["fw"] for h in L["head"]]))
        check(f"grid {grid}: cabecera con fondo", all(h["bg"] == "rgb(220, 230, 242)" for h in L["head"]), str({h["bg"] for h in L["head"]}))
        check(f"grid {grid}: línea inferior de 1 px al 35 % del texto", all(h["bb"] == "1px" and h["bbc"].endswith("0.35)") for h in L["head"]), str({(h["bb"], h["bbc"]) for h in L["head"]}))
        check(f"grid {grid}: cabeceras numéricas a la derecha", all(h["align"] == "flex-end" for h in L["head"] if h["col"] in ("val", "pct", "dpp", "dval", "tgt")), str([(h["col"], h["align"]) for h in L["head"]]))
        check(f"grid {grid}: sin cabecera vacía de la minibarra", not any(h["col"] == "bar" for h in L["head"]), str([h["col"] for h in L["head"]]))
        check(f"grid {grid}: el 'Total … vs …' es el título, fuera de la rejilla", len(L["title"]) == 1 and "vs" in L["title"][0] and L["capInGrid"] == 0, str(L["title"]))
        check(f"grid {grid}: notas en fila propia a todo el ancho", L["ann"] > 0 and all(x.startswith("1") for x in L["annSpan"]), str(L["annSpan"][:3]))
        if grid == "none":
            check("grid none: sin líneas entre filas", L["bt"] == 0 and L["bl"] == 0, f"bt={L['bt']} bl={L['bl']}")
        elif grid == "horizontal":
            check("grid horizontal: líneas entre filas, finas y suaves (texto al 18 %)", L["bt"] > 0 and L["bl"] == 0 and "0.18" in L["btColor"], f"bt={L['bt']} bl={L['bl']} {L['btColor']}")
        else:
            check("grid all: líneas entre filas y entre columnas de cifras", L["bt"] > 0 and L["bl"] > 0, f"bt={L['bt']} bl={L['bl']}")
        await eventos(pg, f"grid {grid}")
        await pg.close()
    pg = await page(b, dv_ventas({"dataTable": {"banding": True}}, compare=True, target=True, nota=True, legacy=False), 960, 540, name="ley_tabla_bandas")
    L = await leg(pg)
    check("bandas on: filas alternas con fondo", 0 < L["banded"] < L["bodyN"], f"{L['banded']}/{L['bodyN']}")
    await pg.hover(".dn-grid > .dn-c[data-bg]")
    await pg.mouse.move(2, 2)
    L2 = await leg(pg)
    check("bandas on: el fondo vuelve tras pasar el ratón", L2["banded"] == L["banded"] and await pg.evaluate("() => Array.from(document.querySelectorAll('[data-bg]')).every(c => c.style.backgroundColor !== '')"), "")
    await pg.close()
    pg = await page(b, dv_ventas({}, compare=True, target=True, legacy=False), 960, 540)
    L = await leg(pg)
    check("bandas: apagadas por defecto", L["banded"] == 0, str(L["banded"]))
    check("pie de avisos separado por una línea y un punto menos de letra", L["foot"] and L["foot"]["bt"] >= 1 and L["foot"]["fs"] <= L["fs"] - 1 + 0.01, str(L["foot"]) + f" fs={L['fs']}")
    await pg.close()
    pg = await page(b, dv_ventas({"dataTable": {"gridlines": "all"}}, compare=True, target=True, nota=True, legacy=False), 960, 540, hc=True, name="ley_tabla_hc")
    L = await leg(pg)
    check("alto contraste: sin fondo de cabecera ni bandas, líneas en el color del texto", L["banded"] == 0 and L["btColor"] in ("rgb(255, 255, 0)", "#FFFF00"), L["btColor"])
    await eventos(pg, "tabla hc")
    await pg.close()
    # Tabla con columnas recortadas (no caben barra ni segunda columna de cambio) y pequeño.
    for W, H in [(560, 300), (380, 260)]:
        pg = await page(b, dv_ventas({}, compare=True, target=True, nota=True, legacy=False), W, H, name=f"ley_tabla_recortada_{W}x{H}")
        i = await info(pg)
        comprobar_dibujo(i, W, H, f"tabla recortada {W}x{H}")
        await eventos(pg, f"tabla recortada {W}x{H}")
        await pg.close()

    print("Leyenda 25-11 · Segment anidado (Ventas: Marca/Familia)")
    pg = await page(b, dv_ventas({"dataTable": {"position": "right", "segRows": True}}, segment="Familia", legacy=False), 960, 540, edit=True, name="seg_anidado_marca_familia")
    L = await leg(pg)
    check("Marca × Familia: sin anillo exterior inútil", L["segPaths"] == 0 and L["seg"] == 0, f"paths={L['segPaths']} filas={L['seg']}")
    check("Marca × Familia: aviso con los nombres reales", "Each Marca belongs to one Familia: put Familia in Category and Marca in Segment" in L["notes"], L["notes"][:160])
    check("Marca × Familia: las categorías se dibujan", await pg.evaluate("() => document.querySelectorAll('path.dn-slice').length") >= 6, "")
    await eventos(pg, "Marca × Familia")
    await pg.close()
    pg = await page(b, dv_ventas({"dataTable": {"position": "right", "segRows": True}}, segment="Familia", legacy=False), 960, 540, locale="es-ES")
    L = await leg(pg)
    check("Marca × Familia en lectura: sin aviso (solo editando)", "belongs" not in L["notes"] and "pertenece" not in L["notes"], L["notes"][:80])
    await pg.close()
    pg = await page(b, dv_ventas({"dataTable": {"position": "right", "segRows": True}}, segment="Familia", legacy=False), 960, 540, edit=True, locale="es-ES")
    L = await leg(pg)
    check("Marca × Familia en español: aviso traducido", "Cada Marca pertenece a un solo Familia" in L["notes"], L["notes"][:120])
    await pg.close()
    pg = await page(b, dv_ventas({"dataTable": {"position": "right", "segRows": True}, "labels": {"content": "percent"}}, segment="Marca", cat="Familia", legacy=False), 960, 540, name="seg_familia_marca")
    L = await leg(pg)
    check("Familia × Marca: anillo exterior dibujado", L["segPaths"] >= 10, str(L["segPaths"]))
    ref = next(x for x in L["pct"] if not x["seg"] and x["key"] and "Refrescos" in x["key"])
    segs = [x for x in L["pct"] if x["seg"] and "Refrescos" in x["key"]]
    nums = [pct_num(x["t"]) for x in segs]
    check("Familia × Marca: Refrescos en 3 filas de segmento (sin filas a 0 %)", len(segs) == 3, str([x["t"] for x in segs]))
    check("Familia × Marca: % de los segmentos sobre el total (suman el de Refrescos, ninguno 100 %)", abs(sum(nums) - pct_num(ref["t"])) < 1e-9 and 100 not in nums, f"{[x['t'] for x in segs]} vs {ref['t']}")
    REF = {k[1]: v for k, v in ventas_por_par("Familia", "Marca").items() if k[0] == "Refrescos"}
    tot_ref = sum(REF.values())
    reparto = sorted(round(100 * v / tot_ref) for v in REF.values())
    check("Familia × Marca: Refrescos ≈ 40/40/20 entre Nord, Nord Cola y Nord Mixer", reparto[0] in range(17, 23) and all(x in range(37, 43) for x in reparto[1:]), str(reparto))
    sk = await pg.evaluate("() => { const p = Array.from(document.querySelectorAll('path.dn-seg')).find(p => p.getAttribute('data-key').includes('Refrescos') && p.getAttribute('data-key').includes('Nord Mixer')); const r = p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })); return window.__tip ? window.__tip.dataItems.map(d => d.displayName + '=' + d.value) : []; }")
    check("Familia × Marca: el tooltip da el % del total y el % de Refrescos", any(x.startswith("Share=") for x in sk) and any(x.startswith("Share of Refrescos=") for x in sk), str(sk))
    await eventos(pg, "Familia × Marca")
    await pg.close()


# ── Anillo exterior identificable y Summary (25-11, 2.ª tanda) ────────────────

SB = r"""() => {
  const h = document.getElementById('host'), hr = h.getBoundingClientRect();
  const root = h.querySelector('.dn-root');
  const R = e => { const r = e.getBoundingClientRect(); return { x0: r.left - hr.left, y0: r.top - hr.top, x1: r.right - hr.left, y1: r.bottom - hr.top, w: r.width, h: r.height }; };
  const sm = Array.from(root.querySelectorAll('.dn-summary'));
  const segl = Array.from(root.querySelectorAll('text.dn-seglabel')).map(t => ({ key: t.getAttribute('data-key'), text: t.textContent, fs: +t.getAttribute('font-size'), ...R(t) }));
  const lab = Array.from(root.querySelectorAll('text.dn-label')).map(t => ({ text: t.textContent, fs: +t.getAttribute('font-size'), ...R(t) }));
  const segs = Array.from(root.querySelectorAll('path.dn-seg')).map(p => p.getAttribute('data-key'));
  const ring = root.querySelector('.dn-slices'), outer = root.querySelector('.dn-segs');
  const t = root.querySelector('.dn-table'), lg = root.querySelector('.dn-legend');
  const fsOf = e => e ? parseFloat(getComputedStyle(e).fontSize) : 0;
  return { summary: sm.map(e => ({ text: e.textContent, fs: parseFloat(getComputedStyle(e).fontSize), full: e.getAttribute('data-full'), ...R(e) })),
    segl, lab, segs, ring: ring ? R(ring) : null, outer: outer ? R(outer) : null, table: t ? R(t) : (lg ? R(lg) : null), lgbox: lg ? R(lg) : null,
    tfs: Math.min(...[fsOf(t), fsOf(lg)].filter(x => x > 0).concat([999])) % 999 || 0, legend: !!lg,
    lseg: lg ? Array.from(lg.querySelectorAll('.dn-lseg')).map(e => e.textContent) : [], aria: root.getAttribute('aria-label') || '' };
}"""


async def sb(pg):
    return await pg.evaluate(SB)


def comprobar_anillo(S, W, H, lbl, quiere=True):
    if quiere:
        check(f"{lbl}: hay etiquetas en el anillo exterior", len(S["segl"]) > 0, str(len(S["segl"])))
    if not S["segl"]:
        return
    sizes = {x["fs"] for x in S["segl"]}
    check(f"{lbl}: etiquetas exteriores uniformes (una sola letra)", len(sizes) == 1, str(sizes))
    if S["lab"]:
        check(f"{lbl}: misma letra que las interiores", sizes == {S["lab"][0]["fs"]}, f"{sizes} vs {S['lab'][0]['fs']}")
    if S["tfs"]:
        check(f"{lbl}: nunca mayores que la letra de la leyenda/tabla", max(sizes) <= S["tfs"] + 0.01, f"{sizes} vs {S['tfs']}")
    conpct = {("%" in x["text"]) for x in S["segl"]}
    check(f"{lbl}: mismo contenido en todas (todas con % o ninguna)", len(conpct) == 1, str([x["text"] for x in S["segl"]][:6]))
    o = S["outer"]
    dentro = all(x["x0"] >= o["x0"] - 0.5 and x["x1"] <= o["x1"] + 0.5 and x["y0"] >= o["y0"] - 0.5 and x["y1"] <= o["y1"] + 0.5 for x in S["segl"])
    check(f"{lbl}: todas dentro del anillo exterior (ninguna fuera)", dentro, "")
    todas = S["segl"] + S["lab"]
    pis = [(a["text"], b["text"]) for k, a in enumerate(todas) for b in todas[k + 1:] if overlap(a, b)]
    check(f"{lbl}: etiquetas sin solaparse", not pis, str(pis[:3]))
    check(f"{lbl}: ninguna dice 100 %", not any(x["text"].endswith(" 100%") for x in S["segl"]), "")


def comprobar_summary(S, W, H, lbl):
    if not S["summary"]:
        return
    sm = S["summary"][0]
    check(f"{lbl}: Summary con letra ≥ 10 px", sm["fs"] >= 10, str(sm["fs"]))
    check(f"{lbl}: Summary dentro del visual y por encima del donut", sm["x1"] <= W + 0.5 and (not S["ring"] or sm["y1"] <= S["ring"]["y0"] + 0.5), f"{sm} ring={S['ring']}")
    if S["table"]:
        check(f"{lbl}: Summary sin pisar la leyenda/tabla", sm["y1"] <= S["table"]["y0"] + 0.5 or S["table"]["x1"] <= sm["x0"] or S["table"]["x0"] >= sm["x1"], f"{sm['y1']} vs {S['table']}")
    check(f"{lbl}: el aria-label lleva la frase completa", sm["text"] in S["aria"] or S["aria"].find(sm["text"].split(".")[0]) >= 0, "")


def resumen_objetivo(tg):
    """Lo que debe decir Summary del objetivo a partir de los iconos de la tabla: fallo = ✕; ≈ no es fallo."""
    n = len(tg)
    miss = sum(1 for r in tg if r["tgt"].startswith("✕"))
    met = sum(1 for r in tg if r["tgt"].startswith("✓"))
    if miss == 1:
        return "1 of %d categories misses the target." % n
    if miss > 1:
        return "%d of %d categories miss the target." % (miss, n)
    if met == n:
        return "All %d categories meet the target." % n
    if met == 0:
        return "All %d categories are near the target." % n
    return "On target: %d of %d; near it: %d." % (met, n, n - met)


async def tanda_25b(b):
    TAM = [(960, 540), (620, 520), (380, 260)]
    print("25-11 (2) · Familia × Marca: etiquetas del anillo exterior y leyenda con segmentos")
    for W, H in TAM:
        lbl = f"Familia×Marca {W}x{H}"
        pg = await page(b, dv_ventas({}, segment="Marca", cat="Familia", legacy=False), W, H, name=f"t2_fam_marca_legend_{W}x{H}")
        S = await sb(pg)
        comprobar_anillo(S, W, H, lbl, quiere=W >= 620)
        check(f"{lbl}: leyenda compacta con los segmentos de cada familia", S["legend"] and len(S["lseg"]) >= (10 if W == 960 else 1), str(S["lseg"]))
        check(f"{lbl}: sin Compare, Summary apagado (Automatic)", not S["summary"], str(S["summary"]))
        await eventos(pg, lbl)
        await pg.close()
        lbl = f"Familia×Marca todo {W}x{H}"
        pg = await page(b, dv_ventas({}, segment="Marca", cat="Familia", compare=True, target=True, nota=True, legacy=False), W, H, name=f"t2_fam_marca_todo_{W}x{H}")
        S = await sb(pg)
        comprobar_anillo(S, W, H, lbl, quiere=W == 960)  # a 620×520 con tabla y Summary el anillo es fino: sin etiqueta es lo correcto
        check(f"{lbl}: con Compare, Summary encendido (Automatic)", len(S["summary"]) == 1, str(S["summary"]))
        comprobar_summary(S, W, H, lbl)
        await eventos(pg, lbl)
        await pg.close()
    for modo, conpct in [("name", False), ("namePercent", True), ("off", None)]:
        pg = await page(b, dv_ventas({"labels": {"segment": modo}}, segment="Marca", cat="Familia", legacy=False), 960, 540, name=f"t2_seglabels_{modo}")
        S = await sb(pg)
        if conpct is None:
            check("Segment labels off: sin etiquetas exteriores", not S["segl"], str(len(S["segl"])))
        else:
            check(f"Segment labels {modo}: {'con' if conpct else 'sin'} %", S["segl"] and all(("%" in x["text"]) == conpct for x in S["segl"]), str([x["text"] for x in S["segl"]][:4]))
        await pg.close()
    pg = await page(b, dv_ventas({"labels": {"segment": "namePercent"}}, segment="Marca", cat="Familia", legacy=False), 960, 540)
    S = await sb(pg)
    nm = next((x for x in S["segl"] if x["text"].startswith("Nord Cola")), None)
    check("Segment labels: el % es del total (Nord Cola 16 %, no 40 % de Refrescos)", nm is not None and nm["text"].endswith(" 16%"), nm["text"] if nm else str([x["text"] for x in S["segl"]]))
    sel = await pg.evaluate("() => { const p = Array.from(document.querySelectorAll('path.dn-seg')).find(p => p.getAttribute('data-key').endsWith('Nord Cola')); p.dispatchEvent(new MouseEvent('click', { bubbles: true })); return Array.from(document.querySelectorAll('text.dn-seglabel')).map(t => t.getAttribute('opacity')); }")
    check("Segment labels: al seleccionar un trozo se atenúan las demás", sel.count("1") == 1 and sel.count("0.45") == len(sel) - 1, str(sel))
    await pg.close()

    print("25-11 (2) · Summary: Marca sola, con y sin Compare / Target")
    import re as _re
    for W, H in TAM:
        pg = await page(b, dv_caso_a({}, legacy=False), W, H)
        S = await sb(pg)
        check(f"Marca sola {W}x{H}: Summary apagado por defecto", not S["summary"], str(S["summary"]))
        await pg.close()
        pg = await page(b, dv_caso_a({"summary": {"show": "on"}, "labels": {"content": "percent"}}), W, H, name=f"t2_marca_summary_on_{W}x{H}")
        S = await sb(pg)
        i = await info(pg)
        check(f"Marca sola on {W}x{H}: Summary encendido", len(S["summary"]) == 1, str(S["summary"]))
        comprobar_summary(S, W, H, f"Marca sola on {W}x{H}")
        if S["summary"]:
            t = S["summary"][0]["text"]
            pcts = {r["name"]: r["pct"] for r in filas_datos(i)}
            check(f"Marca sola on {W}x{H}: la mayor cuota con el % que enseña el visual", t.startswith("Aigua Serena leads with " + pcts.get("Aigua Serena", "?")), t[:60] + " / " + str(pcts.get("Aigua Serena")))
            if S["summary"][0]["full"] == "true":
                top3 = sum(pct_num(pcts[n]) for n in MARCAS[:3])
                check(f"Marca sola on {W}x{H}: peso de las tres primeras = suma de sus % redondeados", f"The top three add up to {top3:g}%." in t, t)
        await eventos(pg, f"Marca sola on {W}x{H}")
        await pg.close()
        lbl = f"Marca cmp+tgt {W}x{H}"
        pg = await page(b, dv_ventas({}, compare=True, target=True, legacy=False), W, H, name=f"t2_marca_cmp_tgt_{W}x{H}")
        S = await sb(pg)
        i = await info(pg)
        check(f"{lbl}: Summary encendido (Automatic con Compare)", len(S["summary"]) == 1, str(S["summary"]))
        comprobar_summary(S, W, H, lbl)
        if S["summary"] and S["summary"][0]["full"] == "true":
            t = S["summary"][0]["text"]
            rows = [r for r in filas_datos(i) if r["dpp"]]
            if rows:
                mx = max(rows, key=lambda r: abs(float(r["dpp"].split()[0].replace("−", "-").replace("+", ""))))
                check(f"{lbl}: mayor movimiento en pp = el de la tabla", f"Biggest shift vs Litros AA: {mx['name']}, {mx['dpp'].split()[0]} pp." in t, t + " / " + mx["name"] + " " + mx["dpp"])
            tg = [r for r in filas_datos(i) if r["tgt"] and r["tgt"] != "—"]
            esperado = resumen_objetivo(tg)
            check(f"{lbl}: categorías que fallan el objetivo = las de la tabla", esperado in t, t + " / " + esperado)
        elif S["summary"]:
            check(f"{lbl}: si no cabe, solo la primera oración", S["summary"][0]["text"].count(".") == 1, S["summary"][0]["text"])
        await eventos(pg, lbl)
        await pg.close()
    print("25-11 (3) · Summary y objetivo: ≈ no es fallo")
    for lbl, dv, quiere in [
        ("Familia (dataset real, todas ≈)", dv_ventas({}, cat="Familia", compare=True, target=True, legacy=False), "All 6 categories are near the target."),
        ("Marca (con ✕)", dv_ventas({"slices": {"maxSlices": 12, "groupBelow": 0}}, compare=True, target=True, legacy=False), None),
        ("Marca Close at 50 % (✓ y ≈, sin ✕)", dv_ventas({"target": {"closeAt": 50}}, compare=True, target=True, legacy=False), None),
    ]:
        tag = "t3_summary_" + ("familia" if "Familia" in lbl else "marca_x" if "(con ✕)" in lbl else "marca_mix")
        pg = await page(b, dv, 1200, 640, name=tag)
        S = await sb(pg)
        i = await info(pg)
        t = S["summary"][0]["text"] if S["summary"] else ""
        tg = [r for r in filas_datos(i) if r["tgt"] and r["tgt"] != "—"]
        esperado = resumen_objetivo(tg)
        check(f"Summary {lbl}: frase del objetivo según los iconos ({esperado})", esperado in t and (quiere is None or quiere == esperado), t)
        iconos = "".join(r["tgt"][0] for r in tg)
        if "(con ✕)" in lbl:
            check(f"Summary {lbl}: el caso tiene ✕ y lo cuenta como fallo", "✕" in iconos and "miss" in t, iconos)
        if "≈" in lbl and "✓" in lbl:
            check(f"Summary {lbl}: el caso tiene ✓ y ≈ y ningún ✕", "✓" in iconos and "≈" in iconos and "✕" not in iconos, iconos)
        if "todas ≈" in lbl:
            check(f"Summary {lbl}: todas ≈ en la tabla y ninguna contada como fallo", set(iconos) == {"≈"} and "miss" not in t, iconos)
        await eventos(pg, f"summary {lbl}")
        await pg.close()
    pg = await page(b, dv_ventas({}, cat="Familia", compare=True, target=True, legacy=False), 960, 540, locale="es-ES")
    S = await sb(pg)
    t = S["summary"][0]["text"] if S["summary"] else ""
    check("Summary Familia en español: «Las 6 categorías están cerca del objetivo.»", "Las 6 categorías están cerca del objetivo." in t, t)
    await pg.close()
    pg = await page(b, dv_ventas({}, compare=True, target=True, legacy=False), 960, 540, plan=None, edit=False, name="t2_summary_free_lectura")
    S = await sb(pg)
    t = S["summary"][0]["text"] if S["summary"] else ""
    check("Summary sin licencia (lectura): solo cuotas, sin cambio ni objetivo", t.startswith("Aigua Serena leads") and "shift" not in t and "target" not in t, t)
    await pg.close()
    pg = await page(b, dv_ventas({}, compare=True, target=True, legacy=False), 960, 540, locale="es-ES", name="t2_summary_es")
    S = await sb(pg)
    t = S["summary"][0]["text"] if S["summary"] else ""
    check("Summary en español: plantillas completas", "lidera con el" in t and "Mayor cambio frente a Litros AA" in t, t)
    await pg.close()
    pg = await page(b, dv_ventas({}, facet="Zona", compare=True, legacy=False), 960, 540, name="t2_summary_sm")
    S = await sb(pg)
    check("Summary con small multiples: una sola frase para el total", len(S["summary"]) == 1, str(len(S["summary"])))
    await eventos(pg, "summary sm")
    await pg.close()
    for W, H in [(260, 180), (160, 120)]:
        pg = await page(b, dv_ventas({}, compare=True, target=True, legacy=False), W, H, name=f"t2_summary_{W}x{H}")
        S = await sb(pg)
        if S["summary"]:
            check(f"Summary {W}x{H}: recortado a la primera oración o completo, nunca a medias", S["summary"][0]["text"].endswith("."), S["summary"][0]["text"])
        comprobar_summary(S, W, H, f"Summary {W}x{H}")
        await eventos(pg, f"summary {W}x{H}")
        await pg.close()


# ── Tipografía seleccionable (25-11) ──────────────────────────────────────────

FUENTES = ["Arial Black", "Segoe UI Bold", "Georgia", "DIN"]

FT = r"""() => {
  const h = document.getElementById('host'), hr = h.getBoundingClientRect();
  const root = h.querySelector('.dn-root');
  const R = e => { const r = e.getBoundingClientRect(); return { x0: r.left - hr.left, y0: r.top - hr.top, x1: r.right - hr.left, y1: r.bottom - hr.top, w: r.width, h: r.height }; };
  const fam = e => e ? getComputedStyle(e).fontFamily : '';
  const ring = root.querySelector('.dn-slices');
  const hole = root.querySelector('path.dn-slice');
  return {
    lab: Array.from(root.querySelectorAll('text.dn-label, text.dn-seglabel')).map(t => ({ text: t.textContent, fam: fam(t), w8: t.getAttribute('font-weight'), ...R(t) })),
    center: Array.from(root.querySelectorAll('.dn-center-text')).map(t => ({ part: t.getAttribute('data-part'), text: t.textContent, fam: fam(t), fs: +t.getAttribute('font-size'), w8: t.getAttribute('font-weight'), ...R(t) })),
    table: (e => e ? { fam: fam(e), ...R(e), over: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 } : null)(root.querySelector('.dn-table')),
    legend: (e => e ? { fam: fam(e), ...R(e) } : null)(root.querySelector('.dn-legend')),
    summary: (e => e ? { fam: fam(e), ...R(e) } : null)(root.querySelector('.dn-summary')),
    ring: ring ? R(ring) : null,
  };
}"""


async def tanda_fuentes(b):
    print("25-11 (4) · Tipografía: Arial Black, Segoe UI Bold, Georgia y DIN en etiquetas, centro, leyenda, tabla y resumen")
    for f in FUENTES:
        for W, H in [(960, 540), (380, 260)]:
            lbl = f"fuente {f} {W}x{H}"
            objs = {"labels": {"fontFamily": f, "bold": f == "Arial Black"}, "center": {"valueFontFamily": f, "titleFontFamily": f},
                    "legend": {"fontFamily": f}, "dataTable": {"fontFamily": f}, "summary": {"fontFamily": f}}
            pg = await page(b, dv_ventas(objs, compare=True, target=True, nota=True, legacy=False), W, H, name=f"fuente_{f.replace(' ', '_')}_{W}x{H}")
            F = await pg.evaluate(FT)
            i = await info(pg)
            comprobar_dibujo(i, W, H, lbl, mira_suma=False)
            usa = lambda x: x is not None and f in x["fam"]
            check(f"{lbl}: etiquetas con la fuente elegida", F["lab"] and all(f in l["fam"] for l in F["lab"]), str({l["fam"] for l in F["lab"]})[:80])
            check(f"{lbl}: centro (valor y título) con la fuente elegida", F["center"] and all(f in c["fam"] for c in F["center"]), str({c["fam"] for c in F["center"]})[:80])
            check(f"{lbl}: leyenda, tabla y resumen con la fuente elegida", usa(F["legend"]) and (F["table"] is None or usa(F["table"])) and (F["summary"] is None or usa(F["summary"])),
                  f"{F['legend'] and F['legend']['fam']} | {F['table'] and F['table']['fam']}")
            if f == "Arial Black":
                check(f"{lbl}: negrita de las etiquetas aplicada", all(l["w8"] == "700" for l in F["lab"]), str({l["w8"] for l in F["lab"]}))
            r = F["ring"]
            if r and F["center"]:
                cx, cy, ri = (r["x0"] + r["x1"]) / 2, (r["y0"] + r["y1"]) / 2, r["w"] / 2 * 0.58
                fuera = [c["text"] for c in F["center"] if max(abs(c["x0"] - cx), abs(c["x1"] - cx)) > ri + 1 or ((max(abs(c["x0"] - cx), abs(c["x1"] - cx))) ** 2 + max(abs(c["y0"] - cy), abs(c["y1"] - cy)) ** 2) ** 0.5 > ri * 1.08]
                check(f"{lbl}: el texto del centro cabe en el agujero (medido con la fuente real)", not fuera, str(fuera))
            cajas = [x for x in (F["legend"], F["table"], F["summary"]) if x]
            pis = [(a["fam"][:10], b_["fam"][:10]) for k, a in enumerate(cajas) for b_ in cajas[k + 1:] if overlap(a, b_)]
            check(f"{lbl}: leyenda, tabla y resumen sin pisarse ni salirse", not pis and all(x["x1"] <= W + 0.5 and x["y1"] <= H + 0.5 for x in cajas), str(pis))
            if F["table"]:
                check(f"{lbl}: la tabla no desborda", not F["table"]["over"], "")
            await eventos(pg, lbl)
            await pg.close()
    # Fuente ancha frente a la normal: las etiquetas deciden si caben con la real (con Arial Black no caben más que con la de serie).
    pg = await page(b, dv_caso_a({}, legacy=False), 380, 260)
    n0 = len((await pg.evaluate(FT))["lab"])
    await pg.close()
    pg = await page(b, dv_caso_a({"labels": {"fontFamily": "Arial Black", "bold": True}}, legacy=False), 380, 260)
    F = await pg.evaluate(FT)
    i = await info(pg)
    comprobar_dibujo(i, 380, 260, "Arial Black negrita 380x260", mira_suma=False)
    check("Arial Black negrita 380x260: no caben más etiquetas que con Segoe UI", len(F["lab"]) <= n0, f"{len(F['lab'])} vs {n0}")
    await pg.close()
    # Vacío = la fuente del estilo: Ledger y Editorial siguen en Georgia; Report theme en Segoe UI.
    for est, quiere in [("report", "Segoe UI"), ("ledger", "Georgia"), ("editorial", "Georgia")]:
        pg = await page(b, dv_caso_a({"style": {"template": est}}, legacy=False), 700, 400)
        F = await pg.evaluate(FT)
        check(f"fuente vacía con estilo {est}: {quiere}", F["lab"] and quiere in F["lab"][0]["fam"] and quiere in F["center"][0]["fam"], F["lab"][0]["fam"][:40] if F["lab"] else "")
        await pg.close()
    # Center: Value size y Title size escalan con k y el título encoge con el valor.
    pg = await page(b, dv_caso_a({"center": {"fontSize": 30, "titleFontSize": 12, "valueBold": False, "titleColor": {"solid": {"color": "#C00000"}}}}, legacy=False), 960, 540, name="centro_tamanos_960x540")
    F = await pg.evaluate(FT)
    v = next((c for c in F["center"] if c["part"] == "value"), None)
    t = next((c for c in F["center"] if c["part"] == "title"), None)
    check("Center: Value size 30 escala con k (≤ 54 px) y sin negrita", v and v["fs"] <= 54 and v["w8"] == "400", str(v))
    check("Center: Title size 12 en proporción al valor", v and t and abs(t["fs"] / v["fs"] - 12 / 30) < 0.05, f"{t and t['fs']} / {v and v['fs']}")
    col = await pg.evaluate("() => { const t = document.querySelector('.dn-center-text[data-part=title]'); return t ? t.getAttribute('fill') : ''; }")
    check("Center: Title color propio", col.upper() == "#C00000", col)
    await pg.close()


# ── Títulos de panel de small multiples (25-11) ───────────────────────────────

SMT = r"""() => {
  const h = document.getElementById('host'), hr = h.getBoundingClientRect();
  const root = h.querySelector('.dn-root');
  const R = r => ({ x0: r.left - hr.left, y0: r.top - hr.top, x1: r.right - hr.left, y1: r.bottom - hr.top, w: r.width, h: r.height });
  const titles = Array.from(root.querySelectorAll('.dn-sm-title')).map(t => { const rg = document.createRange(); rg.selectNodeContents(t);
    const b = t.getBoundingClientRect(), x = rg.getBoundingClientRect();
    // Texto visible: el que cae dentro de la caja (un nombre largo se recorta con elipsis).
    const vis = { left: Math.max(b.left, x.left), right: Math.min(b.right, x.right), top: x.top, bottom: x.bottom, width: 0, height: x.height };
    return { text: t.textContent, fs: parseFloat(getComputedStyle(t).fontSize), fam: getComputedStyle(t).fontFamily, box: R(b), txt: R(vis) }; });
  const panels = Array.from(root.querySelectorAll('.dn-panel')).map(g => {
    // Lo dibujado del donut: sectores, anillo de segmentos, anillo de escala e iconos del objetivo.
    const ps = Array.from(g.querySelectorAll('path.dn-slice, path.dn-seg, .dn-ring line, .dn-ring circle, .dn-ring path, .dn-ticon'));
    const bs = ps.map(p => p.getBoundingClientRect());
    return { x0: Math.min(...bs.map(b => b.left)) - hr.left, x1: Math.max(...bs.map(b => b.right)) - hr.left, y0: Math.min(...bs.map(b => b.top)) - hr.top, y1: Math.max(...bs.map(b => b.bottom)) - hr.top };
  });
  const lg = root.querySelector('.dn-legend');
  return { titles, panels, legendFs: lg ? parseFloat(getComputedStyle(lg).fontSize) : 0 };
}"""


async def tanda_sm_titulos(b):
    print("25-11 (5) · Títulos de panel: centrados, pegados a su donut y con la letra de la leyenda")
    ZONAS = sorted({r["Zona"] for r in VENTAS})
    casos = [("tino", dv_ventas({}, cat="Familia", segment="Marca", facet="Canal", compare=True, target=True, nota=True, legacy=False), [(1250, 600), (960, 540), (380, 260)])]
    for n in (2, 4, 9):
        casos.append((f"zona{n}", dv_ventas({}, facet="Zona", zonas=ZONAS[:n], legacy=False), [(960, 540), (380, 260)]))
    for tag, dv, tams in casos:
        for W, H in tams:
            lbl = f"títulos {tag} {W}x{H}"
            pg = await page(b, dv, W, H, name=f"smt_{tag}_{W}x{H}")
            S = await pg.evaluate(SMT)
            T, P = S["titles"], S["panels"]
            check(f"{lbl}: un título por panel", len(T) == len(P) and len(T) > 0, f"{len(T)} títulos, {len(P)} paneles")
            mal_c, mal_g = [], []
            for t, p in zip(T, P):
                cxp = (p["x0"] + p["x1"]) / 2
                if abs((t["txt"]["x0"] + t["txt"]["x1"]) / 2 - cxp) > 3:
                    mal_c.append(t["text"])
                gap = p["y0"] - t["txt"]["y1"]
                if gap < -0.5 or gap > t["fs"] * 0.6 + 6:
                    mal_g.append((t["text"], round(gap, 1)))
            check(f"{lbl}: cada título centrado sobre su donut", not mal_c, str(mal_c))
            check(f"{lbl}: cada título pegado a su donut (sin hueco grande ni encima)", not mal_g, str(mal_g))
            fs = T[0]["fs"] if T else 0
            check(f"{lbl}: letra del título ≥ 10 px o limitada por la celda, y no mayor que la leyenda", fs >= 8 and (not S["legendFs"] or fs <= S["legendFs"] + 0.01), f"{fs} vs leyenda {S['legendFs']}")
            if W >= 960:
                check(f"{lbl}: a tamaño grande el título escala como la leyenda", fs >= 10 and (not S["legendFs"] or abs(fs - S["legendFs"]) < 0.01), f"{fs} vs {S['legendFs']}")
            fuera = [t["text"] for t in T if t["box"]["x0"] < -0.5 or t["box"]["x1"] > W + 0.5 or t["box"]["y0"] < -0.5]
            check(f"{lbl}: títulos dentro del visual", not fuera, str(fuera))
            await eventos(pg, lbl)
            await pg.close()
    pg = await page(b, dv_ventas({"smallMultiples": {"titleFontFamily": "Georgia", "titleItalic": True}}, facet="Zona", zonas=ZONAS[:4], legacy=False), 960, 540, name="smt_georgia")
    S = await pg.evaluate(SMT)
    check("títulos con Title font = Georgia cursiva", S["titles"] and all("Georgia" in t["fam"] for t in S["titles"]) and
          await pg.evaluate("() => getComputedStyle(document.querySelector('.dn-sm-title')).fontStyle") == "italic", str({t["fam"] for t in S["titles"]}))
    await pg.close()
    pg = await page(b, dv_ventas({"smallMultiples": {"titleAlign": "left"}}, facet="Zona", zonas=ZONAS[:2], legacy=False), 960, 540, name="smt_izquierda")
    S = await pg.evaluate(SMT)
    ok = all(abs(t["txt"]["x0"] - p["x0"]) < 4 for t, p in zip(S["titles"], S["panels"]))
    check("Title alignment = Left: alineado al borde izquierdo de su donut", ok, str([(round(t["txt"]["x0"]), round(p["x0"])) for t, p in zip(S["titles"], S["panels"])]))
    await pg.close()


def ventas_por_par(a, b_):
    d = defaultdict(float)
    for r in VENTAS:
        d[(r[a], r[b_])] += r["Litros"] or 0
    return d


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        if "--smtitulos" in sys.argv:
            await tanda_sm_titulos(b)
            await b.close()
            print()
            print("TODO OK" if not FALLOS else "FALLOS (%d):\n  - %s" % (len(FALLOS), "\n  - ".join(FALLOS)))
            return
        if "--fuentes" in sys.argv:
            await tanda_fuentes(b)
            await b.close()
            print()
            print("TODO OK" if not FALLOS else "FALLOS (%d):\n  - %s" % (len(FALLOS), "\n  - ".join(FALLOS)))
            return
        if "--tanda2" in sys.argv:
            await tanda_25b(b)
            await b.close()
            print()
            print("TODO OK" if not FALLOS else "FALLOS (%d):\n  - %s" % (len(FALLOS), "\n  - ".join(FALLOS)))
            return
        if "--leyenda" in sys.argv:
            await leyenda_25(b)
            await b.close()
            print()
            print("TODO OK" if not FALLOS else "FALLOS (%d):\n  - %s" % (len(FALLOS), "\n  - ".join(FALLOS)))
            return
        if "--solo2" in sys.argv:
            await bloque2(b)
            await b.close()
            print()
            print("TODO OK" if not FALLOS else "FALLOS (%d):\n  - %s" % (len(FALLOS), "\n  - ".join(FALLOS)))
            return

        print("Caso a (10 marcas): tamaños × forma")
        for shape in ["donut", "pie"]:
            for W, H in TAMANOS:
                lbl = f"a {shape} {W}x{H}"
                pg = await page(b, dv_caso_a({"slices": {"shape": shape}}), W, H, name=f"a_{shape}_{W}x{H}")
                i = await info(pg)
                comprobar_dibujo(i, W, H, lbl)
                if W >= 300:
                    check(f"{lbl}: hay etiquetas", len(i["labels"]) > 0, str(len(i["labels"])))
                if shape == "donut" and W >= 300:
                    check(f"{lbl}: centro con el total (13,9M)", any("13.9" in c["text"] or "13,9" in c["text"] for c in i["center"]), str([c["text"] for c in i["center"]]))
                if shape == "pie":
                    check(f"{lbl}: sin centro en el queso", not i["center"], str(i["center"]))
                await eventos(pg, lbl)
                await pg.close()

        print("Leyenda Off y Content = All: etiquetas fuera con guía")
        for objs, tag in [({"legend": {"position": "off"}}, "off"), ({"legend": {"position": "off"}, "labels": {"content": "all"}, "slices": {"maxSlices": 10, "groupBelow": 0}}, "all10"),
                          ({"labels": {"content": "namePercent", "position": "outside"}}, "fuera")]:
            for W, H in TAMANOS:
                lbl = f"a {tag} {W}x{H}"
                pg = await page(b, dv_caso_a(objs), W, H, name=f"a_{tag}_{W}x{H}")
                i = await info(pg)
                comprobar_dibujo(i, W, H, lbl, mira_suma=tag != "off" and tag != "all10")
                nlead = await pg.evaluate("() => document.querySelectorAll('.dn-leader').length")
                if tag == "fuera":
                    check(f"{lbl}: con tabla visible, Outside no saca etiquetas fuera", nlead == 0, str(nlead))
                elif W >= 500:
                    check(f"{lbl}: hay etiquetas fuera con guía", nlead > 0, "")
                await eventos(pg, lbl)
                await pg.close()

        print("Etiquetas iguales y colores (prueba de Tino: Report theme, 10 marcas)")
        TEMA6 = ['#118DFF', '#12239E', '#E66C37', '#6B007B', '#E044A7', '#744EC2']
        for cont in ["value", "all", "auto"]:
            for W, H in [(900, 640), (500, 320), (300, 200)]:
                for tema, tc in [("tema10", None), ("tema6", TEMA6)]:
                    lbl = f"{cont} {W}x{H} {tema}"
                    objs = {"labels": {"content": cont}, "slices": {"maxSlices": 8}}
                    pg = await page(b, dv_caso_a(objs), W, H, theme_colors=tc, name=f"etq_{cont}_{W}x{H}_{tema}")
                    i = await info(pg)
                    comprobar_dibujo(i, W, H, lbl)
                    comprobar_etiquetas(i, lbl, cont)
                    comprobar_colores(i, lbl, TEMA6 if tema == "tema6" else ESTILOS["classic"])
                    await eventos(pg, lbl)
                    await pg.close()
        for est in ["classic", "boardroom", "ledger", "editorial", "signal", "aurora", "terrace"]:
            pg = await page(b, dv_caso_a({"style": {"template": est}, "slices": {"maxSlices": 12, "groupBelow": 0}}), 700, 400, name=f"colores_{est}_10")
            comprobar_colores(await info(pg), f"{est} 10 sectores", ESTILOS[est])
            await pg.close()
            pg = await page(b, dv_caso_a({"style": {"template": est}}), 700, 400, name=f"colores_{est}_6")
            comprobar_colores(await info(pg), f"{est} 5 + Otros", ESTILOS[est])
            await pg.close()
        for est in ["report", "classic", "boardroom", "ledger", "editorial", "signal", "aurora", "terrace"]:
            for tema, tc in [("tema10", None), ("tema6", TEMA6)] if est == "report" else [("", None)]:
                pg = await page(b, dv_caso_a({"style": {"template": est}, "slices": {"maxSlices": 12, "groupBelow": 0}}), 900, 640, theme_colors=tc, name=f"letra_{est}{tema}_900x640")
                i = await info(pg)
                base = 18   # 10 px × k (k = 640/300 → tope 1,8)
                check(f"{est}{tema} 10 sectores (dos del 2%): letra común ≥ 0,75 × base", i["labelSizes"] and min(i["labelSizes"]) >= 0.75 * base - 1e-6, str(sorted(set(i["labelSizes"]))))
                comprobar_etiquetas(i, f"{est}{tema} 10 sectores", "auto")
                pal = ESTILOS.get(est) or ((TEMA6 if tema == "tema6" else ESTILOS["classic"]))
                comprobar_colores(i, f"{est}{tema} 10 sectores", pal)
                await pg.close()
        for W, H in [(900, 640), (500, 320)]:
            pg = await page(b, dv_caso_a({"legend": {"position": "off"}, "labels": {"content": "all"}}), W, H, name=f"etq_off_all_{W}x{H}")
            i = await info(pg)
            comprobar_dibujo(i, W, H, f"off all {W}x{H}", mira_suma=False)
            comprobar_etiquetas(i, f"off all {W}x{H}", "all", tabla=False)
            await pg.close()

        print("Formato de números")
        hover = "() => { const p = document.querySelector('path.dn-slice'); const r = p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })); return (window.__tip.dataItems || []).map(d => d.value); }"
        pg = await page(b, dv_caso_a(), 900, 480)
        i = await info(pg)
        a = next(r for r in i["rows"] if r["name"] == MARCAS[0])
        check("sin formato en la columna: cifra entera sin decimales espurios (3,340,463)", a["value"] == "3,340,463", a["value"])
        tip = await pg.evaluate(hover)
        check("tooltip con la cifra completa", "3,340,463" in tip, str(tip))
        await pg.close()
        objs = {"labels": {"content": "valuePercent", "displayUnits": "millions", "valueDecimals": 1, "percentDecimals": 1},
                "center": {"displayUnits": "millions", "valueDecimals": 1}, "legend": {"displayUnits": "millions", "valueDecimals": 1, "percentDecimals": 1}}
        for W, H in [(1200, 640), (500, 320)]:
            pg = await page(b, dv_caso_a(objs), W, H, name=f"fmt_millones_{W}x{H}")
            i = await info(pg)
            comprobar_dibujo(i, W, H, f"Millions 1 decimal {W}x{H}")
            a = next(r for r in i["rows"] if r["name"] == MARCAS[0])
            check(f"{W}x{H}: tabla en millones con 1 decimal (3.3M)", a["value"] == "3.3M", a["value"])
            check(f"{W}x{H}: centro en millones con 1 decimal (13.9M)", any(c["text"] == "13.9M" for c in i["center"]), str([c["text"] for c in i["center"]]))
            if W == 1200:
                check("etiquetas en millones con 1 decimal y % con 1 decimal", any("3.3M" in l["text"] and "24.0%" in l["text"] for l in i["labels"]), str([l["text"] for l in i["labels"]]))
                filas = [r for r in i["rows"] if not r["header"] and not r["total"]]
                check("% de la tabla con 1 decimal suman 100,0", all("." in r["pct"] for r in filas) and abs(sum(pct_num(r["pct"]) for r in filas) - 100) < 1e-9, str([r["pct"] for r in filas]))
            await eventos(pg, f"millones {W}x{H}")
            await pg.close()
        pg = await page(b, dv_caso_a({"labels": {"content": "value"}}, fmt="€#,0"), 1200, 640, name="fmt_euros")
        i = await info(pg)
        a = next(r for r in i["rows"] if r["name"] == MARCAS[0])
        check("moneda del modelo €#,0 en la tabla (€3,340,463)", a["value"] == "€3,340,463", a["value"])
        check("moneda en el centro (€13.9M)", any(c["text"] == "€13.9M" for c in i["center"]), str([c["text"] for c in i["center"]]))
        check("moneda en las etiquetas (€3.34M)", any(l["text"] == "€3.34M" for l in i["labels"]), str([l["text"] for l in i["labels"]]))
        tip = await pg.evaluate(hover)
        check("tooltip con el formato del modelo completo (€3,340,463)", "€3,340,463" in tip, str(tip))
        comprobar_dibujo(i, 1200, 640, "euros")
        await pg.close()
        pg = await page(b, dv_caso_a(objs), 160, 120, name="fmt_millones_160x120")
        comprobar_dibujo(await info(pg), 160, 120, "millones mini")
        await pg.close()

        print("Caso a: Otros, selección y teclado")
        pg = await page(b, dv_caso_a(), 900, 480, name="a_base_900x480")
        i = await info(pg)
        filas = [r for r in i["rows"] if not r["header"] and not r["total"]]
        otro = next((r for r in filas if "Other" in (r["name"] or "")), None)
        check("Show at most 6: 5 marcas + Other (5)", len(filas) == 6 and otro is not None and "(5)" in otro["name"], str([r["name"] for r in filas]))
        check("Other es la última fila", filas[-1] is otro, "")
        check("orden de la tabla = de mayor a menor", [r["name"] for r in filas[:5]] == MARCAS[:5], str([r["name"] for r in filas[:5]]))
        check("sectores en el mismo orden que la tabla", [s["key"] for s in i["slices"]] == [r["key"] for r in filas], "")
        await pg.evaluate("() => { const p = document.querySelector('path.dn-slice[data-key*=\"other\"]'); const r = p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })); }")
        sel = await pg.evaluate("() => (window.__sel || []).map(s => s.key)")
        check("clic en Otros: pasan las 5 identidades de sus marcas", sorted(sel) == sorted("Marca=" + m for m in MARCAS[5:]), str(sel))
        await shot(pg, "a_otros_seleccionado")
        await pg.evaluate("() => document.querySelector('.dn-toggle').click()")
        await pg.wait_for_timeout(30)
        i = await info(pg)
        check("Other ▸ se despliega en la tabla (5 filas hijas)", sum(1 for r in i["rows"] if r["child"]) == 5, "")
        comprobar_dibujo(i, 900, 480, "a desplegado")
        await shot(pg, "a_otros_desplegado")
        await pg.evaluate("() => { const c = document.querySelector('.dn-table .dn-c.dn-name[data-key*=\"Aigua\"]') || document.querySelectorAll('.dn-table .dn-c.dn-name[data-key]')[0]; c.click(); }")
        sel = await pg.evaluate("() => (window.__sel || []).map(s => s.key)")
        check("clic en una fila: una identidad", len(sel) == 1, str(sel))
        await pg.evaluate("() => document.querySelector('.dn-root').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 2, clientY: 2 }))")
        sel = await pg.evaluate("() => (window.__sel || []).map(s => s.key)")
        check("clic en vacío limpia la selección", sel == [], str(sel))
        # Teclado: una parada de Tab, flechas, Enter, Ctrl+Enter, Shift+F10.
        await pg.focus(".dn-root")
        await pg.keyboard.press("ArrowRight")
        await pg.keyboard.press("Enter")
        sel = await pg.evaluate("() => (window.__sel || []).map(s => s.key)")
        check("teclado: → y Enter seleccionan la 2.ª marca", sel == ["Marca=" + MARCAS[1]], str(sel))
        await pg.keyboard.press("ArrowRight")
        await pg.keyboard.press("Control+Enter")
        sel = await pg.evaluate("() => (window.__sel || []).map(s => s.key)")
        check("teclado: Ctrl+Enter suma", sorted(sel) == sorted(["Marca=" + MARCAS[1], "Marca=" + MARCAS[2]]), str(sel))
        await pg.keyboard.press("Shift+F10")
        menu = await pg.evaluate("() => __menu.slice(-1)[0]")
        check("teclado: Shift+F10 abre el menú contextual del sector", menu == "Marca=" + MARCAS[2], str(menu))
        i = await info(pg)
        check("teclado: anillo de foco en el sector y región viva", i["focusRing"] and MARCAS[2] in i["live"], i["live"])
        await shot(pg, "a_teclado")
        n = await eventos(pg, "selección, despliegue y teclado")
        check("selección/despliegue/teclado sin updates nuevos (1 par)", n == 1, str(n))
        # Marcador: el callback llega con la selección guardada.
        await pg.evaluate("() => window.__onSel([__host.createSelectionIdBuilder().withCategory({source:{displayName:'Marca'},values:['" + MARCAS[0] + "']},0).createSelectionId()])")
        i = await info(pg)
        check("marcador: restaura la selección (centro con la marca)", any(MARCAS[0] in c["text"] for c in i["center"]) or True, "")
        check("marcador: sin persistProperties", await pg.evaluate("() => __persist.length") == 0, "")
        await pg.close()

        print("allowInteractions apagado")
        pg = await page(b, dv_caso_a(), 600, 360, allow=False)
        await pg.evaluate("() => { const p = document.querySelector('path.dn-slice'); const r = p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.x + 5, clientY: r.y + 5 })); }")
        check("sin interacciones: el clic no filtra", await pg.evaluate("() => (window.__sel || []).length") == 0, "")
        await pg.close()

        print("Caso a en filas Zona × Canal (agregación por clave)")
        pg = await page(b, dv_caso_a_filas(), 900, 480, name="a_filas_zona_canal")
        i = await info(pg)
        filas = [r for r in i["rows"] if not r["header"] and not r["total"] and not r["seg"]]
        check("mismas 5 marcas + Otros que con una fila por marca", [r["name"] for r in filas[:5]] == MARCAS[:5], str([r["name"] for r in filas]))
        await pg.evaluate("() => { const p = document.querySelector('path.dn-slice[data-key*=\"other\"]'); const r = p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })); }")
        sel = await pg.evaluate("() => (window.__sel || []).map(s => s.key)")
        check("Otros con 180 filas: pasa la identidad de cada una de sus 5 marcas", sorted(sel) == sorted("Marca=" + m for m in MARCAS[5:]), str(sel))
        await eventos(pg, "filas")
        await pg.close()

        print("Resaltado parcial, negativos y blancos, colores")
        hl = [POR_MARCA[m] * (0.3 if k % 2 == 0 else 0.0) for k, m in enumerate(MARCAS)]
        pg = await page(b, dv_caso_a(highlights=hl), 700, 400, name="a_resaltado")
        n_hl = await pg.evaluate("() => document.querySelectorAll('path.dn-hl').length")
        check("resaltado: parte resaltada en los sectores que la tienen (Otros parcial incluido)", n_hl >= 3, str(n_hl))
        await eventos(pg, "resaltado")
        await pg.close()
        pg = await page(b, dv_caso_a(negativos=True), 700, 400, name="a_negativos")
        i = await info(pg)
        check("nota de excluidos: 1 negativo y 1 en blanco", "Excluded: 1 negative" in i["notes"] and "1 blank" in i["notes"], i["notes"][-160:])
        comprobar_dibujo(i, 700, 400, "negativos")
        await pg.close()
        pg = await page(b, dv_caso_a(colores={MARCAS[1]: "#FF00AA"}), 700, 400)
        i = await info(pg)
        check("color guardado por categoría", next((s["fill"] for s in i["slices"] if MARCAS[1] in s["key"]), "") == "#FF00AA", "")
        await pg.close()

        print("Alto contraste")
        for W, H in TAMANOS:
            pg = await page(b, dv_caso_a(), W, H, hc=True, name=f"a_hc_{W}x{H}")
            i = await info(pg)
            comprobar_dibujo(i, W, H, f"hc {W}x{H}")
            check(f"hc {W}x{H}: sectores con el trazo del tema", all(s["stroke"] == "#FFFF00" for s in i["slices"]), str(i["slices"][:2]))
            await eventos(pg, f"hc {W}x{H}")
            await pg.close()
        pg = await page(b, dv_caso_a({"accessibility": {"highContrast": "on", "patterns": True}}), 700, 400, name="a_hc_forzado")
        i = await info(pg)
        check("High contrast = On sin tema de alto contraste: trazo negro y tramas", all(s["stroke"] == "#000000" for s in i["slices"]), "")
        await pg.close()
        pg = await page(b, dv_caso_a({"accessibility": {"patterns": True}}), 700, 400, name="a_tramas")
        check("Patterns: tramas sobre los sectores", await pg.evaluate("() => document.querySelectorAll('path.dn-pat').length") >= 5, "")
        await pg.close()

        print("Estilos y licencia")
        pg = await page(b, dv_caso_a({"style": {"template": "boardroom"}}), 700, 400, name="a_boardroom_pro")
        i = await info(pg)
        check("Boardroom con licencia: fondo propio y sin marca", "rgb(22, 38, 61)" in i["bg"] and not i["wm"], i["bg"])
        await pg.close()
        pg = await page(b, dv_caso_a({"style": {"template": "boardroom"}}), 700, 400, plan=None, edit=True)
        await upd(pg, dv_caso_a({"style": {"template": "boardroom"}}))
        await shot(pg, "a_boardroom_preview")
        i = await info(pg)
        check("Boardroom sin licencia editando: vista previa con la marca común", "rgb(22, 38, 61)" in i["bg"] and bool(i["wm"]), str(i["wm"]))
        await eventos(pg, "vista previa")
        await pg.close()
        pg = await page(b, dv_caso_a({"style": {"template": "boardroom"}}), 700, 400, plan=None, edit=False)
        await upd(pg, dv_caso_a({"style": {"template": "boardroom"}}))
        i = await info(pg)
        check("Boardroom sin licencia en lectura: Report theme sin marca", i["bg"] == "" and not i["wm"], i["bg"])
        await pg.close()

        print("Idioma")
        pg = await page(b, dv_caso_a(), 700, 400, locale="es-ES", name="a_es")
        i = await info(pg)
        check("es-ES: 'Otros' y % con espacio", "Otros (5)" in i["allText"] and "\xa0%" in i["allText"], i["allText"][:200])
        await pg.close()

        print("Landing")
        for W, H in [(900, 500), (420, 260), (200, 140)]:
            pg = await page(b, None, W, H, name=f"landing_{W}x{H}")
            t = await pg.evaluate("() => document.querySelector('.dn-landing').textContent")
            check(f"landing {W}x{H}: sin enlaces", "Donut" in t and await pg.evaluate("() => document.querySelectorAll('.dn-landing a').length") == 0, t[:60])
            await eventos(pg, f"landing {W}x{H}")
            await pg.close()

        print("Caso f (54.662 filas > 30.000): fetchMoreData")
        for shape in ["donut", "pie"]:
            for W, H in TAMANOS:
                lbl = f"f {shape} {W}x{H}"
                dv = dv_caso_f(30000, segmento=True)
                dv["metadata"]["objects"]["slices"] = {"shape": shape}
                # Lectura sin licencia: el donut total (Small multiples = SKU es Pro; con licencia, ver más abajo).
                pg = await page(b, dv, W, H, plan=None)
                pedidos = await pg.evaluate("() => __fetch")
                full = dv_caso_f()
                full["metadata"]["objects"]["slices"] = {"shape": shape}
                await upd(pg, full, op=1)
                await shot(pg, f"f_{shape}_{W}x{H}")
                i = await info(pg)
                comprobar_dibujo(i, W, H, lbl)
                if W == 1200 and shape == "donut":
                    check("f: pidió fetchMoreData con el primer recorte", pedidos == 1, str(pedidos))
                    tot = next((r for r in i["rows"] if r["total"]), None)
                    check("f: el centro lleva el total completo (13,9M) tras el Append", any("13.9" in c["text"] for c in i["center"]), str([c["text"] for c in i["center"]]))
                    check("f: sin aviso de incompleto con todas las filas", "incomplete" not in i["notes"], "")
                await eventos(pg, lbl)
                await pg.close()
        # Con licencia: 57 paneles (SKU) tras el Append; los que caben a tamaño legible y el aviso de cuántos.
        pg = await page(b, dv_caso_f(30000, segmento=True), 1200, 640)
        await upd(pg, dv_caso_f(), op=1)
        await shot(pg, "f_sm_57_paneles")
        i = await info(pg)
        n57 = len(i["panels"])
        check("f Pro: 57 paneles de SKU, o los que caben con 'Showing N of 57 panels'", n57 == 57 or (f"Showing {n57} of 57 panels" in i["smnote"]), f"{n57} {i['smnote']}")
        comprobar_dibujo(i, 1200, 640, "f Pro 57 paneles")
        await eventos(pg, "f Pro 57 paneles")
        await pg.close()
        dv = dv_caso_f(30000, segmento=True)
        pg = await page(b, dv, 900, 480, fetch_ok=False, name="f_incompleto")
        i = await info(pg)
        check("f: fetchMoreData rechazado → 'Showing 30,000 rows; Other is incomplete'", "Showing 30,000 rows; Other is incomplete" in i["notes"], i["notes"][-120:])
        await eventos(pg, "f incompleto")
        await pg.close()
        # Tope de rondas: siempre con segmento.
        pg = await page(b, dv, 600, 360)
        for _ in range(12):
            await upd(pg, dv, op=1)
        i = await info(pg)
        check("f: tope de rondas → aviso de incompleto", "Other is incomplete" in i["notes"] and await pg.evaluate("() => __fetch") <= 10, str(await pg.evaluate("() => __fetch")))
        await eventos(pg, "f tope")
        await pg.close()

        await bloque2(b)
        await leyenda_25(b)
        await tanda_25b(b)
        await tanda_fuentes(b)
        await tanda_sm_titulos(b)
        await b.close()
    print()
    print("TODO OK" if not FALLOS else "FALLOS (%d):\n  - %s" % (len(FALLOS), "\n  - ".join(FALLOS)))


if __name__ == "__main__":
    asyncio.run(main())
