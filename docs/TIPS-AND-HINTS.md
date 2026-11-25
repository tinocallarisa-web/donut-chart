# Donut & Pie Chart by TCViz — Tips & Hints (1.0.0.0)

A donut and pie chart that reads at any size: the same label inside every slice and never cut, percentages that add up to
100, an honest Other you can open, and a legend and a data table you place where you want. This page is the short version
of everything worth knowing. Full documentation, with search: <https://tinocallarisa-web.github.io/donut-chart/support.html>

## Quick start

1. Category: the field that names the slices — brand, region, channel.
2. Values: the measure the slices share — sales, litres, units.
3. Pro: last year in Compare with, the plan in Target.

Three to eight categories read best as a donut. With more, or with a hierarchy, a treemap reads better; with more than 20
categories and little weight in the named slices, a note says so while you edit.

## Field wells

| Well | Limit | What it does |
|---|---|---|
| Category | 1 field | One slice per value. A hierarchy gives drilldown. |
| Values | 1 measure | The share of each slice; its total goes in the center. Negative, zero and blank values are counted in a footnote, not drawn. |
| Segment (Pro) | 1 field | An outer ring that splits every slice by a second field. |
| Compare with (Pro) | 1 measure | Last year: Δ pp and Δ % for every category. |
| Target (Pro) | 1 measure | The plan: % of target with ✓ ≈ ✕. |
| Annotation (Pro) | 1 text field | A comment per category. Set the column to First. |
| Small multiples (Pro) | 1 field | One donut per value. |
| Tooltips | up to 5 | Extra values when a slice is one row; report page tooltips work too. |

Rows: up to 30,000 at a time; the visual asks Power BI for up to 10 more blocks. If rows are still missing, a footnote says
"Other is incomplete". The limits are the same in Free and Pro.

## Tips

- **A slice has no label?** It is too thin even for the percent. All labels share the same content and size, so the visual
  shortens them all (change, then value, then name; the percent goes last) and leaves out the ones that still do not fit.
  The figure is in the data table and the tooltip.
- **Labels outside.** They go outside with leader lines only when the legend and the data table are off: then the label is
  the only thing that names the slice.
- **Show the data table without Pro.** In Automatic it appears with Compare with, Target or Annotation. Set Format → Data
  table → Position to Right, Left or Bottom to show it with just Values.
- **Open Other.** In the data table, click Other (5) ▸ (→ on the keyboard). The five largest categories always keep their
  own slice. Show at most 20 and Group below 0 draw every category.
- **Center.** Point at a slice to read its name, value and share; select several to read their sum.
- **Sort.** Click a header of the data table; click again to reverse. Not saved with the report.
- **⚠ in the change column.** Value and share moved in opposite directions: value up but share down because the total grew
  faster. The footnote names the categories.
- **new / gone.** No value in Compare with / no value now. Never an invented change.
- **Segment says to swap the fields.** Every category belongs to one segment: put the broader field in Category.
- **Small multiples.** Same Other, order and colours in every panel; the table is the total. Size by total makes each donut
  proportional to its total. Too many panels: "Showing N of M panels".
- **A tooltip measure does not show.** With Segment or Small multiples a slice is several rows and the measure is not
  summed (a margin % summed would be false). Use a report page tooltip.
- **Large selections.** With Segment or Small multiples, a selection above 5,000 rows is drawn only inside the visual, with a
  note, so Power BI does not slow down.
- **Fonts.** Labels, center, legend, data table, summary, footnotes and small multiples titles each have a font.
- **Conditional formatting (fx).** Format → Slices → Colors → All slices (fx); also the border and the table header.
- **Styles.** Report theme and Classic are free; Boardroom, Ledger, Editorial, Signal, Aurora and Terrace are Pro.
- **Accessibility.** Minimum text size, patterns, high contrast, focus colour and width, reduce motion: Format → Accessibility.

## Free and Pro

Free is a complete chart. Pro adds Compare with, Target, Segment, Annotations, Small multiples and the six collection styles:
0.99 USD per user per month or 9.99 per year, no trial. Without a licence, Pro features are drawn under a "Pro preview"
watermark while you edit; reading view shows the free chart.

## Help

support@tcviz.com — a person reads and replies · <https://github.com/tinocallarisa-web/donut-chart/discussions>
