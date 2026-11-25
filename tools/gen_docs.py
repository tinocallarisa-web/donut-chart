# -*- coding: utf-8 -*-
"""Páginas publicadas (docs/) de Donut & Pie Chart by TCViz.

Armazón del Treemap (tools/gen_docs.py): estilo, cabecera y buscador de Word Cloud. El contenido describe lo que hace
el código (capabilities.json, src/visual.ts, src/model.ts, src/formatSpec.ts) y lo que comprueba el simulador
(tools/simulador/harness.py). Si cambia una función, cambiarla aquí y regenerar:   python tools/gen_docs.py
Para OKviz, los nombres de criterio van escritos tal cual: "Dynamic format strings", "Conditional formatting (fx)",
"On-object formatting", "Small multiples", "Report page tooltips", "Drilldown", "Lasso selection".
El changelog.html sale de CHANGELOG.md (raíz).
"""
import io, json, os, re, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WC = r"C:\tcviz\dev\WordCloud\docs"
NAME = "Donut & Pie Chart by TCViz"
BASE = "https://tinocallarisa-web.github.io/donut-chart/"
REPO = "https://github.com/tinocallarisa-web/donut-chart"
VERSION = json.load(io.open(os.path.join(ROOT, "pbiviz.json"), encoding="utf-8"))["visual"]["version"]
FECHA = "25 November 2026"
# Pendiente: la URL la da Tino cuando el vídeo esté en YouTube. Solo la forma canónica https://www.youtube.com/watch?v=<id>.
VIDEO = ""

plantilla = io.open(os.path.join(WC, "privacy.html"), encoding="utf-8").read()
HEAD = plantilla[:plantilla.index("<body>")]
HEADER = plantilla[plantilla.index("<header>"):plantilla.index("</header>") + len("</header>")]
sup = io.open(os.path.join(WC, "support.html"), encoding="utf-8").read()
SCRIPT = sup[sup.rindex("<script"):sup.rindex("</script>") + len("</script>")]


def page(title, sub, body, nav="", search=False):
    head = HEAD.replace("Privacy Policy – Word Cloud by TCViz", f"{title} – {html.escape(NAME)}")
    hdr = HEADER.replace("Word Cloud by TCViz", html.escape(NAME)).replace(">Privacy Policy<", f">{html.escape(sub)}<")
    sb = ""
    if search:
        sb = '''<div class="searchbar">
  <div class="searchbox">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    <input id="docsearch" type="search" placeholder="Search the documentation — try &quot;Other&quot;, &quot;target&quot;, &quot;labels&quot;…"
           autocomplete="off" aria-label="Search the documentation">
    <button id="searchclear" type="button" aria-label="Clear search" hidden>&times;</button>
  </div>
  <div id="searchstatus" class="search-status" role="status" aria-live="polite"></div>
</div>
'''
    foot = f'''<footer>
  <div style="margin-bottom:10px;">
    <a href="{BASE}support.html">Documentation</a>
    <a href="{BASE}privacy.html">Privacy Policy</a>
    <a href="{BASE}terms.html">Terms of Use</a>
    <a href="{BASE}changelog.html">Changelog</a>
    <a href="{REPO}/discussions" target="_blank">Discussions</a>
    <a href="{REPO}" target="_blank">GitHub</a>
    <a href="https://tcviz.com" target="_blank">tcviz.com</a>
  </div>
  <p>© 2026 TCViz · {html.escape(NAME)} · <a href="mailto:support@tcviz.com">support@tcviz.com</a></p>
</footer>
'''
    return (head + "<body>\n" + hdr + "\n" + nav + sb + body + foot + (SCRIPT if search else "") + "\n</body>\n</html>\n")


# ── Datos comunes (contrastados con capabilities.json, src/visual.ts y el simulador, 25-11-2026) ────────────────────

FIELDS = [
    ("Category", "Grouping", "Yes — one field", "The field that names the slices: brand, region, channel. A hierarchy gives drilldown."),
    ("Values", "Measure", "Yes — one measure", "The measure the slices share. Its total goes in the center. Negative, zero and blank values are not drawn, because a slice cannot be negative or empty; they are counted in a footnote, negatives with their sum."),
    ("Segment", "Grouping", "No — Pro, one field", "An outer ring that splits every slice by a second field, at the same angle as its slice: family by brand, channel by subchannel."),
    ("Compare with", "Measure", "No — Pro, one measure", "The same measure for another period, usually last year: the change in share (Δ pp) and in value (Δ %) for every category."),
    ("Target", "Measure", "No — Pro, one measure", "The plan or budget of each category: % of target with ✓ ≈ ✕, and status icons on the slices."),
    ("Annotation", "Measure", "No — Pro, one text field", "A comment per category, shown under its row in the data table and in the tooltip. Use a text column set to First."),
    ("Small multiples", "Grouping", "No — Pro, one field", "One donut per value — channel, zone, year — all with the same Other, order and colours."),
    ("Tooltips", "Measure", "No, up to 5", "Extra values in the tooltip of a slice that is one row of data."),
]

FREE_PRO = [
    ("Donut or pie; inner radius, start angle, Space between slices, Border, order by value or by the data", "✓", "✓"),
    ("Data labels inside the slices, all with the same content and the same text size; a label that does not fit is left out, never cut with \"…\"; outside with leader lines when there is no legend or table", "✓", "✓"),
    ("Total in the center; point at, select or focus a slice to see its name, value and percent — with several selected, their sum", "✓", "✓"),
    ("An honest Other: Show at most and Group below %; it opens in the data table, and selecting it selects every item in it", "✓", "✓"),
    ("Percentages that add up to 100 (largest remainder rounding)", "✓", "✓"),
    ("Legend and Data table, independent, each with its own position; the table with value and share columns, header, total row, gridlines and banding; sort by clicking a header", "✓", "✓"),
    ("Summary sentence above the chart; Footnotes for excluded values and incomplete rows", "✓", "✓"),
    ("Scale ring with marks at 25, 50 and 75% or every 10%", "✓", "✓"),
    ("A selectable font in the labels, the center, the legend, the data table, the summary and the footnotes", "✓", "✓"),
    ("Conditional formatting (fx) on the slice colours, the border and the table header background", "✓", "✓"),
    ("Lasso selection, Drilldown, cross-filtering, highlight, bookmarks, multi-visual selection, context menu, keyboard navigation", "✓", "✓"),
    ("Report page tooltips; a tooltip with value and share, and for Other up to ten of its members", "✓", "✓"),
    ("Accessibility card: high contrast, patterns, focus colour and width, minimum text size, reduce motion", "✓", "✓"),
    ("Number format of the measure, Dynamic format strings included; On-object formatting; 12 languages", "✓", "✓"),
    ("Report theme and Classic styles; setup guide inside the visual; start screen in three sizes", "✓", "✓"),
    ("Compare with: Δ pp with a mini bar, Δ %, new and gone, ⚠ where share and value move apart, the change in the labels", "—", "✓"),
    ("Target: % of target with ✓ ≈ ✕, Status on slices, a summary of how many categories miss it", "—", "✓"),
    ("Segment: an outer ring with its own labels, and segment rows in the data table", "—", "✓"),
    ("Annotations: a comment per category in the data table and the tooltip", "—", "✓"),
    ("Small multiples: one donut per value with a shared table of the total, the same size or sized by total", "—", "✓"),
    ("Six collection style templates: Boardroom, Ledger, Editorial, Signal, Aurora, Terrace", "—", "✓"),
]

FORMAT = [
    ("Style template", "Report theme (free), Classic (free) or one of the six collection styles (Pro). Setup guide: turn it back on to see the guide again."),
    ("Slices", "Shape donut or pie; inner radius (20–85%); start angle; Space between slices (0–8 px); Border on/off, width and colour (with fx); order by value or as in the data; Show at most (2–20, default 6) and Group below % (0–20, default 3) for Other, and its colour; Lasso selection on/off. Colors: All slices (fx) and one colour per category."),
    ("Data labels", "Show; content Automatic, Percent, Value, Name, Name and percent, Value and percent, or All; position Automatic, Inside or Outside; Segment labels (Pro); font, size, bold, italic, underline; colour of the labels outside; display units and decimals of value and percent."),
    ("Center", "Show the total; title (blank = the measure name), its font, size and colour; value font, size, bold, colour, display units and decimals."),
    ("Scale ring", "Marks Off, Quarters (25/50/75%) or Every 10%; colour (kept at a contrast of at least 3:1 with the background)."),
    ("Legend", "Position Automatic, Top, Bottom, Left, Right or Off; font, size, bold, italic, underline, colour."),
    ("Data table", "Position Automatic, Right, Left, Bottom or Off; header, its text colour and background (with fx); total row Automatic (on in the pie), On or Off; columns Value, Share %, Change, % of target, Notes and Segment rows; gridlines None, Horizontal or All, their colour and width; row banding; font; display units and decimals."),
    ("Footnotes", "Automatic or Off; font, size and colour."),
    ("Summary", "Automatic (on when Compare with has a field), On or Off; font, size, bold, italic, underline and colour."),
    ("Compare with (Pro)", "Change shown: Δ pp, Δ % or both; Sort by change."),
    ("Target (Pro)", "Met at (default 100%) and Close at (default 90%); Status on slices: misses only, all or off."),
    ("Annotations (Pro)", "Show annotations."),
    ("Small multiples (Pro)", "Columns (0 = automatic); space between panels; title font, size, colour, bold, italic, underline and alignment; panel background and border; Size by total."),
    ("Accessibility", "High contrast Automatic or On; patterns; focus colour and width; minimum text size (8–16 px); reduce motion."),
]

FAQ = [
    ("Why does a slice have no label?",
     "<p>Every label has the same content and the same text size, so they read as one set. When the legend or the data table is "
     "visible, labels always go inside the slices: the text gets smaller down to the minimum, then the content gets shorter "
     "(the change, then the value, then the name; the percent goes last). A slice too thin for even the shortest label is left "
     "without one — never with a cut text — and its figure stays in the table and the tooltip. With the legend and the table off, "
     "a label that does not fit inside goes outside with a leader line.</p>"),
    ("Why do the percentages add up to exactly 100?",
     "<p>Rounded independently, percentages often add up to 99 or 101. The visual rounds by the largest remainder method, so the "
     "labels, the table and the total row always add up to 100 at the decimals you choose. The tooltip uses the same rounding.</p>"),
    ("What is Other, and how do I open it?",
     "<p>Categories beyond <strong>Show at most</strong> (6 by default) or below <strong>Group below %</strong> (3% by default) go into "
     "Other, always the last slice, with its count: \"Other (5)\". In the data table, click <strong>Other (5) ▸</strong> to list its "
     "members with their own values and percentages (→ on the keyboard). Clicking the Other slice filters the page by every item inside "
     "it, not by a label. Set Show at most to 20 and Group below to 0 to draw every category.</p>"),
    ("Why is a value not drawn?",
     "<p>A slice is an angle of a whole, and it cannot be negative or empty. Negative, zero and blank values are left out and counted in "
     "a footnote — \"Excluded: 1 negative (−0.3M), 1 blank\" — so nothing disappears in silence. Percentages use the positive total.</p>"),
    ("What does the center show?",
     "<p>The total of Values, with the measure name as its title (or your own title). Point at a slice, select it or move to it with "
     "the keyboard and the center shows its name, value and percent; with several slices selected, it shows how many and their sum. "
     "The pie has no center. With small multiples each donut shows its own total.</p>"),
    ("Legend or Data table?",
     "<p>They are independent and can show together. The <strong>Legend</strong> is the classic one: swatch and name. The "
     "<strong>Data table</strong> adds the value and the share of every slice, the Pro columns and the footnotes. In Automatic the "
     "table appears when Compare with, Target or Annotation has a field; set its position to Right, Left or Bottom to show it "
     "without them. Click a header to sort the table and the slices; the order is not saved with the report.</p>"),
    ("How do I show the change against last year?",
     "<p>Add the same measure for the prior period to <strong>Compare with</strong> (Pro) — for example with SAMEPERIODLASTYEAR, with "
     "one year in the filter context. The data table adds <strong>Δ pp</strong> (the change in share, in percentage points, with a "
     "mini bar) and <strong>Δ %</strong> (the change in value); its title gives the change of the total. Labels add the Δ pp when it "
     "fits. A category with no prior value says <em>new</em>; one with no current value is listed as <em>gone</em>, never with an "
     "invented change. A ⚠ marks the rows where share and value move in opposite directions — value up but share down because "
     "the total grew faster — with a footnote that names them.</p>"),
    ("Every category says \"new\", or the change does not show. Why?",
     "<p>The Compare with measure returns blank, usually because the time-intelligence function has no single year in context. "
     "Filter the page or the visual to one year, or use a prior-year column in the model.</p>"),
    ("How do targets work?",
     "<p>Add the plan or budget to <strong>Target</strong> (Pro). The table shows the % of target of each category with ✓ (at or above "
     "Met at, 100% by default), ≈ (at or above Close at, 90%) or ✕ (below) — a shape and a colour, so it does not rely on colour. "
     "<strong>Status on slices</strong> puts the icon on the outer edge of the slices that miss the target, of all of them, or of none. "
     "The summary says how many categories miss it.</p>"),
    ("What does Segment do?",
     "<p>Segment (Pro) adds an outer ring: each slice is split by a second field at the same angle — family by brand, channel by "
     "subchannel. The ring has its own labels (Format → Data labels → Segment labels) and the table can list segment rows under each "
     "category. When every category belongs to a single segment (for example Brand in Category and Family in Segment), the ring would "
     "say nothing: it is not drawn and, while you edit, a note suggests swapping the two fields.</p>"),
    ("How do small multiples work?",
     "<p>Add a field to <strong>Small multiples</strong> (Pro). Every donut uses the same Other, order and colours, so you compare like "
     "with like; each one shows its own total in the center and its title above. The data table is shared and shows the total of all "
     "panels (its title says Total); the tooltip of a table row gives the value in each panel. <strong>Size by total</strong> makes "
     "the area of each donut proportional to its total. When the panels would be too small to read, the visual shows the ones that fit "
     "and says how many: \"Showing N of M panels\".</p>"),
    ("What does the Summary sentence say?",
     "<p>The leader and its share, and what the top three add up to; with Pro, the biggest shift against Compare with and how many "
     "categories miss the target. It uses the same rounded figures as the labels and is read by screen readers. Automatic shows it "
     "when Compare with has a field; turn it On or Off in <strong>Format → Summary</strong>.</p>"),
    ("Can I use conditional formatting (fx)?",
     "<p>Yes, in the free version: <strong>Format → Slices → Colors → All slices (fx)</strong> colours every slice by a rule or a "
     "field; a colour set for one category takes precedence. The border colour and the table header background accept fx too.</p>"),
    ("Why does a tooltip measure not show?",
     "<p>Measures in <strong>Tooltips</strong> show when a slice is one row of data. With Segment or Small multiples a slice is made of "
     "several rows, and adding up a measure such as a margin % or an average across them would give a false figure, so it is left out. "
     "Use a report page tooltip instead: it is computed by Power BI for the slice.</p>"),
    ("How many rows can it use?",
     "<p>Power BI sends up to 30,000 combinations of category, segment and panel at a time. When there are more, the visual asks for "
     "further blocks, up to 10 more, and adds them up (checked in Power BI Desktop with 54,662 rows). While it loads, a footnote says "
     "\"Loading more rows\"; if rows are still missing, it says \"Showing 30,000 rows; Other is incomplete\".</p>"),
    ("Can I change the font?",
     "<p>Yes: the labels, the center (title and value), the legend, the data table, the summary, the footnotes and the small multiples "
     "titles each have a font, size and style. Blank uses the font of the style.</p>"),
    ("What is the \"Pro preview\" watermark?",
     "<p>While you edit a report without a licence, Pro features you turn on are drawn working, on your own data, under a watermark that "
     "names them, and Power BI shows its licence notice; small multiples show their first 4 panels. Reading view shows the free chart. "
     "Where Power BI provides no licence information (for example when you are not signed in to Power BI Desktop), the free chart is "
     "shown.</p>"),
    ("How do I get Pro?",
     "<p>On the visual's Microsoft AppSource page, choose <strong>Buy now</strong> (not Install free): 0.99 USD per user per month or "
     "9.99 USD per user per year, with no trial. Licences are per user and managed by Microsoft; restart Power BI Desktop after the "
     "licence is assigned. See <a href=\"https://tcviz.com/licensing.html\">tcviz.com/licensing</a>.</p>"),
    ("How are numbers formatted?",
     "<p>With the number format of the measure from the model, <strong>dynamic format strings</strong> included, in the report's "
     "language. A measure with no format gets thousands separators and no stray decimals. The labels, the center and the table each "
     "have their own display units and decimals.</p>"),
    ("Is my data sent anywhere?",
     "<p>No. The visual makes no network requests, declares no privileges and stores nothing outside your report.</p>"),
]

TROUBLE = [
    ("The visual shows the start screen", "Add a field to Category and a measure to Values."),
    ("A slice has no label", "It is too thin for the shortest label. Make the visual larger, lower the text size, or read the figure in the data table or the tooltip."),
    ("The data table does not show", "In Automatic it appears with a field in Compare with, Target or Annotation. Set Format → Data table → Position to Right, Left or Bottom."),
    ("The outer ring does not show", "Segment is Pro. If every category belongs to one segment, the ring is not drawn: put the broader field in Category and the finer one in Segment."),
    ("The change does not show", "Compare with is Pro and needs a measure for the prior period; check Format → Data table → Change column."),
    ("Annotations do not show", "Annotation expects text: in the field well, set the column to First."),
    ("Small multiples show fewer panels than values", "The panels would be too small to read: the visual says \"Showing N of M panels\". Make it larger or set fewer columns."),
    ("\"Other is incomplete\"", "Power BI did not send every row. Filter the page or use a field with fewer values."),
    ("Clicks do not filter", "The report author has turned interactions off, or the visual is in format mode."),
]


def table(headers, rows):
    th = "".join(f"<th>{html.escape(h)}</th>" for h in headers)
    trs = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f"<table><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table>"


def esc_rows(rows):
    return [tuple(html.escape(c) for c in r) for r in rows]


def illus():
    """Dibujo de 'How to read it' con las cifras del dataset (Litros vs Litros AA y Plan litros, hoja Ventas)."""
    import math
    cuotas = [(0.240, "#118DFF", "24%"), (0.160, "#12239E", "16%"), (0.158, "#E66C37", "16%"), (0.099, "#6B007B", "10%"), (0.343, "#A19F9D", "34%")]
    cx, cy, R, r = 115, 118, 95, 55
    out, a0 = [], 0.0
    for f, col, txt in cuotas:
        a1 = a0 + f * 2 * math.pi
        big = 1 if a1 - a0 > math.pi else 0
        P = lambda a, rr: (cx + rr * math.sin(a), cy - rr * math.cos(a))
        (x0, y0), (x1, y1), (x2, y2), (x3, y3) = P(a0, R), P(a1, R), P(a1, r), P(a0, r)
        out.append(f'<path d="M{x0:.1f},{y0:.1f} A{R},{R} 0 {big},1 {x1:.1f},{y1:.1f} L{x2:.1f},{y2:.1f} A{r},{r} 0 {big},0 {x3:.1f},{y3:.1f} Z" fill="{col}" stroke="#FFFFFF" stroke-width="2"/>')
        tx, ty = P((a0 + a1) / 2, (R + r) / 2)
        out.append(f'<text x="{tx:.0f}" y="{ty + 4:.0f}" text-anchor="middle" fill="{"#252423" if col == "#A19F9D" else "#FFFFFF"}" font-weight="600">{txt}</text>')
        a0 = a1
    filas = [("Aigua Serena", "3.3M", "24%", "+0.8", "≈ 99%"), ("Nord Cola", "2.2M", "16%", "+0.0", "✓ 104%"),
             ("Nord", "2.2M", "16%", "−1.5", "≈ 95%"), ("Fruitia", "1.4M", "10%", "⚠ −0.1", "≈ 99%")]
    cols = [250, 345, 395, 440, 510]
    t = ['<text x="250" y="20" fill="#605E5C">Total +4.1% vs Litros AA</text>']
    for x, h in zip(cols, ["Brand", "Litres", "%", "Δ pp", "% of target"]):
        t.append(f'<text x="{x}" y="42" font-weight="700" fill="#252423">{h}</text>')
    for i, f in enumerate(filas):
        for x, c in zip(cols, f):
            t.append(f'<text x="{x}" y="{62 + 18 * i}">{html.escape(c)}</text>')
    t.append('<text x="250" y="134" fill="#605E5C">Other (6) ▸</text>')
    t.append('<text x="250" y="170" font-weight="700" fill="#252423">Center</text><text x="300" y="170">the total, or what you point at or select</text>')
    t.append('<text x="250" y="190" font-weight="700" fill="#252423">Δ pp (Pro)</text><text x="322" y="190">change in share; ⚠ share and value move apart</text>')
    t.append('<text x="250" y="210" font-weight="700" fill="#252423">✓ ≈ ✕ (Pro)</text><text x="330" y="210">% of target, a shape and a colour</text>')
    return ('<svg viewBox="0 0 640 230" role="img" aria-label="Annotated donut: center total, labels, Other and the data table with the change and the target" '
            'style="width:100%;max-width:640px;display:block;margin:0 auto"><g font-family="Segoe UI, sans-serif" font-size="12" fill="#535146">'
            + "".join(out) + f'<text x="{cx}" y="{cy - 6}" text-anchor="middle" font-size="10">Litros</text>'
            f'<text x="{cx}" y="{cy + 14}" text-anchor="middle" font-size="18" font-weight="700" fill="#252423">13.9M</text>' + "".join(t) + "</g></svg>")


def support():
    nav = '''<nav>
  <a href="#quickstart" class="active">Quick Start</a>
  <a href="#read">How to read it</a>
  <a href="#fields">Field Wells</a>
  <a href="#freepro">Free and Pro</a>
  <a href="#format">Format Pane</a>
  <a href="#interaction">Selection</a>
  <a href="#accessibility">Accessibility</a>
  <a href="#faq">FAQ</a>
  <a href="#trouble">Troubleshooting</a>
  <a href="changelog.html">Changelog</a>
  <a href="#contact">Contact</a>
</nav>
'''
    video = (f'<div class="video-wrap"><iframe src="https://www.youtube.com/embed/{VIDEO.split("v=")[-1]}" title="{html.escape(NAME)} video" '
             f'allowfullscreen></iframe></div>') if VIDEO else ""
    faq = "".join(f'<details><summary>{html.escape(q)}</summary><div class="faq-body">{a}</div></details>' for q, a in FAQ)
    ILLUS = illus()
    body = f'''<div class="wrap">

<div class="verpill">Visual v{VERSION} &nbsp;·&nbsp; docs updated {FECHA} &nbsp;·&nbsp; <a href="changelog.html">what's new</a></div>

<p class="lead">A donut and pie chart that reads at any size: labels inside every slice with the same content and text size and never
cut, percentages that add up to 100, an honest Other you can open, a legend and a data table you can place where you want, and the
total in the center. <strong>Pro</strong> adds the change in share and value against another period, targets with ✓ ≈ ✕, an outer
Segment ring, annotations, small multiples and six style templates.</p>
{video}
<h2 id="quickstart">Quick Start</h2>
<div class="card">
<ol style="padding-left:20px;font-size:14px;color:var(--t2)">
<li>Add <strong>{html.escape(NAME)}</strong> to the page. With no fields it shows a start screen with these steps.</li>
<li>Drag the field that names the slices to <strong>Category</strong> — brand, region, channel.</li>
<li>Drag the measure the slices share to <strong>Values</strong> — sales, litres, units.</li>
<li>While you edit, the setup guide in the corner lists the optional fields and lets you try the styles.</li>
<li>Pro: add last year to <strong>Compare with</strong> and the plan to <strong>Target</strong>; add a second field to <strong>Segment</strong> or <strong>Small multiples</strong>.</li>
</ol>
<p style="font-size:13px;color:var(--t3);margin-top:8px">Sample data used in the screenshots:
<a href="{REPO}/blob/main/DonutChart_Dataset.xlsx" target="_blank">DonutChart_Dataset.xlsx</a> (Begudes Nord, a fictitious drinks company):
sheet <em>Ventas</em> with brand, family, zone, channel, litres, last year's litres and the plan.</p>
<p style="font-size:13px;color:var(--t3)">Three to eight categories read best as a donut. With more, or with a hierarchy, a treemap reads better.</p>
</div>

<h2 id="read">How to read it</h2>
<div class="card">
<figure style="margin:0 0 14px">
{ILLUS}
<figcaption style="font-size:12px;color:var(--t3);text-align:center">Drawing based on the sample data (litres 2026 vs 2025 and plan), not a screenshot; the data table is shortened.</figcaption>
</figure>
<p>The angle of each slice is its share of the total. The labels and the table use the same percentages, rounded so they add up to
100. Other is always last and grey. What is not drawn — negative, zero or blank values, rows Power BI did not send — is said in a
footnote.</p>
</div>

<h2 id="fields">Field Wells</h2>
{table(["Field", "Kind", "Required", "What it does"], [(f"<strong>{a}</strong>", b, c, html.escape(d)) for a, b, c, d in FIELDS])}
<p>Each well takes one field (Tooltips up to five). Rows: up to 30,000 combinations at a time; the visual asks Power BI for up to 10 more
blocks and says it in a footnote if rows are still missing. The limits are the same in Free and Pro.</p>

<h2 id="freepro">Free and Pro</h2>
{table(["Capability", "Free", "Pro"], esc_rows(FREE_PRO))}
<p>Turn on a Pro capability without a licence while editing and it is drawn working under a "Pro preview" watermark that names it.
Reading view shows the free chart. Pro is sold per user on Microsoft AppSource: 0.99 USD per month or 9.99 USD per year, no trial.</p>

<h2 id="format">Format Pane</h2>
{table(["Card", "Settings"], [(f"<strong>{html.escape(a)}</strong>", html.escape(b)) for a, b in FORMAT])}
<p>The Pro cards appear when their field well has a field. <strong>On-object formatting</strong>: in format mode, click the slices, the
labels, the center, the legend, the data table, the scale ring or a small multiples title to format it where it is.</p>

<h2 id="interaction">Selection and interaction</h2>
<div class="card">
<ul>
<li>Click a slice, a legend item or a table row to filter the rest of the page. Ctrl/Cmd + click adds; click the background to clear.</li>
<li><strong>Lasso selection</strong>: drag on the chart to draw a rectangle and select every slice it touches, in every panel; Ctrl or Shift + drag adds. Turn it off in Format → Slices.</li>
<li>Clicking Other filters by every item inside it. In the data table, Other ▸ opens its members, and each one can be selected.</li>
<li>With Segment, the outer ring selects the category and segment pair.</li>
<li>The center shows what you point at or select; with several slices selected, their sum.</li>
<li>Highlight: when another visual filters this one, the highlighted part of each slice is drawn and the rest is dimmed, Other included.</li>
<li>Bookmarks restore the selection. Right-click opens the Power BI context menu. A hierarchy in Category gives <strong>Drilldown</strong>.</li>
<li>Click a header of the data table to sort by it; click again to reverse. The order is not saved with the report.</li>
<li><strong>Report page tooltips</strong> are supported. When the report author turns interactions off, clicks do not filter.</li>
</ul>
</div>

<h2 id="accessibility">Accessibility</h2>
<div class="card">
<ul>
<li>Keyboard: Tab into the visual (one stop); arrows move from slice to slice, with the focus on the slice and on its table row; Home/End jump to the first/last; Enter or Space selects, Ctrl+Enter adds; Esc clears; → on Other opens it and ← closes it; Shift+F10 or the context-menu key opens the menu.</li>
<li>A live region reads the name, value, share and, with Pro, the change and the target of the focused slice; the summary sentence is part of the description.</li>
<li>High contrast: the visual uses the colours of the Windows contrast theme, with every slice outlined and patterns on.</li>
<li>Patterns tell slices apart without relying on colour; targets use ✓ ≈ ✕ and the mix warning uses ⚠, shapes as well as colours.</li>
<li>A minimum text size (8–16 px) applies to every text; focus colour and width can be set.</li>
<li>Reduce motion turns off the fades on hover and selection; they are also off when the system asks for reduced motion.</li>
<li>Text scales with the size of the visual, and the layout adapts: legend and table move, labels shorten, rows fold into "+N more" in very small visuals.</li>
</ul>
</div>

<h2 id="faq">FAQ</h2>
{faq}

<h2 id="trouble">Troubleshooting</h2>
{table(["What you see", "What to do"], esc_rows(TROUBLE))}

<h2 id="contact">Contact</h2>
<div class="contact-box"><div class="icon">✉</div><div>
<h3>Questions, bugs, ideas</h3>
<p>Write to <a href="mailto:support@tcviz.com">support@tcviz.com</a> — a person reads and replies — or open a thread in
<a href="{REPO}/discussions" target="_blank">GitHub Discussions</a>. Bugs: <a href="{REPO}/issues" target="_blank">GitHub Issues</a>.</p>
</div></div>

</div>
'''
    return page("Documentation", "Documentation", body, nav=nav, search=True)


def privacy():
    body = f'''<div class="wrap prose">
<h1>Privacy Policy</h1>
<p><strong>Last updated:</strong> {FECHA} (version {VERSION})</p>
<h2>1. Overview</h2>
<p>{html.escape(NAME)} is a Power BI custom visual developed by TCViz (Tino Callarisa). This policy describes how data is handled when you use it.</p>
<h2>2. Data collection</h2>
<p>The visual <strong>does not collect, transmit or store any data</strong>. Every calculation — the slices, the percentages, the change against Compare with, the
% of target — happens inside Power BI, on the data of your report.</p>
<h2>3. No network access</h2>
<p>The visual declares <strong>no network privileges</strong> (<code>"privileges": []</code>), so Power BI does not let it make any web request.
The start screen has no links, and its icon is bundled inside the visual.</p>
<h2>4. Cookies and storage</h2>
<p>No cookies and no browser storage. Formatting settings are saved in your report by Power BI, like those of any visual. The order you choose by
clicking a table header is kept in memory only.</p>
<h2>5. Licensing</h2>
<p>To know whether you have a Pro licence, the visual asks Microsoft's licensing API in Power BI (<code>IVisualLicenseManager</code>). TCViz receives
no data from this check. See the <a href="https://privacy.microsoft.com/privacystatement">Microsoft Privacy Statement</a>.</p>
<h2>6. Third parties</h2>
<p>No analytics, tracking or advertising.</p>
<h2>7. Contact</h2>
<p><a href="mailto:support@tcviz.com">support@tcviz.com</a></p>
</div>
'''
    return page("Privacy Policy", "Privacy Policy", body)


def terms():
    free = "; ".join(r[0][0].lower() + r[0][1:] for r in FREE_PRO if r[1] == "✓")
    pro = "; ".join(r[0][0].lower() + r[0][1:] for r in FREE_PRO if r[1] == "—")
    body = f'''<div class="wrap prose">
<h1>Terms of Use</h1>
<p><strong>Effective date:</strong> {FECHA} &nbsp;·&nbsp; applies to version {VERSION} and later</p>
<h2>1. Acceptance</h2>
<p>By installing or using {html.escape(NAME)} ("the Visual"), you agree to these Terms of Use. If you do not agree, do not install or use the Visual.</p>
<h2>2. License grant</h2>
<p>TCViz grants you a non-exclusive, non-transferable, revocable license to use the Visual within Microsoft Power BI, subject to these Terms
and any applicable Microsoft AppSource subscription terms.</p>
<p><strong>Free tier:</strong> available to all users at no cost. Includes: {html.escape(free)}.</p>
<p><strong>Pro tier:</strong> available through a Microsoft AppSource subscription, licensed per user. Adds: {html.escape(pro)}.
Without an active licence, Pro features are shown in edit mode only, as a preview marked with a watermark; reading view shows the free chart.
Data limits (one field per well, 30,000 rows per block of data) are the same in both tiers.</p>
<h2>3. Restrictions</h2>
<ul>
<li>Do not reverse-engineer, decompile or disassemble the Visual, except where applicable law permits it.</li>
<li>Do not redistribute, resell, sublicense or transfer the Visual.</li>
<li>Do not remove or alter proprietary notices, branding or watermarks.</li>
<li>Do not use the Visual in breach of applicable laws.</li>
</ul>
<h2>4. Intellectual property</h2>
<p>The Visual, including its source code, design and documentation, is the intellectual property of TCViz. The source code is published on
GitHub for transparency and review; publication does not grant a licence to copy it or to build competing products.</p>
<h2>5. Disclaimer of warranties</h2>
<p>The Visual is provided "as is", without warranty of any kind, express or implied, including merchantability, fitness for a particular
purpose and non-infringement. TCViz does not warrant that the Visual will be error-free or uninterrupted.</p>
<h2>6. Limitation of liability</h2>
<p>To the maximum extent permitted by law, TCViz shall not be liable for any indirect, incidental, special, consequential or punitive damages
arising from the use of, or inability to use, the Visual.</p>
<h2>7. Updates</h2>
<p>TCViz may update the Visual and these Terms. Updated Terms are posted at this address with a new date; continued use means acceptance.</p>
<h2>8. Governing law</h2>
<p>These Terms are governed by the laws of Spain. Any dispute shall be resolved in the courts of Barcelona, Spain.</p>
<h2>9. Contact</h2>
<p><a href="mailto:support@tcviz.com">support@tcviz.com</a></p>
</div>
'''
    return page("Terms of Use", "Terms of Use", body)


def changelog():
    md = io.open(os.path.join(ROOT, "CHANGELOG.md"), encoding="utf-8").read()
    partes = re.split(r"^## ", md, flags=re.M)[1:]
    bloques = []
    for p in partes:
        cab, _, cuerpo = p.partition("\n")
        items = "".join(f"<li>{html.escape(l[2:].strip())}</li>" for l in cuerpo.splitlines() if l.startswith("- "))
        bloques.append(f'<div class="card"><h3>{html.escape(cab.strip())}</h3><ul>{items}</ul></div>')
    body = f'<div class="wrap prose"><h1>Changelog</h1><p>{html.escape(NAME)} · current version {VERSION}</p>{"".join(bloques)}</div>\n'
    return page("Changelog", "Changelog", body)


def main():
    os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
    for nombre, f in (("support.html", support), ("privacy.html", privacy), ("terms.html", terms), ("changelog.html", changelog)):
        io.open(os.path.join(ROOT, "docs", nombre), "w", encoding="utf-8", newline="\n").write(f())
    io.open(os.path.join(ROOT, "docs", "index.html"), "w", encoding="utf-8", newline="\n").write(
        f'<!DOCTYPE html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=support.html"><title>{html.escape(NAME)}</title><a href="support.html">Documentation</a>\n')
    print("docs:", sorted(os.listdir(os.path.join(ROOT, "docs"))))


if __name__ == "__main__":
    main()
