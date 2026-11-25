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
        ("gap", "Space between slices", "num", 1, {"min": 0, "max": 8}),
        ("sort", "Order", "enum", "valueDesc", {"items": [("valueDesc", "By value"), ("data", "Data order")]}),
        ("maxSlices", "Show at most", "num", 6, {"min": 2, "max": 20}),
        ("groupBelow", "Group below (%)", "num", 3, {"min": 0, "max": 20}),
        ("otherColor", "Other color", "fill", "#A19F9D", {}),
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
        ("fontSize", "Text size", "num", 10, {"min": 6, "max": 24}),
        ("color", "Text color (outside)", "fill", "#252423", {}),
    ] + NUM_FORMAT + PCT_FORMAT),
    ("center", "Center", [
        ("show", "Show total in the center", "bool", True, {}),
        ("title", "Title (blank = measure name)", "text", "", {}),
        ("fontSize", "Value size", "num", 20, {"min": 8, "max": 48}),
        ("color", "Text color", "fill", "#252423", {}),
    ] + NUM_FORMAT),
    ("scaleRing", "Scale ring", [
        ("mode", "Marks", "enum", "quarters", {"items": [("off", "Off"), ("quarters", "Quarters (25 %)"), ("tens", "Every 10 %")]}),
        ("color", "Color", "fill", "#605E5C", {}),
    ]),
    # Leyenda (nombre interno `legend`, lo detecta OKviz). Content: Legend = muestra + nombre, compacta como la nativa;
    # Table = leyenda-tabla con columnas. Automatic = Table si hay Compare, Target o Annotation en los pozos; si no, Legend.
    # Las columnas solo salen en el panel con Content = Table y cada una solo con su pozo puesto (getFormattingModel).
    ("legend", "Legend", [
        ("position", "Position", "enum", "auto", {"items": [("auto", "Automatic"), ("right", "Right"), ("left", "Left"),
                                                             ("top", "Top"), ("bottom", "Bottom"), ("off", "Off")]}),
        ("content", "Content", "enum", "auto", {"items": [("auto", "Automatic"), ("legend", "Legend"), ("table", "Table")]}),
        ("header", "Show header", "bool", True, {}),
        ("totalRow", "Show total row", "enum", "auto", {"items": [("auto", "Automatic (pie)"), ("on", "On"), ("off", "Off")]}),
        ("colValue", "Value column", "bool", True, {}),
        ("colShare", "Share % column", "bool", True, {}),
        ("colChange", "Change column", "bool", True, {}),
        ("colTarget", "% of target column", "bool", True, {}),
        ("colNote", "Notes", "bool", True, {}),
        ("segRows", "Segment rows", "bool", False, {}),
        ("fontSize", "Text size", "num", 10, {"min": 6, "max": 24}),
        ("color", "Text color", "fill", "#252423", {}),
    ] + NUM_FORMAT + PCT_FORMAT),
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
        ("titleFontSize", "Title size", "num", 12, {"min": 7, "max": 24}),
        ("titleColor", "Title color", "fill", "#252423", {}),
        ("titleBold", "Bold title", "bool", True, {}),
        ("titleAlign", "Title alignment", "enum", "left", {"items": [("left", "Left"), ("center", "Center")]}),
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

# Orden común de la colección: Style template, tarjetas propias, leyenda, Pro, small multiples, accesibilidad.
PANE = [
    ("style", "Style template", [("style", None, None)]),
    ("slices", "Slices", [("slices", None, None)]),
    ("labels", "Data labels", [("labels", None, "show")]),
    ("center", "Center", [("center", None, "show")]),
    ("scaleRing", "Scale ring", [("scaleRing", None, None)]),
    ("legend", "Legend", [("legend", None, None)]),
    ("compare", "Compare with (Pro)", [("compare", None, None)]),
    ("target", "Target (Pro)", [("target", None, None)]),
    ("annotations", "Annotations (Pro)", [("annotations", None, "show")]),
    ("smallMultiples", "Small multiples (Pro)", [("smallMultiples", None, None)]),
    ("accessibility", "Accessibility", [("accessibility", None, None)]),
]


def cap_type(t):
    return {"bool": {"bool": True}, "num": {"numeric": True}, "fill": {"fill": {"solid": {"color": True}}},
            "text": {"text": True}}.get(t)


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
            for k in ("min", "max"):
                if k in extra:
                    spec[k] = extra[k]
            tp.append(spec)
        objs[name] = {"displayName": label, "displayNameKey": okey, "properties": cp}
        ts_objs[name] = {"name": name, "key": okey, "label": label, "props": tp}
    caps["objects"] = objs
    caps["supportsOnObjectFormatting"] = True
    caps["enablePointerEventsFormatMode"] = True
    io.open(caps_p, "w", encoding="utf-8", newline="\n").write(json.dumps(caps, indent=2, ensure_ascii=False) + "\n")

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
          "export type PropType = \"bool\" | \"num\" | \"fill\" | \"enum\" | \"text\";",
          "export interface PropSpec { name: string; type: PropType; def: string | number | boolean | null; key: string; label: string;",
          "    items?: [string, string, string][]; min?: number; max?: number; }",
          "export interface ObjSpec { name: string; key: string; label: string; props: PropSpec[]; }",
          "export interface GroupSpec { obj: string; toggle: string | null; key?: string; label?: string; }",
          "export interface CardSpec { uid: string; key: string; label: string; groups: GroupSpec[]; }",
          "export const OBJECTS: Record<string, ObjSpec> = " + json.dumps(ts_objs, ensure_ascii=False, indent=4) + ";",
          "export const PANE: CardSpec[] = " + json.dumps(pane, ensure_ascii=False, indent=4) + ";", ""]
    io.open(os.path.join(ROOT, "src", "formatSpec.ts"), "w", encoding="utf-8", newline="\n").write("\n".join(ts))

    enp = os.path.join(ROOT, "stringResources", "en-US", "resources.resjson")
    io.open(enp, "w", encoding="utf-8", newline="\n").write(json.dumps(en, indent=2, ensure_ascii=False) + "\n")
    print("formato:", len(objs), "objetos ·", len(en), "claves en-US (sin las de tiempo de ejecución)")


if __name__ == "__main__":
    generar()
