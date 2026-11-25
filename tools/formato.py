# -*- coding: utf-8 -*-
"""Tabla ÚNICA del panel de formato de Donut & Pie Chart by TCViz.

De aquí salen, sin copiar a mano:
  - capabilities.json → "dataRoles" (nombres y claves; el mapeo NO se toca: validado en Desktop el 24-11) y "objects",
  - src/formatSpec.ts → la tabla que lee el visual (valores por defecto, panel y on-object),
  - stringResources/en-US → las claves Role_/Obj_/Prop_/Enum_ en inglés.
Ejecutar desde la raíz:  python tools/formato.py   (tools/i18n.py lo llama antes de traducir)

Regla de la cartera: los nombres internos (objeto y propiedad) no se renombran nunca una vez publicados.
Los objetos `legend` (la leyenda-tabla) y `accessibility` se llaman así a propósito: OKviz los detecta por el nombre.
"""
import io, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (nombre interno, clave, nombre visible, descripción) — en el orden en que salen en el panel de campos.
ROLES = [
    ("category", "Role_Category", "Category", "One slice per value of this field."),
    ("values", "Role_Values", "Values", "The measure the slices share."),
    ("segment", "Role_Segment", "Segment (Pro)", "Outer ring: each slice split by this field."),
    ("compare", "Role_Compare", "Compare with (Pro)", "Prior period or plan: change of share and value."),
    ("target", "Role_Target", "Target (Pro)", "Target per slice."),
    ("annotation", "Role_Annotation", "Annotation (Pro)", "Text measure shown as a note under its row."),
    ("facet", "Role_Facet", "Small multiples (Pro)", "One donut per value of this field."),
    ("tooltips", "Role_Tooltips", "Tooltips", "Extra measures in the tooltip."),
]

# Formato de números como el nativo (mismos nombres que Power BI). Valor decimal vacío = automático.
UNITS = {"items": [("auto", "Auto"), ("none", "None"), ("thousands", "Thousands"), ("millions", "Millions"),
                   ("billions", "Billions"), ("trillions", "Trillions")]}
NUM_FORMAT = [
    ("displayUnits", "Display units", "enum", "auto", UNITS),
    ("valueDecimals", "Value decimal places", "num", None, {"min": 0, "max": 9}),
]
PCT_FORMAT = [("percentDecimals", "Percentage decimal places", "num", 0, {"min": 0, "max": 4})]

TEMPLATES = [("report", "Report theme"), ("classic", "Classic"),
             ("boardroom", "Boardroom (Pro)"), ("ledger", "Ledger (Pro)"), ("editorial", "Editorial (Pro)"),
             ("signal", "Signal (Pro)"), ("aurora", "Aurora (Pro)"), ("terrace", "Terrace (Pro)")]

# (propiedad, etiqueta, tipo, por defecto, extra)   tipo: bool | num | fill | enum | text
OBJECTS = [
    ("style", "Style template", [
        ("template", "Template", "enum", "report", {"items": TEMPLATES}),
        ("guide", "Setup guide", "bool", True, {}),
    ]),
    ("slices", "Slices", [
        ("shape", "Shape", "enum", "donut", {"items": [("donut", "Donut"), ("pie", "Pie")]}),
        ("innerRadius", "Inner radius (%)", "num", 58, {"min": 20, "max": 85}),
        ("startAngle", "Start angle (°)", "num", 0, {"min": 0, "max": 359}),
        # Space between slices: hueco real entre sectores y entre los dos anillos. Border (FC.PROP04): trazo alrededor de cada
        # sector, apagado por defecto y compatible con el hueco; ancho y color (fx; vacío = fondo) solo con él encendido.
        ("gap", "Space between slices", "num", 1, {"min": 0, "max": 8}),
        ("border", "Border", "bool", False, {}),
        ("borderWidth", "Border width", "num", 1, {"min": 1, "max": 8}),
        ("borderColor", "Border color", "fill", "", {}),
        ("sort", "Order", "enum", "valueDesc", {"items": [("valueDesc", "By value"), ("data", "Data order")]}),
        ("maxSlices", "Show at most", "num", 6, {"min": 2, "max": 20}),
        ("groupBelow", "Group below (%)", "num", 3, {"min": 0, "max": 20}),
        ("otherColor", "Other color", "fill", "#A19F9D", {}),
        # Lasso selection (FC.PROP07): arrastrar sobre el gráfico selecciona los sectores que toca; Ctrl suma.
        ("lasso", "Lasso selection", "bool", True, {}),
    ]),
    # Color por categoría (gratis): se guarda con el selector de la categoría; "All slices (fx)" con selector comodín.
    # El panel lo construye el visual dentro de la tarjeta Slices. Sin tarjeta propia en PANE.
    ("dataColors", "Slice colors", [
        ("fill", "Color", "fill", "", {}),
        ("rule", "All slices (fx)", "fill", "", {}),
    ]),
    ("labels", "Data labels", [
        ("show", "Show data labels", "bool", True, {}),
        ("content", "Content", "enum", "auto",
         {"items": [("auto", "Automatic"), ("percent", "Percent"), ("value", "Value"), ("name", "Name"),
                    ("namePercent", "Name and percent"), ("valuePercent", "Value and percent"), ("all", "All")]}),
        ("position", "Position", "enum", "auto", {"items": [("auto", "Inside, then outside"), ("inside", "Inside only"), ("outside", "Outside")]}),
        # Anillo exterior (Segment): Automatic = nombre + % del total si cabe en todos los que llevan nombre; si no, nombre.
        ("segment", "Segment labels", "enum", "auto", {"items": [("auto", "Automatic"), ("name", "Name"), ("namePercent", "Name and percent"), ("off", "Off")]}),
        ("fontSize", "Text size", "num", 10, {"min": 6, "max": 24}),
        ("fontFamily", "Font", "font", "", {}),
        ("bold", "Bold", "bool", False, {}),
        ("italic", "Italic", "bool", False, {}),
        ("underline", "Underline", "bool", False, {}),
        ("color", "Text color (outside)", "fill", "#252423", {}),
    ] + NUM_FORMAT + PCT_FORMAT),
    ("center", "Center", [
        # Dos grupos en la tarjeta: Title (texto, fuente y tamaño, color) y Value (fuente, tamaño y negrita, color, formato).
        # Fuente vacía = la del estilo activo. El título encoge con el valor en la misma proporción.
        ("show", "Show total in the center", "bool", True, {}),
        ("title", "Title (blank = measure name)", "text", "", {"group": "title"}),
        ("titleFontFamily", "Title font", "font", "", {"group": "title"}),
        ("titleFontSize", "Title size", "num", 9, {"min": 6, "max": 32, "group": "title"}),
        ("titleColor", "Title color", "fill", "", {"group": "title"}),
        ("valueFontFamily", "Value font", "font", "", {"group": "value"}),
        ("fontSize", "Value size", "num", 20, {"min": 8, "max": 48, "group": "value"}),
        ("valueBold", "Bold value", "bool", True, {"group": "value"}),
        ("color", "Value color", "fill", "#252423", {"group": "value"}),
    ] + [(p, l, t, d, dict(x, group="value")) for p, l, t, d, x in NUM_FORMAT]),
    ("scaleRing", "Scale ring", [
        ("mode", "Marks", "enum", "quarters", {"items": [("off", "Off"), ("quarters", "Quarters (25 %)"), ("tens", "Every 10 %")]}),
        ("color", "Color", "fill", "#605E5C", {}),
    ]),
    # Leyenda clásica (nombre interno `legend`, lo detecta OKviz): muestra + nombre (y los segmentos agrupados).
    # Automatic: arriba en línea si cabe en dos líneas; si no, al lado en un visual ancho o abajo en uno alto.
    ("legend", "Legend", [
        ("position", "Position", "enum", "auto", {"items": [("auto", "Automatic"), ("top", "Top"), ("bottom", "Bottom"),
                                                             ("left", "Left"), ("right", "Right"), ("off", "Off")]}),
        ("fontSize", "Text size", "num", 10, {"min": 6, "max": 24}),
        ("fontFamily", "Font", "font", "", {}),
        ("bold", "Bold", "bool", False, {}),
        ("italic", "Italic", "bool", False, {}),
        ("underline", "Underline", "bool", False, {}),
        ("color", "Text color", "fill", "#252423", {}),
    ]),
    # Tabla de datos, independiente de la leyenda (Tino, 25-11). Automatic = encendida si hay Compare, Target o Annotation
    # en los pozos. Nunca una tabla sin columnas de cifras. Cada columna Pro sale en el panel solo con su pozo puesto.
    ("dataTable", "Data table", [
        ("position", "Position", "enum", "auto", {"items": [("auto", "Automatic"), ("right", "Right"), ("left", "Left"),
                                                             ("bottom", "Bottom"), ("off", "Off")]}),
        ("header", "Show header", "bool", True, {}),
        # Cabecera en negrita con línea inferior al 35 % del texto; color de texto y fondo opcionales (fondo con fx).
        ("headerColor", "Header text color", "fill", "", {}),
        ("headerBackground", "Header background", "fill", "", {}),
        ("totalRow", "Show total row", "enum", "auto", {"items": [("auto", "Automatic (pie)"), ("on", "On"), ("off", "Off")]}),
        ("colValue", "Value column", "bool", True, {}),
        ("colShare", "Share % column", "bool", True, {}),
        ("colChange", "Change column", "bool", True, {}),
        ("colTarget", "% of target column", "bool", True, {}),
        ("colNote", "Notes", "bool", True, {}),
        ("segRows", "Segment rows", "bool", False, {}),
        # Rejilla: vacío = color del texto al 18 %.
        ("gridlines", "Gridlines", "enum", "horizontal", {"items": [("none", "None"), ("horizontal", "Horizontal"), ("all", "All")]}),
        ("gridColor", "Gridline color", "fill", "", {}),
        ("gridWidth", "Gridline width", "num", 1, {"min": 1, "max": 4}),
        ("banding", "Row banding", "bool", False, {}),
        ("fontSize", "Text size", "num", 10, {"min": 6, "max": 24}),
        ("fontFamily", "Font", "font", "", {}),
        ("bold", "Bold", "bool", False, {}),
        ("italic", "Italic", "bool", False, {}),
        ("underline", "Underline", "bool", False, {}),
        ("color", "Text color", "fill", "#252423", {}),
    ] + NUM_FORMAT + PCT_FORMAT),
    # Notas al pie: Automatic = solo las que explican algo visible (ver notesList en visual.ts); Off = ninguna.
    ("footnotes", "Footnotes", [
        ("show", "Show footnotes", "enum", "auto", {"items": [("auto", "Automatic"), ("off", "Off")]}),
        ("fontSize", "Text size", "num", 9, {"min": 6, "max": 24}),
        ("fontFamily", "Font", "font", "", {}),
        ("color", "Text color", "fill", "", {}),
    ]),
    # Frase de resumen arriba del gráfico. Automatic = encendida con Compare en los pozos. Cuotas: gratis; cambio y
    # objetivo: Pro (como sus columnas).
    ("summary", "Summary", [
        ("show", "Show summary", "enum", "auto", {"items": [("auto", "Automatic (with Compare)"), ("on", "On"), ("off", "Off")]}),
        ("fontSize", "Text size", "num", 9, {"min": 7, "max": 24}),
        ("fontFamily", "Font", "font", "", {}),
        ("bold", "Bold", "bool", False, {}),
        ("italic", "Italic", "bool", False, {}),
        ("underline", "Underline", "bool", False, {}),
        ("color", "Text color", "fill", "", {}),
    ]),
    # Pro (bloque 2): existen en el panel con su campo puesto; en el bloque 1 aún no dibujan nada.
    ("compare", "Compare with (Pro)", [
        ("changeShown", "Change shown", "enum", "both", {"items": [("pp", "Share points"), ("value", "Value"), ("both", "Both")]}),
        ("sortByChange", "Sort by change", "bool", False, {}),
    ]),
    ("target", "Target (Pro)", [
        ("metAt", "Met at (%)", "num", 100, {"min": 1, "max": 1000}),
        ("closeAt", "Close at (%)", "num", 90, {"min": 1, "max": 1000}),
        # Iconos en el borde de los sectores: por defecto solo los que no llegan (✕); el estado completo, en la tabla.
        ("statusOnSlices", "Status on slices", "enum", "misses",
         {"items": [("misses", "Misses only"), ("all", "All"), ("off", "Off")]}),
    ]),
    ("annotations", "Annotations (Pro)", [
        ("show", "Show annotations", "bool", True, {}),
    ]),
    # Las 9 opciones comunes (nombres internos de Line Chart) + Size by total.
    ("smallMultiples", "Small multiples (Pro)", [
        ("columns", "Columns (0 = automatic)", "num", 0, {"min": 0, "max": 12}),
        ("gap", "Space between panels", "num", 8, {"min": 0, "max": 40}),
        ("titleFontSize", "Title size", "num", 10, {"min": 7, "max": 24}),
        ("titleColor", "Title color", "fill", "#252423", {}),
        ("titleFontFamily", "Title font", "font", "", {}),
        ("titleBold", "Bold title", "bool", True, {}),
        ("titleItalic", "Italic title", "bool", False, {}),
        ("titleUnderline", "Underline title", "bool", False, {}),
        ("titleAlign", "Title alignment", "enum", "center", {"items": [("left", "Left"), ("center", "Center")]}),
        ("background", "Panel background", "fill", "", {}),
        ("border", "Panel border", "bool", False, {}),
        ("borderColor", "Panel border color", "fill", "#E1DFDD", {}),
        ("sizeByTotal", "Size by total", "bool", False, {}),
    ]),
    ("accessibility", "Accessibility", [
        ("highContrast", "High contrast", "enum", "auto", {"items": [("auto", "Automatic"), ("on", "On")]}),
        ("patterns", "Patterns", "bool", False, {}),
        ("focusColor", "Focus color", "fill", "", {}),
        ("focusWidth", "Focus width", "num", 2, {"min": 1, "max": 6}),
        ("minFontSize", "Minimum text size", "num", 8, {"min": 8, "max": 16}),
        ("reduceMotion", "Reduce motion", "bool", False, {}),
    ]),
]

# Controles de fuente nativos (FontControl): (uid, etiqueta, familia, tamaño, negrita, cursiva, subrayado) por objeto.
# El panel junta esas propiedades en un solo control, en el sitio de la familia.
FONTS = {
    "labels": [("font", "Font", "fontFamily", "fontSize", "bold", "italic", "underline")],
    "center": [("titleFont", "Title font", "titleFontFamily", "titleFontSize", None, None, None),
               ("valueFont", "Value font", "valueFontFamily", "fontSize", "valueBold", None, None)],
    "legend": [("font", "Font", "fontFamily", "fontSize", "bold", "italic", "underline")],
    "dataTable": [("font", "Font", "fontFamily", "fontSize", "bold", "italic", "underline")],
    "summary": [("font", "Font", "fontFamily", "fontSize", "bold", "italic", "underline")],
    "footnotes": [("font", "Font", "fontFamily", "fontSize", None, None, None)],
    "smallMultiples": [("titleFont", "Title font", "titleFontFamily", "titleFontSize", "titleBold", "titleItalic", "titleUnderline")],
}
GROUPS = {"title": "Title", "value": "Value"}

# Orden común de la colección: Style template, tarjetas propias, leyenda, Pro, small multiples, accesibilidad.
PANE = [
    ("style", "Style template", [("style", None, None)]),
    ("slices", "Slices", [("slices", None, None)]),
    ("labels", "Data labels", [("labels", None, "show")]),
    ("center", "Center", [("center", None, "show")]),
    ("scaleRing", "Scale ring", [("scaleRing", None, None)]),
    ("legend", "Legend", [("legend", None, None)]),
    ("dataTable", "Data table", [("dataTable", None, None)]),
    ("footnotes", "Footnotes", [("footnotes", None, None)]),
    ("summary", "Summary", [("summary", None, None)]),
    ("compare", "Compare with (Pro)", [("compare", None, None)]),
    ("target", "Target (Pro)", [("target", None, None)]),
    ("annotations", "Annotations (Pro)", [("annotations", None, "show")]),
    ("smallMultiples", "Small multiples (Pro)", [("smallMultiples", None, None)]),
    ("accessibility", "Accessibility", [("accessibility", None, None)]),
]


def cap_type(t):
    return {"bool": {"bool": True}, "num": {"numeric": True}, "fill": {"fill": {"solid": {"color": True}}},
            "text": {"text": True}, "font": {"formatting": {"fontFamily": True}}}.get(t)


def generar():
    caps_p = os.path.join(ROOT, "capabilities.json")
    caps = json.load(io.open(caps_p, encoding="utf-8"))
    en = {}
    por_nombre = {r["name"]: r for r in caps["dataRoles"]}
    roles = []
    for name, key, label, desc in ROLES:
        r = por_nombre[name]
        r.update({"displayName": label, "displayNameKey": key, "description": desc, "descriptionKey": key + "_Desc"})
        en[key] = label
        en[key + "_Desc"] = desc
        roles.append(r)
    caps["dataRoles"] = roles
    objs = {"general": {"properties": {"formatString": {"type": {"formatting": {"formatString": True}}}}}}
    ts_objs = {}
    for name, label, props in OBJECTS:
        okey = "Obj_" + name
        en[okey] = label
        cp = {}
        tp = []
        for p, plabel, t, d, extra in props:
            pkey = "Prop_%s_%s" % (name, p)
            en[pkey] = plabel
            if t == "enum":
                items = []
                for v, vl in extra["items"]:
                    ekey = "Enum_%s_%s" % (p, v)
                    en[ekey] = vl
                    items.append({"value": v, "displayName": vl, "displayNameKey": ekey})
                cp[p] = {"displayName": plabel, "displayNameKey": pkey, "type": {"enumeration": items}}
            else:
                cp[p] = {"displayName": plabel, "displayNameKey": pkey, "type": cap_type(t)}
            spec = {"name": p, "type": t, "def": d, "key": pkey, "label": plabel}
            if t == "enum":
                spec["items"] = [[v, "Enum_%s_%s" % (p, v), vl] for v, vl in extra["items"]]
            for k in ("min", "max", "group"):
                if k in extra:
                    spec[k] = extra[k]
            tp.append(spec)
        objs[name] = {"displayName": label, "displayNameKey": okey, "properties": cp}
        ts_objs[name] = {"name": name, "key": okey, "label": label, "props": tp}
    caps["objects"] = objs
    caps["supportsOnObjectFormatting"] = True
    caps["enablePointerEventsFormatMode"] = True
    io.open(caps_p, "w", encoding="utf-8", newline="\n").write(json.dumps(caps, indent=2, ensure_ascii=False) + "\n")

    fonts = {}
    for obj, lst in FONTS.items():
        fonts[obj] = []
        for uid, lab, fam, size, bold, ital, und in lst:
            key = "Font_%s_%s" % (obj, uid)
            en[key] = lab
            fonts[obj].append({"uid": uid, "key": key, "label": lab, "family": fam, "size": size, "bold": bold, "italic": ital, "underline": und})
    for g, lab in GROUPS.items():
        en["Grp_" + g] = lab
    pane = []
    for uid, label, groups in PANE:
        ckey = "Obj_" + uid
        en.setdefault(ckey, label)
        gs = []
        for obj, glabel, toggle in groups:
            g = {"obj": obj, "toggle": toggle}
            if glabel:
                g["key"] = "Grp_" + obj
                g["label"] = glabel
                en[g["key"]] = glabel
            gs.append(g)
        pane.append({"uid": uid, "key": ckey, "label": label, "groups": gs})

    ts = ["/**",
          " * Tabla del panel de formato. Generado por tools/formato.py: no editar a mano.",
          " * Los nombres internos (objeto.propiedad) no se renombran nunca: los informes guardados dejarían de leerlos.",
          " */",
          "export type PropType = \"bool\" | \"num\" | \"fill\" | \"enum\" | \"text\" | \"font\";",
          "export interface PropSpec { name: string; type: PropType; def: string | number | boolean | null; key: string; label: string;",
          "    items?: [string, string, string][]; min?: number; max?: number; group?: string; }",
          "export interface FontSpec { uid: string; key: string; label: string; family: string; size: string; bold: string | null; italic: string | null; underline: string | null; }",
          "export interface ObjSpec { name: string; key: string; label: string; props: PropSpec[]; }",
          "export interface GroupSpec { obj: string; toggle: string | null; key?: string; label?: string; }",
          "export interface CardSpec { uid: string; key: string; label: string; groups: GroupSpec[]; }",
          "export const OBJECTS: Record<string, ObjSpec> = " + json.dumps(ts_objs, ensure_ascii=False, indent=4) + ";",
          "export const PANE: CardSpec[] = " + json.dumps(pane, ensure_ascii=False, indent=4) + ";",
          "export const FONTS: Record<string, FontSpec[]> = " + json.dumps(fonts, ensure_ascii=False, indent=4) + ";",
          "export const GROUPS: Record<string, [string, string]> = " + json.dumps({g: ["Grp_" + g, l] for g, l in GROUPS.items()}, ensure_ascii=False) + ";", ""]
    io.open(os.path.join(ROOT, "src", "formatSpec.ts"), "w", encoding="utf-8", newline="\n").write("\n".join(ts))

    enp = os.path.join(ROOT, "stringResources", "en-US", "resources.resjson")
    io.open(enp, "w", encoding="utf-8", newline="\n").write(json.dumps(en, indent=2, ensure_ascii=False) + "\n")
    print("formato:", len(objs), "objetos ·", len(en), "claves en-US (sin las de tiempo de ejecución)")


if __name__ == "__main__":
    generar()
