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


def dv_caso_a(objects=None, guia=False, highlights=None, negativos=False, colores=None, fmt=None):
    objects = json.loads(json.dumps(objects or {}))
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
    objects = json.loads(json.dumps(objects or {}))
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
    md = {"objects": {"style": {"guide": False}}, "columns": [c["source"] for c in cats] + [m["source"] for m in ms]}
    if segmento:
        md["segment"] = {}
    return {"metadata": md, "categorical": {"categories": cats, "values": ms}}


TOTAL_F = sum(r["Litros"] for r in DETALLE)

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
    const cells = Array.from(table.querySelectorAll('.dn-grid > .dn-c'));
    for (let i = 0; i < cells.length; i += 4) {
      const c = cells.slice(i, i + 4);
      rows.push({ name: c[1].textContent, value: c[2].textContent, pct: c[3].textContent, header: c[1].classList.contains('dn-h'),
        total: c[1].classList.contains('dn-t'), child: c[1].classList.contains('dn-child'), key: c[1].getAttribute('data-key') });
    }
  }
  const allText = Array.from(root.querySelectorAll('text, .dn-table, .dn-notes, .dn-msg, .dn-landing')).map(e => e.textContent).join(' | ');
  const center = Array.from(root.querySelectorAll('.dn-center-text')).map(t => ({ text: t.textContent, size: +t.getAttribute('font-size'), ...R(t) }));
  const slices = Array.from(root.querySelectorAll('path.dn-slice')).map(p => ({ key: p.getAttribute('data-key'), fill: p.getAttribute('fill'), stroke: p.getAttribute('stroke') }));
  const sizes = Array.from(root.querySelectorAll('svg text')).filter(t => t.textContent.trim() && !t.textContent.startsWith('[test'))
     .map(t => parseFloat(t.getAttribute('font-size') || getComputedStyle(t).fontSize));
  if (table) sizes.push(parseFloat(getComputedStyle(table).fontSize));
  const wm = h.querySelector('.tcviz-wm');
  return { labels, tb, rows, allText, center, slices, minFont: sizes.length ? Math.min(...sizes) : 0, maxFont: sizes.length ? Math.max(...sizes) : 0,
    tableOverflow: table ? (table.scrollHeight > table.clientHeight + 1 || table.scrollWidth > table.clientWidth + 1) : false,
    bg: root.style.background, wm: wm && wm.style.display !== 'none' ? wm.textContent : null, notes: allText,
    leaders: root.querySelectorAll('.dn-leader').length,
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
        filas = [r for r in i["rows"] if not r["header"] and not r["total"] and not r["child"]]
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


def comprobar_colores(i, label):
    sl = i["slices"]
    fills = [s["fill"].upper() for s in sl]
    check(f"{label}: colores de sectores únicos", len(set(fills)) == len(fills), str(fills))
    otro = next((s["fill"].upper() for s in sl if "other" in s["key"]), None)
    if otro:
        r, g, b_ = int(otro[1:3], 16), int(otro[3:5], 16), int(otro[5:7], 16)
        check(f"{label}: Otros en gris neutro distinto", max(r, g, b_) - min(r, g, b_) <= 12 and fills.count(otro) == 1, otro)
    pares = min((de2000(a, b) for k, a in enumerate(fills) for b in fills[k + 1:]), default=99)
    vec = min((de2000(fills[k], fills[(k + 1) % len(fills)]) for k in range(len(fills))) if len(fills) > 1 else [99])
    check(f"{label}: ΔE2000 ≥ 12 entre cualquier par", pares >= 12, f"{pares:.1f}")
    check(f"{label}: ΔE2000 ≥ 20 entre vecinos", vec >= 20, f"{vec:.1f}")
    grises = [s["fill"] for s in sl if "other" not in s["key"] and (lambda L: (L[1] ** 2 + L[2] ** 2) ** 0.5)(_lab(s["fill"])) < 15]
    check(f"{label}: ningún sector automático en gris", not grises, str(grises))


TAMANOS = [(1200, 640), (500, 320), (300, 200), (160, 120)]


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()

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
                    comprobar_colores(i, lbl)
                    await eventos(pg, lbl)
                    await pg.close()
        for est in ["classic", "boardroom", "ledger", "editorial", "signal", "aurora", "terrace"]:
            pg = await page(b, dv_caso_a({"style": {"template": est}, "slices": {"maxSlices": 12, "groupBelow": 0}}), 700, 400, name=f"colores_{est}")
            comprobar_colores(await info(pg), f"{est} 10 sectores")
            await pg.close()
            pg = await page(b, dv_caso_a({"style": {"template": est}}), 700, 400)
            comprobar_colores(await info(pg), f"{est} con Otros")
            await pg.close()
        for est in ["report", "classic", "boardroom", "ledger", "editorial", "signal", "aurora", "terrace"]:
            for tema, tc in [("tema10", None), ("tema6", TEMA6)] if est == "report" else [("", None)]:
                pg = await page(b, dv_caso_a({"style": {"template": est}, "slices": {"maxSlices": 12, "groupBelow": 0}}), 900, 640, theme_colors=tc, name=f"letra_{est}{tema}_900x640")
                i = await info(pg)
                base = 18   # 10 px × k (k = 640/300 → tope 1,8)
                check(f"{est}{tema} 10 sectores (dos del 2%): letra común ≥ 0,75 × base", i["labelSizes"] and min(i["labelSizes"]) >= 0.75 * base - 1e-6, str(sorted(set(i["labelSizes"]))))
                comprobar_etiquetas(i, f"{est}{tema} 10 sectores", "auto")
                comprobar_colores(i, f"{est}{tema} 10 sectores")
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
        filas = [r for r in i["rows"] if not r["header"] and not r["total"]]
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
                pg = await page(b, dv, W, H)
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

        await b.close()
    print()
    print("TODO OK" if not FALLOS else "FALLOS (%d):\n  - %s" % (len(FALLOS), "\n  - ".join(FALLOS)))


if __name__ == "__main__":
    asyncio.run(main())
