# Website product page — Donut & Pie Chart by TCViz 1.0.0.0

Entry for `C:\tcviz\web\src\data.jsx` (array `PRODUCTS`, after `treemap`). **Not published yet** (publishing on the web is a
separate step). Publish it before submitting: the reviewer looks for the product on tcviz.com. `pending: true` until
Microsoft publishes the offer; the AppSource button works then. Then: icon `logos/icons/donut-chart.png` (from
`assets/logo_300x300.png`), screenshot and infographic with `node scripts/screenshots.js`, the guide is generated from this
entry by `scripts/guides.js`, `node scripts/build.js`.

**Pending:** `youtube` — Tino gives the URL when the video is up; only the canonical form `https://www.youtube.com/watch?v=<id>`.
Until then the field is an empty string.

Price: 0.99 USD per user per month, 9.99 per year, no trial (plan `donut-chart-pro`). The entry is also the source of
`tools/gen_infographic.py`: correct the entry, never the image.

```js
  {
    id: "donut-chart", pending: true,
    docs: "https://tinocallarisa-web.github.io/donut-chart/support.html",
    certified: false,
    screenshot: "/logos/screenshots/donut-chart.png?v=1",
    infographic: "/logos/screenshots/donut-chart-infographic.png?v=1",
    appSource: "https://marketplace.microsoft.com/en-us/product/tino_callarisa.donut-chart-tcviz?tab=Overview",
    youtube: "",
    guide: "/guides/donut-chart.html",
    name: "Donut & Pie Chart by TCViz",
    icon: "/logos/icons/donut-chart.png",
    tagline: "Donut and pie chart for Power BI: labels that never cut, shares that add up to 100, the change in share vs last year.",
    seoTitle: "Donut & Pie Chart for Power BI: Data Table, Share Change, Targets | tcviz",
    seoDescription: "A Power BI donut and pie chart that reads at any size: labels never cut, percentages that add up to 100, an honest Other and a data table. Share change vs last year and targets in Pro.",
    category: "Part-to-whole",
    price: 0.99,
    noTrial: true,
    version: "1.0.0.0",
    updated: "2026-11-25",
    downloads: 0,
    rating: 0,
    tags: ["Donut chart", "Pie chart", "Part to whole", "Market share"],
    summary: "A donut answers one question — what share does each part have — and the native one often fails at it: labels cut with an ellipsis at report size, one measure only, so no way to see how a share moved against last year. Donut & Pie Chart by TCViz writes the same label inside every slice and leaves out the one that does not fit instead of cutting it, rounds the percentages so they add up to 100, groups the small categories into an honest Other you can open in the data table, and puts the total in the center. Pro adds the change in share and value against last year, targets with ✓ ≈ ✕, an outer Segment ring, annotations, small multiples and six style templates.",
    features: [
      { id: "F01", name: "Labels never cut", desc: "Every label inside its slice with the same content and text size; a label that does not fit is left out, never cut.", free: true, pro: true },
      { id: "F02", name: "Shares that add up to 100", desc: "Largest remainder rounding in the labels, the table and the total row.", free: true, pro: true },
      { id: "F03", name: "Honest Other", desc: "Show at most and Group below %; Other opens in the data table and selects every item inside it, up to 1,000 items.", free: true, pro: true },
      { id: "F04", name: "Legend and data table", desc: "Independent, each with its position; value and share columns, header, total row, gridlines, banding, sort by header.", free: true, pro: true },
      { id: "F05", name: "Center and summary", desc: "The total in the center, or the sum of what you select; a summary sentence and footnotes.", free: true, pro: true },
      { id: "F06", name: "Lasso and drilldown", desc: "Lasso selection, drilldown, cross-filtering, highlight, bookmarks, report page tooltips.", free: true, pro: true },
      { id: "F07", name: "Conditional formatting (fx)", desc: "fx on the slice colours, the border and the table header.", free: true, pro: true },
      { id: "F08", name: "Accessibility", desc: "Keyboard, screen reader, high contrast, patterns, focus, minimum text size, reduce motion.", free: true, pro: true },
      { id: "F09", name: "Number format and 12 languages", desc: "Dynamic format strings, a selectable font in every text, on-object formatting, 12 languages.", free: true, pro: true },
      { id: "F10", name: "Share change vs last year", desc: "Δ pp with a mini bar, Δ %, new and gone, ⚠ where share and value move apart.", free: false, pro: true },
      { id: "F11", name: "Targets", desc: "% of target with ✓ ≈ ✕ and status icons on the slices.", free: false, pro: true },
      { id: "F12", name: "Segment ring", desc: "An outer ring that splits each slice by a second field, with its own labels.", free: false, pro: true },
      { id: "F13", name: "Small multiples", desc: "One donut per value with a shared table of the total.", free: false, pro: true },
      { id: "F14", name: "Annotations and styles", desc: "A comment per category; Boardroom, Ledger, Editorial, Signal, Aurora and Terrace.", free: false, pro: true }
    ],
    dataRoles: [
      { role: "Category", kind: "Grouping", required: true, desc: "Brand, region, channel: one slice per value." },
      { role: "Values", kind: "Measure", required: true, desc: "Sales, litres or units: the share of each slice." },
      { role: "Compare with (Pro)", kind: "Measure", required: false, desc: "Last year: change in share and value." },
      { role: "Target (Pro)", kind: "Measure", required: false, desc: "Plan or budget: % of target with ✓ ≈ ✕." },
      { role: "Segment (Pro)", kind: "Grouping", required: false, desc: "Outer ring: each slice split by a second field." },
      { role: "Small multiples (Pro)", kind: "Grouping", required: false, desc: "One donut per value." },
      { role: "Annotation (Pro)", kind: "Measure", required: false, desc: "A comment per category." },
      { role: "Tooltips", kind: "Measure", required: false, desc: "Up to 5 extra values in the tooltip." }
    ],
    quickStart: [
      "Install Donut & Pie Chart by TCViz from Microsoft AppSource",
      "Drag the field that names the slices into Category",
      "Drag the measure the slices share into Values",
      "With Pro, add last year to Compare with and the plan to Target"
    ],
    freemium: {
      free: "A complete donut and pie chart: labels inside every slice that are never cut, percentages that add up to 100, an honest Other that opens in the data table, the total in the center, legend and data table with their own positions, summary sentence, footnotes, scale ring, fonts, conditional formatting (fx), lasso, drilldown, filtering, highlight, bookmarks, keyboard, high contrast and 12 languages.",
      pro: [
        "Change in share and value vs last year",
        "⚠ where share and value move apart",
        "Targets with ✓ ≈ ✕ on table and slices",
        "Segment ring with its own labels",
        "Small multiples with a table of the total",
        "Annotations per category",
        "Six collection styles"
      ]
    },
    formattingPane: [
      { group: "Style", items: "Report theme, Classic; Boardroom, Ledger, Editorial, Signal, Aurora, Terrace (Pro); setup guide" },
      { group: "Slices", items: "Donut or pie, inner radius, start angle, space between slices, border, order, Other, lasso, colours with fx" },
      { group: "Data labels", items: "Content, position, segment labels, font, display units and decimals" },
      { group: "Center and scale ring", items: "Title, value font and size, units; marks at quarters or every 10%" },
      { group: "Legend and data table", items: "Positions, columns, header, total row, gridlines, banding, font, units" },
      { group: "Summary and footnotes", items: "Automatic, on or off; font, size and colour" },
      { group: "Compare with and Target (Pro)", items: "Δ pp, Δ % or both, sort by change; met at, close at, status on slices" },
      { group: "Small multiples (Pro)", items: "Columns, gap, title font and alignment, background, border, size by total" },
      { group: "Accessibility", items: "High contrast, patterns, focus, minimum text size, reduce motion" }
    ]
  },
```
