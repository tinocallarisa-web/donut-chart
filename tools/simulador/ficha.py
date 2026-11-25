# -*- coding: utf-8 -*-
"""Capturas de la ficha de AppSource y de la web (Donut & Pie Chart by TCViz), con el visual real en el simulador.

Regla del rechazo 100.3.2.2 del Treemap (25-11-2026): el visual se captura a MENOS px lógicos de los que ocupará en la
plantilla de 1366x768 y con dpr 3, para que su texto salga ampliado (≥ ~12 px) y nítido; nunca rejillas de miniaturas.
Necesita el bundle Pro sin sello ni marca de agua:

    node build-test.js --capturas
    python tools/simulador/ficha.py          # → tools/simulador/capturas/ficha_*.png
    python tools/simulador/ficha.py --paquete dist/<guid>_test.<versión>.pbiviz   # sin depender de .tmp/drop
    python tools/gen_infographic.py          # → assets/

Datos: DonutChart_Dataset.xlsx, hoja Ventas (Begudes Nord, ficticio), con los nombres de campo en inglés para la ficha.
"""
import asyncio, io, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
from playwright.async_api import async_playwright

OUT = H.OUT
DROP = H.DROP
if "--paquete" in sys.argv:
    # Sin recompilar: el bundle sale de un .pbiviz de capturas ya hecho (p. ej. dist/..._test.1.0.0.69.pbiviz). Útil si
    # .tmp/drop tiene otra build (la free del simulador).
    import zipfile
    z = zipfile.ZipFile(sys.argv[sys.argv.index("--paquete") + 1])
    res = json.loads(z.read(json.loads(z.read("package.json"))["resources"][0]["file"]))
    DROP = os.path.join(H.ROOT, ".tmp", "drop_capturas")
    os.makedirs(DROP, exist_ok=True)
    # Un _test normal lleva el sello de compilación «[test AAAA-MM-DD HH:MM v…]»: se vacía, como hace --capturas.
    import re
    io.open(os.path.join(DROP, "visual.js"), "w", encoding="utf-8").write(
        re.sub(r'"test(free)? \d{4}-\d\d-\d\d \d\d:\d\d v[\d.]+"', '""', res["content"]["js"]))
    io.open(os.path.join(DROP, "visual.css"), "w", encoding="utf-8").write(res["content"]["css"])
    json.dump({"visual": res["visual"]}, io.open(os.path.join(DROP, "pbiviz.json"), "w", encoding="utf-8"))
CAMPOS = {"Marca": "Brand", "Familia": "Family", "Canal": "Channel", "Zona": "Zone",
          "Litros": "Litres", "Litros AA": "Litres PY", "Plan litros": "Plan", "First Nota": "Note"}
VALORES = {"Refrescos": "Soft drinks", "Aguas": "Water", "Cerveza 0,0": "Beer 0.0", "Zumos": "Juices",
           "Isotónicas y energéticas": "Sports & energy", "Té y café frío": "Iced tea & coffee",
           "HOME": "Home", "AFH": "Away from home"}


def ingles(dv):
    """Nombres de campo y valores de Familia/Canal en inglés; formato #,0 en las medidas (como un modelo real)."""
    for c in dv["metadata"]["columns"]:
        c["displayName"] = CAMPOS.get(c["displayName"], c["displayName"])
        if c.get("type", {}).get("numeric"):
            c["format"] = "#,0"
    for c in dv["categorical"]["categories"]:
        c["values"] = [VALORES.get(v, v) for v in c["values"]]
        c["identity"] = [{"v": VALORES.get(i["v"], i["v"])} for i in c["identity"]]
    return dv


def dv(objects=None, **kw):
    o = {"style": {"guide": False}}
    for k, v in (objects or {}).items():
        o.setdefault(k, {}).update(v)
    return ingles(H.dv_ventas(o, legacy=False, **kw))


async def shot(b, name, data, W, H_, dpr=3):
    guid = json.load(io.open(os.path.join(DROP, "pbiviz.json"), encoding="utf-8"))["visual"]["guid"]
    assert guid.endswith("_test"), "hace falta la build Pro: node build-test.js --capturas (hay " + guid + ")"
    pg = await b.new_page(viewport={"width": W, "height": H_}, device_scale_factor=dpr)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.set_content(f"<html><body style='margin:0;background:#fff'><div id='host' style='position:relative;width:{W}px;height:{H_}px;overflow:hidden'></div></body></html>")
    await pg.add_style_tag(path=os.path.join(DROP, "visual.css"))
    await pg.add_script_tag(content=f"window.__plan = {json.dumps(H.PLAN)}; window.__hc = false; window.__locale = 'en-US'; window.__fetchOk = true; window.__allow = true; window.__themeColors = null;")
    await pg.add_script_tag(content=H.STUB)
    await pg.add_script_tag(path=os.path.join(DROP, "visual.js"))
    await pg.evaluate("(g) => { window.__v = powerbi.visuals.plugins[g].create({ element: document.getElementById('host'), host: __host }); }", guid)
    for _ in range(2):   # el segundo update, con la licencia ya resuelta
        await pg.evaluate("([dv, W, H]) => { window.__cats = dv.categorical.categories; __v.update({ dataViews: [dv], viewport: { width: W, height: H }, type: 2, operationKind: 0, viewMode: 0, editMode: 0, jsonFilters: [] }); }",
                          [data, W, H_])
        await pg.wait_for_timeout(250)
    wm = await pg.evaluate("() => !!document.querySelector('.dn-root') && getComputedStyle(document.querySelector('.dn-root')).display")
    await pg.screenshot(path=os.path.join(OUT, name + ".png"), clip={"x": 0, "y": 0, "width": W, "height": H_})
    txt = await pg.evaluate("() => document.getElementById('host').innerText")
    if errs or "Pro preview" in txt:
        print("  FALLO", name, errs[:2], "marca de agua" if "Pro preview" in txt else "")
    else:
        print("  ok", name, f"{W}x{H_}")
    await pg.close()


async def main():
    os.makedirs(OUT, exist_ok=True)
    cmp_tgt = dict(compare=True, target=True)
    tabla = {"dataTable": {"position": "right"}}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # 1. ¿Quién gana cuota de verdad? Compare + Target, tabla a la derecha, Summary.
        await shot(b, "ficha_compare", dv(tabla, **cmp_tgt), 700, 400)
        # 2. Familia × Marca con el anillo exterior (Segment) y sus etiquetas.
        await shot(b, "ficha_segment", dv({"labels": {"content": "namePercent"}, "legend": {"position": "off"},
                                          "dataTable": {"position": "right", "segRows": True}}, cat="Familia", segment="Marca"), 700, 400)
        # 3. Small multiples por Canal, con la tabla del total.
        await shot(b, "ficha_sm", dv({"dataTable": {"position": "right"}, "accessibility": {"minFontSize": 10}}, compare=True, facet="Canal"), 760, 400)
        # 4. Estilos: tres grandes.
        for st in ("boardroom", "ledger", "aurora"):
            await shot(b, "ficha_style_" + st, dv({"style": {"template": st}, "dataTable": {"position": "bottom"}}, compare=True), 320, 450)
        # 5. A cualquier tamaño, misma escala (texto mínimo 9 px → ~12 px en la plantilla).
        for nm, (w, h) in {"l": (540, 320), "m": (340, 185), "s": (230, 130)}.items():
            await shot(b, "ficha_size_" + nm, dv({"accessibility": {"minFontSize": 9}}), w, h)
        # 6. Infografía: central de la plantilla común (hueco ~852x300) y Free frente a Pro.
        await shot(b, "ficha_central", dv({"dataTable": {"position": "right"}, "accessibility": {"minFontSize": 10}}, **cmp_tgt), 620, 218)
        await shot(b, "ficha_free", dv({"dataTable": {"position": "right"}}), 440, 270)
        await shot(b, "ficha_pro", dv({"dataTable": {"position": "right"}}, **cmp_tgt), 440, 270)
        await b.close()


if __name__ == "__main__":
    asyncio.run(main())
