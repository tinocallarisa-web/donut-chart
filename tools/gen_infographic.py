# -*- coding: utf-8 -*-
"""Infografías y capturas de la ficha de Donut & Pie Chart by TCViz (1366x768, assets/) con la plantilla común de la web.

El contenido sale de docs/WEBSITE-PRODUCT-PAGE.md (la entrada de data.jsx): se corrige la ficha, no la imagen.
Las imágenes del visual son del simulador (tools/simulador/ficha.py), que carga el visual real con DonutChart_Dataset.xlsx
(hoja Ventas); ninguna lleva la marca de agua "Pro preview" (la build de capturas fuerza Pro y quita el sello).

Regla del rechazo 100.3.2.2 (Treemap, 25-11-2026): el visual se captura a menos px lógicos con dpr 3, de modo que aquí
se AMPLÍA (≥ 1,28x) y su texto queda por encima de ~12 px; nunca rejillas de miniaturas.

    node build-test.js --capturas && python tools/simulador/ficha.py && python tools/gen_infographic.py
Salida: assets/infographic.png, infographic-pro.png, Screenshot_1..5.png; copia 2x para la web en
datos/demo_rtm/export/infografias/donut-chart-infographic.png.
"""
import html, json, os, re, shutil, subprocess, sys, tempfile
sys.path.insert(0, r"C:\tcviz\datos\demo_rtm")
import infografias as I
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAP = os.path.join(ROOT, "tools", "simulador", "capturas")
ASSETS = os.path.join(ROOT, "assets")
md = open(os.path.join(ROOT, "docs", "WEBSITE-PRODUCT-PAGE.md"), encoding="utf-8").read()
js = re.search(r"```js\n(.*?)\n```", md, re.S).group(1).strip().rstrip(",")
r = subprocess.run(["node", "-e", "process.stdout.write(JSON.stringify(eval('(' + require('fs').readFileSync(0,'utf8') + ')')))"],
                   input=js, capture_output=True, text=True, encoding="utf-8", check=True)
P = json.loads(r.stdout)
e = html.escape
CSS = I.CSS % {"pop": I.uri(os.path.join(I.BASE, "tema", "Poppins"))}
LOGO = I.uri(os.path.join(I.WEB, "logos", "tcviz-logo-light.svg"))
cap = lambda n: I.uri(os.path.join(CAP, n + ".png"))


def render(h_html, png2x, png1x):
    subprocess.run([I.EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
                    "--allow-file-access-from-files", f"--screenshot={png2x}", "--window-size=1366,768", I.uri(h_html)],
                   capture_output=True, timeout=90)
    Image.open(png2x).convert("RGB").resize((1366, 768), Image.LANCZOS).save(png1x, optimize=True)
    print("  ", os.path.relpath(png1x, ROOT))


def cabecera(titulo, sub, tier='<span class="pill free">Free</span><span class="pill pro">Pro</span>'):
    return (f'<div class="cab"><img class="logo" src="{LOGO}"><div class="sep"></div>'
            f'<div><h1>{e(titulo)}</h1><p>{e(sub)}</p></div><div class="tier">{tier}</div></div><div class="raya"></div>')


PIE = (f'<div class="fin"><span>tcviz.com · Power BI custom visual · {e(P["name"])}</span>'
       f'<span>Sample data: Begudes Nord, a fictitious drinks company</span></div>')


def pagina(nombre, cuerpo, extra_css=""):
    h = os.path.join(I.OUT, nombre + ".html")
    open(h, "w", encoding="utf-8").write(f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}{extra_css}</style></head><body>{cuerpo}</body></html>')
    return h


tmp = tempfile.mkdtemp()
try:
    # 1. Plantilla común de la web; imagen central: Compare + Target (620x218 lógicos, se pinta a ~852x300).
    shutil.copy(os.path.join(CAP, "ficha_central.png"), os.path.join(tmp, "central_99.png"))
    exp, I.EXP = I.EXP, tmp
    h1 = os.path.join(I.OUT, "donut-chart-infographic.html")
    ficha = I.ficha(P, 99, "Who is really gaining share?")
    assert "Power BI Desktop, TCViz theme" in ficha   # la imagen es del simulador, no de Desktop
    open(h1, "w", encoding="utf-8").write(ficha.replace("Power BI Desktop, TCViz theme", "drawn by the visual, Report theme"))
    I.EXP = exp
    render(h1, os.path.join(I.OUT, "donut-chart-infographic.png"), os.path.join(ASSETS, "infographic.png"))
finally:
    shutil.rmtree(tmp, ignore_errors=True)

# 2. Free frente a Pro con el mismo dato (440x270 lógicos → ~619 px de ancho: 1,4x)
DOS = """.dos{position:absolute;left:24px;right:24px;top:115px;bottom:40px;display:grid;grid-template-columns:1fr 1fr;gap:16px}
.dos .card{padding:14px 16px;display:flex;flex-direction:column}
.dos img{width:100%;border-radius:4px;display:block;border:1px solid #EEE}
.dos h2{font-size:16px} .dos .f h2{color:#3E9C5B} .dos .p h2{color:#2B6CB0}
.dos ul{list-style:none;margin-top:10px;columns:2;column-gap:18px}
.dos li{font-size:12.5px;line-height:1.35;padding-left:16px;position:relative;margin-bottom:6px;break-inside:avoid}
.dos .f li:before{content:'✓';color:#3E9C5B;position:absolute;left:0;font-weight:700}
.dos .p li:before{content:'+';color:#2B6CB0;position:absolute;left:0;font-weight:700}
.sub{font-size:12.5px;color:#666;margin:-4px 0 8px}"""
free_items = ["Labels inside, never cut", "Shares that add up to 100", "Honest Other you can open",
              "Legend and data table", "Total in the center", "Lasso, drilldown, fx"]
li = lambda xs: "".join(f"<li>{e(x)}</li>" for x in xs)
h2 = pagina("donut-chart-infographic-pro", cabecera("Free reads the shares. Pro reads what moved.", f'{P["name"]} — the same data, without and with a licence.') + f"""
<div class="dos">
<div class="card f"><h2>Free — a complete donut</h2><div class="sub">Litres by brand, with the data table on.</div>
<img src="{cap('ficha_free')}"><ul>{li(free_items)}</ul></div>
<div class="card p"><h2>Pro — change and target in the table</h2><div class="sub">The same slices against last year and the plan.</div>
<img src="{cap('ficha_pro')}"><ul>{li(P["freemium"]["pro"][:6])}</ul></div>
</div>
<div class="fin"><span>tcviz.com · Power BI custom visual · {e(P["name"])}</span><span>Without a licence, editing shows a limited Pro preview (3 largest categories) under a watermark.</span></div>""", DOS)
render(h2, os.path.join(I.OUT, "donut-chart-infographic-pro.png"), os.path.join(ASSETS, "infographic-pro.png"))

# 3. Capturas de la ficha: una idea por imagen
UNA = """.una{position:absolute;left:24px;right:24px;top:112px;bottom:40px;display:flex;gap:16px}
.una .card{padding:14px;display:flex;align-items:center;justify-content:center;flex:1}
.una img{max-width:100%;max-height:100%;display:block}
.una .lado{flex:0 0 300px;flex-direction:column;align-items:flex-start;justify-content:flex-start}
.una .lado h2{font-size:17px;margin-bottom:8px} .una .lado p{font-size:13.5px;line-height:1.45;color:#444;margin-bottom:10px}
.tres{position:absolute;left:24px;right:24px;top:112px;bottom:40px;display:grid;grid-template-columns:1.55fr 1fr;grid-template-rows:1fr 1fr;gap:14px}
.tres .card{padding:10px;display:flex;flex-direction:column;align-items:flex-start;min-height:0;overflow:hidden}
.tres .l{grid-row:1 / span 2}
.tres b{font-size:12.5px;margin-bottom:6px;color:#555}"""
EST3 = """.est3{position:absolute;left:24px;right:24px;top:112px;bottom:40px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.est3 .card{padding:10px;display:flex;flex-direction:column;min-height:0;overflow:hidden}
.est3 img{flex:1 1 auto;min-height:0;width:100%;object-fit:contain;display:block;border-radius:3px} .est3 b{font-size:15px;margin-top:6px;color:#444}"""


def una(n, titulo, sub, img, lado_h, lado_p):
    ps = "".join(f"<p>{e(x)}</p>" for x in lado_p)
    h = pagina(f"donut-chart-shot-{n}", cabecera(titulo, sub) + f"""<div class="una"><div class="card"><img src="{cap(img)}"></div>
<div class="card lado"><h2>{e(lado_h)}</h2>{ps}</div></div>""" + PIE, UNA)
    render(h, os.path.join(I.OUT, f"donut-chart-shot-{n}.png"), os.path.join(ASSETS, f"Screenshot_{n}.png"))


una(1, "Who is really gaining share?", "Compare with and Target (Pro): the change in share and value, and the % of target, next to every slice.",
    "ficha_compare", "Read it in one pass",
    ["Δ pp is the change in share, with a mini bar; Δ % is the change in value.",
     "⚠ marks a brand whose value grew while its share fell: the total grew faster.",
     "✓ ≈ ✕ give the % of target with a shape as well as a colour.",
     "The summary sentence says who leads, what the top three hold and the biggest shift."])
una(2, "Family and brand in one chart", "Segment (Pro): an outer ring splits every family by brand, at the same angle as its slice.",
    "ficha_segment", "Two levels, one reading",
    ["The inner ring is the family, the outer ring its brands, each with its own label.",
     "The data table can list the brands under each family, with value and share.",
     "If the two fields are nested the wrong way round, a note says to swap them."])
una(3, "One donut per channel", "Small multiples (Pro): the same Other, order and colours in every panel, and a shared table of the total.",
    "ficha_sm", "Compare the mix across channels",
    ["Each donut has its own total in the center and its title above.",
     "The table is the total of all panels, with the change against last year.",
     "Point at a table row to see its value in every panel."])
# Las tres a la misma escala (1,35x): el texto del visual se lee igual en las tres (rechazo 100.3.2.2).
h4 = pagina("donut-chart-shot-4", cabecera("Readable at any size", "The same visual in a large, medium and small slot, shown at the same scale: labels shorten or step aside, never cut.") + f"""
<div class="tres"><div class="card l"><b>Large · 540 × 320</b><img src="{cap('ficha_size_l')}" style="flex:none;width:729px"></div>
<div class="card"><b>Medium · 340 × 185</b><img src="{cap('ficha_size_m')}" style="flex:none;width:459px"></div>
<div class="card"><b>Small · 230 × 130</b><img src="{cap('ficha_size_s')}" style="flex:none;width:311px"></div></div>""" + PIE, UNA)
render(h4, os.path.join(I.OUT, "donut-chart-shot-4.png"), os.path.join(ASSETS, "Screenshot_4.png"))
# Tres estilos grandes; los seis nombrados en el subtítulo (nunca seis miniaturas).
est = "".join(f'<div class="card"><img src="{cap("ficha_style_" + s)}"><b>{s.title()}</b></div>' for s in ("boardroom", "ledger", "aurora"))
h5 = pagina("donut-chart-shot-5", cabecera("Six collection styles", "Boardroom, Ledger, Editorial, Signal, Aurora and Terrace: the same looks as the rest of TCViz. Report theme and Classic are free; the six styles are Pro.") +
            f'<div class="est3">{est}</div>' + PIE, UNA + EST3)
render(h5, os.path.join(I.OUT, "donut-chart-shot-5.png"), os.path.join(ASSETS, "Screenshot_5.png"))
print("ok")
