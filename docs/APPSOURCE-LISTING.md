# AppSource Listing — Donut & Pie Chart by TCViz 1.0.0.0

Copy ready to paste into Partner Center, English only. **Editing this file does not change the offer**: every field
is pasted by hand in Partner Center. The description is pasted as HTML: `python C:\tcviz\utillaje\ficha_html.py .`
writes `docs/APPSOURCE-DESCRIPTION.html` — paste its **code**, with the tags visible, into the plain-text Description box.

Limits measured in Partner Center: *Search results summary* 100 characters, *Description* 5,000 characters including
the HTML tags (cut silently), *Certification notes* 2,500 counted with CRLF and **cleared on every resubmission**.

Rules for this listing: no comparison with other marketplace visuals by name; compare only with the native Power BI
donut (only what Tino checked in Power BI Desktop on 24-11-2026: labels cut with "…" at report size, one measure only,
no small multiples). No "certified", no accessibility standard names, no superlatives that cannot be
proven. "Power BI" with capitals. OKviz criteria written as such: "Dynamic format strings", "Conditional formatting (fx)",
"On-object formatting", "Small multiples", "Report page tooltips", "Drilldown", "Lasso selection". Never mention the
organisation licence here (policy 100.4).

---

## Offer name

```
Donut & Pie Chart by TCViz
```

## Search results summary (max 100)

```
Donut and pie chart: labels never cut, shares that add up to 100; share change and targets in Pro.
```

## Keywords (3)

```
donut chart
pie chart
market share
```

- `donut chart` — the name of the type: whoever types it wants one now, and the offer has to be found by it even though
  the native visual competes for it.
- `pie chart` — the same need in the other common word (the visual draws both shapes with one switch). Generic and
  crowded, but a buyer who searches "pie chart" and lands on a donut-only offer leaves; this one is both.
- `market share` — the problem word: whoever searches it has to say who gained or lost share, which is what Compare with
  (Δ pp, ⚠ mix) answers. Inferred, no volume data. Alternative if it does not bring installs: `part to whole`.
  Never `sunburst`: the visual has two rings, not a hierarchy of three or more.

## Description

```
A donut answers one question: what share does each part have. At report size the native Power BI donut often cannot say it: labels are cut with an ellipsis, it takes a single measure, so there is no way to show how a share moved against last year, and it has no small multiples.

Donut & Pie Chart by TCViz keeps the shape you know and fixes the reading. Every slice gets the same label, inside it; a label that does not fit is left out, never cut. Percentages add up to 100. Small categories go into an honest Other you can open. It filters, highlights and formats like any Power BI visual.

BEST FOR
• Brand or product mix: which share each brand holds, and who gained or lost share against last year
• Channel and region reviews: one donut per channel with the same colours and a table of the total
• Plan reviews: each category against its target, with the misses marked on the slices

READ THE SHARES
• Donut or pie; inner radius, start angle, space between slices, border; a scale ring at 25/50/75% or every 10%
• Labels inside every slice with the same content and text size; outside with leader lines when there is no legend or table
• Percentages rounded by largest remainder, so labels, table and total add up to 100
• Other (Show at most, Group below %) opens in the data table (Format → Data table); selecting it filters by every item inside it, up to 1,000 items
• Total in the center, or the name, value and share of the slice you point at; the sum of a multiple selection
• Legend and Data table, independent, each with its position; header, total row, gridlines, banding, sort by header
• Summary sentence above the chart; footnotes count negative, zero and blank values instead of hiding them

PRO
• Compare with: change in share (Δ pp, with a mini bar) and in value (Δ %), new and gone, ⚠ where share and value move in opposite directions; Sort by change
• Target: % of target with ✓ ≈ ✕ (a shape and a colour), and status icons on the slices that miss it
• Segment: an outer ring that splits every slice by a second field, with its own labels
• Small multiples: one donut per value, the same Other, order and colours, a shared table of the total; Size by total
• Annotations per category in the table and the tooltip; six collection style templates

FREE AND PRO
The free version is a complete donut and pie chart: labels, Other, legend, data table, center, summary, footnotes, fonts and every interaction. Pro adds the reading of what moved. While editing without a licence you see a limited preview on your own data: Pro figures for the three largest categories, the first 4 small multiples panels, collection styles whole, under a "Pro preview" watermark; reading view shows the free chart.

WORKS LIKE A NATIVE VISUAL
• Cross-filtering, highlight (Other included), bookmarks, multi-visual selection, Lasso selection, Drilldown, Report page tooltips, context menu
• Number format of the measure, with Dynamic format strings, so labels match the rest of your report
• Conditional formatting (fx): rules that colour each slice by its result; also on the border and the table header
• On-object formatting; a font for every text; Report theme style; start screen and setup guide; 12 languages

ACCESSIBILITY
Keyboard navigation slice by slice (arrows, Home/End) with a screen-reader description, high contrast, patterns, focus colour and width, a minimum text size and reduce motion, all in an Accessibility card. Text scales with the size of the visual.

PRIVACY
The visual makes no network requests and declares no privileges, so Power BI does not let it send anything anywhere.

GETTING STARTED
You need a category field and a measure; for Pro, also last year's measure or a plan.
1. Category: the field that names the slices — brand, region, channel.
2. Values: the measure the slices share — sales, litres, units.
3. With Pro, add last year to Compare with and the plan to Target.

Documentation, FAQ and sample data: https://tinocallarisa-web.github.io/donut-chart/support.html
Questions: https://github.com/tinocallarisa-web/donut-chart/discussions
Support: support@tcviz.com — a person reads and replies
```

## Plan

| Field | Value |
|---|---|
| Plan ID | **`donut-chart-pro`** (exactly this: `PLAN_IDS` in `src/visual.ts`) |
| Plan name | Donut & Pie Chart Pro |
| Price | 0.99 USD per user per month, 9.99 USD per user per year (round local prices with `utillaje/redondear_precios.py`) |
| Trial | None |
| Plan description | see below (lines start with an emoji: the rich editor of the plan drops bold) |

```
⭐ Pro adds the reading of what moved, on top of the complete free donut and pie chart.
📈 Compare with: change in share (Δ pp) and value (Δ %), new and gone, ⚠ where share and value move apart.
✅ Target: % of target with ✓ ≈ ✕ and status icons on the slices.
🍩 Segment ring with its own labels; annotations per category.
🏷️ Small multiples with a shared table of the total; six collection style templates.
```

## Offer setup

| Field | Value |
|---|---|
| Offer ID | `donut-chart-tcviz` (cannot be changed later; the licence is `tino_callarisa.donut-chart-tcviz.donut-chart-pro`) |
| Offer alias | `donut-chart-by-tcviz` (internal; 3-50 lowercase letters, numbers, hyphens and underscores) |
| Categories (max 2) | De una parte a la totalidad (Part-to-whole); Comparación (Comparison) |
| Industries (max 2) | Venta al por menor (Retail); Servicios financieros (Financial services) |
| Video | https://www.youtube.com/watch?v=hyOo-zqMA08 |
| Support / documentation | https://tinocallarisa-web.github.io/donut-chart/support.html + support@tcviz.com |
| Privacy | https://tinocallarisa-web.github.io/donut-chart/privacy.html |
| Terms (EULA) | standard contract as the rest of the portfolio, or https://tinocallarisa-web.github.io/donut-chart/terms.html |
| Logo | `assets/logo_300x300.png` |
| Images (Partner Center takes 5, in this order) | `assets/infographic.png`, `infographic-pro.png`, `Screenshot_1.png` (share change), `Screenshot_2.png` (Segment), `Screenshot_3.png` (small multiples); all 1366x768. `Screenshot_4.png` and `Screenshot_5.png` stay in the repo, not in Partner Center |
| Certification notes | `docs/CERTIFICATION-NOTES-SHORT.txt` |
| Sample .pbix | built with the **production** package only, with this visual only, no `_test` |

The support, privacy and terms URLs answer only after the repository is pushed with GitHub Pages serving `/docs`.
