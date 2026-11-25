# Donut & Pie Chart by TCViz

A Power BI custom visual: a donut and pie chart that reads at any size. Labels inside every slice with the same content and
text size, never cut; percentages that add up to 100; an honest Other you can open; a legend and a data table you place where
you want; the total in the center. Pro adds the change in share and value against another period, targets with ✓ ≈ ✕, an outer
Segment ring, annotations, small multiples and six style templates.

- Documentation: https://tinocallarisa-web.github.io/donut-chart/support.html
- Privacy: https://tinocallarisa-web.github.io/donut-chart/privacy.html · Terms: https://tinocallarisa-web.github.io/donut-chart/terms.html
- Questions: https://github.com/tinocallarisa-web/donut-chart/discussions · support@tcviz.com
- Video: https://www.youtube.com/watch?v=hyOo-zqMA08
- Sample data: `DonutChart_Dataset.xlsx` (Begudes Nord, a fictitious drinks company)

## Build

```
npm ci
node build-test.js            # test package, Pro forced (_test)
node build-test.js --free     # test package, real licence (_testfree)
node build-test.js --capturas # test package, Pro and no build stamp: screenshots for the store and the web
```

Format pane and texts: `python tools/formato.py`, `python tools/i18n.py`.
Simulator (checks and captures): `node build-test.js --free` then `python tools/simulador/harness.py`.
Store images: `node build-test.js --capturas`, `python tools/simulador/ficha.py`, `python tools/gen_infographic.py`.
Documentation: `python tools/gen_docs.py`; description for Partner Center: `python C:\tcviz\utillaje\ficha_html.py .`.

© 2026 TCViz. Source published for transparency and review; see the Terms of Use.
