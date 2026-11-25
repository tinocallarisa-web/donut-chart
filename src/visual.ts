/*
 * Donut & Pie Chart by TCViz — motor gratuito (bloque 1) y funciones Pro (bloque 2).
 *
 * Gratis: donut y queso (radio interior, ángulo de inicio, separación), "Otros" honesto (Show at most / Group below %,
 * conjunto y orden globales, todas sus identidades al seleccionarlo), % por resto mayor que suman 100, negativos y
 * blancos fuera y contados en una nota, leyenda-tabla siempre visible con "Other (n) ▸" desplegable, etiquetas dentro →
 * fuera con guía en dos columnas → retiradas enteras (nunca "…"), centro con el total de Values, anillo de escala desde
 * el ángulo de inicio real, texto que escala con el visual, resaltado parcial, tooltips y tooltips de página, menú
 * contextual, teclado, tarjeta Accessibility, Report theme y Classic, landing y asistente, formato desde el lienzo.
 *
 * Pro (bloque 2): Compare with (Δ pp con minibarra divergente, Δ %, cabecera "Total ±x % vs …", "36 % +2,1" en la
 * etiqueta si cabe en todas, aviso ⚠ de mezcla, new/gone), Target (% of target con ✓ ≈ ✕ e icono en el borde, aviso si
 * los totales no coinciden), Segment (anillo exterior de 2 niveles, filas sangradas, selección por par con todas sus
 * identidades), Small multiples (mismo "Otros", orden y colores; Size by total; tabla compartida), Annotations (subfila
 * en cursiva) y los seis estilos. Sin licencia: editando, todo bajo la marca común (4 paneles); en lectura, el gratis.
 * Orden por cabecera de la tabla en memoria.
 *
 * Reglas de la cartera que se cumplen aquí:
 *  - renderingStarted / Finished|Failed 1:1 por update(): los repintados internos (licencia, hover, selección,
 *    teclado, despliegue de "Otros", fetchMoreData rechazado) llaman a paint() o paintState(), nunca a this.update().
 *  - La licencia se pide en diferido, fuera del try: un fallo de licencia nunca convierte un render en Failed.
 *  - Nunca persistProperties dentro de registerOnSelectCallback.
 *  - allowInteractions desde host.hostCapabilities.
 *  - Sin innerHTML ni red: todo con createElement / d3 y textContent; sin enlaces.
 *  - Medidas de categorical.values[i].values (nunca grouped()): ver src/model.ts.
 */
"use strict";

import powerbi from "powerbi-visuals-api";
import * as d3 from "d3";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import {
    HtmlSubSelectableClass, HtmlSubSelectionHelper, SubSelectableDisplayNameAttribute,
    SubSelectableObjectNameAttribute, SubSelectableTypeAttribute,
} from "powerbi-visuals-utils-onobjectutils";
import { dataViewWildcard } from "powerbi-visuals-utils-dataviewutils";
import "./../style/visual.less";

import { STRINGS } from "./strings";
import { FONTS, FontSpec, GROUPS, OBJECTS, PANE, PropSpec } from "./formatSpec";
import { buildModel, groupEntries, largestRemainder, computeChange, splitChange, Model, Entry, Cat, Change, Dim, OTHER_KEY, MIN_NAMED } from "./model";
import { createProWatermark, renderProWatermark } from "./comun/watermark";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import ILocalizationManager = powerbi.extensibility.ILocalizationManager;
import DataView = powerbi.DataView;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import PrimitiveValue = powerbi.PrimitiveValue;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;

type Sel<T extends d3.BaseType> = d3.Selection<T, unknown, null, undefined>;
type Settings = Record<string, Record<string, any>>;

// build-test.js la rellena con "test AAAA-MM-DD HH:MM vX"; en producción va vacía y no se pinta.
const TEST_STAMP = ""; // TEST_STAMP_MARKER

/** Plan previsto en Partner Center (serie económica: 0,99/mes · 9,99/año, sin prueba). Pendiente de Tino. */
const PLAN_IDS = ["donut-chart-pro"];
const STATE_ACTIVE = 1;
const STATE_WARNING = 2;
/** spIdentifier es el Service ID completo ("editor.oferta.plan"); se acepta también el Plan ID solo. */
function matchesPlan(sp: unknown, planId: string): boolean {
    const s = String(sp ?? "");
    return s === planId || s.endsWith("." + planId);
}

/** Rondas de fetchMoreData: 30.000 filas por ventana, hasta 11 ventanas. Si aún falta, "Other is incomplete". */
const MAX_FETCH_ROUNDS = 10;

/** Colores "Classic" de Power BI, por orden de categoría. */
const CLASSIC = ["#118DFF", "#12239E", "#E66C37", "#6B007B", "#E044A7", "#744EC2", "#D9B300", "#D64550", "#197278", "#1AAB40"];

const TEMPLATES: Record<string, Settings> = {
    report: {},
    classic: { labels: { color: "#252423" }, center: { color: "#252423" }, legend: { color: "#252423" }, dataTable: { color: "#252423" },
        scaleRing: { color: "#605E5C" }, slices: { otherColor: "#A19F9D" } },
};

/** Los seis estilos de la colección (Pro, con vista previa). Mismos tokens que Line Chart, KPI Card y Pareto. */
const PRO_STYLES = ["boardroom", "ledger", "editorial", "signal", "aurora", "terrace"];
interface StyleTokens { bg: string; text: string; axis: string; grid: string; plan: string; up: string; down: string; series: string[]; font?: string; grad?: string; }
export const STYLE_TOKENS: Record<string, StyleTokens> = {
    boardroom: { bg: "#16263D", text: "#F2F0E8", axis: "#9FB0C6", grid: "#2A3E5C", plan: "#6FCF97", up: "#6FCF97", down: "#EB8A7B", series: ["#C9A45C", "#8FB8E8", "#EB8A7B", "#6FCF97", "#C5D3E3"] },
    ledger: { bg: "#FBF8EF", text: "#231F16", axis: "#6E6652", grid: "#D9D2BE", plan: "#946A10", up: "#2F6B3B", down: "#A32A2A", series: ["#7A1F1F", "#3A3528", "#2F6B3B", "#946A10", "#B7AD92"], font: "Georgia, serif" },
    editorial: { bg: "#FFFFFF", text: "#111111", axis: "#5F5F5F", grid: "#E2E2E2", plan: "#111111", up: "#111111", down: "#D7263D", series: ["#D7263D", "#111111", "#5F5F5F", "#BDBDBD", "#8C1C2B"], font: "Georgia, serif" },
    signal: { bg: "#FFFFFF", text: "#14202B", axis: "#566472", grid: "#D9DEE4", plan: "#B7791F", up: "#1F7A4D", down: "#C0392B", series: ["#1F7A4D", "#14202B", "#B7791F", "#C0392B", "#9AA5B1"] },
    aurora: { bg: "#10395E", text: "#FFFFFF", axis: "#C5D3E3", grid: "#3A5C7E", plan: "#FFD27D", up: "#7CE7D0", down: "#FF9DB0", series: ["#7CE7D0", "#FFD27D", "#FF9DB0", "#9DB7FF", "#C5D3E3"], grad: "linear-gradient(135deg, #1B1147, #10395E 50%, #0B5A5E)" },
    terrace: { bg: "#FBF5EC", text: "#3A2A1E", axis: "#7A6450", grid: "#E5D6C2", plan: "#5E7128", up: "#5E7128", down: "#B5372A", series: ["#B5532A", "#5E7128", "#B5782A", "#B5372A", "#C9A77E"] },
};
for (const k of PRO_STYLES) {
    const t = STYLE_TOKENS[k];
    TEMPLATES[k] = { labels: { color: t.text }, center: { color: t.text }, legend: { color: t.text }, dataTable: { color: t.text },
        scaleRing: { color: t.axis }, slices: { otherColor: luminance(t.bg) < 0.2 ? "#8C8C8C" : "#A19F9D" } };
}
/**
 * Tope duro de identidades por select(). Power BI Desktop (2.160, nov-2026) convierte la lista en ORs anidados y los
 * recorre recursivamente: con decenas de miles revienta su pila (RangeError en SelectRefFinder.visitOr, Tino, 25-11),
 * fuera de nuestro alcance. Pila de V8 ≈ 10.000–12.000 marcos, unos 2 marcos por nivel de OR → techo teórico ≈ 5.000;
 * 1.000 deja un margen de ×5 para el Servicio y otras pilas. Microsoft no documenta un límite (que sepamos). Por encima,
 * la selección se ve solo dentro del visual, con aviso, y no se envía nada hacia fuera.
 */
const MAX_SELECT_IDS = 1000;
/** Categorías con el dato Pro en la vista previa sin licencia (las mayores por valor). */
const PREVIEW_TOP = 3;
// Lección (25-11): declarar general.filter rompe select() en Desktop (un clic normal dejó de filtrar); por eso «Otros»
// por encima del tope no usa un filtro NotIn. Ver memoria.
/** Segmentos con nombre por categoría en el anillo exterior; el resto, en un «Other (n)» de la categoría. */
const SEG_MAX = 6;
const SEG_OTHER = "␟segother";
/** Nota «Percentages rounded to add up to 100%»: desactivada (Tino, 25-11); se conserva por si se ofrece como opción. */
const SHOW_ROUNDED_NOTE = false;
const FONT_DEFAULT = "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif";

/** "Report theme" (por defecto): los colores del tema del informe, como un visual nativo. */
function reportTemplate(host: IVisualHost): Settings {
    const pal: any = host.colorPalette;
    const fg: string = pal?.foreground?.value ?? "#252423";
    const soft: string = pal?.foregroundNeutralSecondary?.value ?? "#605E5C";
    const ter: string = pal?.foregroundNeutralTertiary?.value ?? "#A19F9D";
    return { labels: { color: fg }, center: { color: fg }, legend: { color: fg }, dataTable: { color: fg }, scaleRing: { color: soft }, slices: { otherColor: ter } };
}

let instanceCounter = 0;

/** Una parte de una etiqueta: se retiran en el orden valor → nombre → % (Tino, 24-11: el % es lo último). */
interface LabelPart { kind: "pct" | "val" | "name" | "chg"; text: string; }
interface PlacedLabel { e: Entry; text: string; x: number; y: number; anchor: "middle" | "start" | "end"; inside: boolean; w: number; fs: number; leader?: [number, number][]; }
/** Geometría de un panel: R = radio exterior (con el anillo de segmentos), Rin = radio exterior del anillo de categorías. */
interface Geo { cx: number; cy: number; R: number; Rin: number; ri: number; ringR: number; ax: number; ay: number; aw: number; ah: number; ringSpace: number; iconSpace: number; }
interface Arc { e: Entry; a0: number; a1: number; idx: number; }
/** Un arco del anillo exterior (Segment, Pro): el par categoría·segmento. */
interface SegArc { e: Entry; sd: Dim; si: number; key: string; a0: number; a1: number; value: number; hl: number; pct: number; color: string; }
/** Un donut dibujado: el total, o un panel de Small multiples con sus filas (mismo conjunto de "Otros" y colores). */
interface PanelDraw { index: number; fkey: string | null; title: string; entries: Entry[]; total: number; arcs: Arc[]; segArcs: SegArc[]; geo: Geo | null; g: Sel<SVGGElement> | null; }
interface FontInfo { family: string; bold: boolean; italic: boolean; underline: boolean; }
interface TableOpts { fs: number; expanded: boolean; fold: number; compact: boolean; header: boolean; total: boolean; rounded: boolean; segRows: boolean; ann: boolean; bar: boolean; second: boolean; }
type FocusItem = { kind: "entry"; e: Entry } | { kind: "child"; e: Entry; c: Cat; i: number } | { kind: "seg"; e: Entry; sd: Dim; si: number; key: string };

export class Visual implements IVisual {
    private host: IVisualHost;
    private events: IVisualEventService;
    private selectionManager: ISelectionManager;
    private loc: ILocalizationManager;
    private root: HTMLDivElement;
    private svg: Sel<SVGSVGElement>;
    private live: HTMLDivElement;
    private guideEl: HTMLDivElement | null = null;
    private wmZone: HTMLDivElement;
    private wm: HTMLDivElement;
    private subSelectionHelper: HtmlSubSelectionHelper;
    public visualOnObjectFormatting: powerbi.extensibility.visual.VisualOnObjectFormatting;

    private isPro = false; // ISPRO_MARKER
    private licenseRequested = false;
    private licenseResolved = false;
    private licenseEnvUnsupported = false;
    /** Funciones Pro dibujadas bajo marca, solo editando y con la licencia ya resuelta. */
    private proPreview = false;
    private lastBlockedNotice = "";
    private licenseIconShown = false;
    private licenseIconTimer: number | null = null;

    private lastOptions: VisualUpdateOptions | null = null;
    private dataView: DataView | null = null;
    private model: Model | null = null;
    private entries: Entry[] = [];
    /** Categorías que salen (Compare with): solo en la tabla. */
    private goneEntries: Entry[] = [];
    private panels: PanelDraw[] = [];
    private arcs: Arc[] = [];
    /** Orden por cabecera de la tabla: en memoria, nunca se guarda. */
    private sortCol: string | null = null;
    private sortDir = -1;
    private roundedNote = false;
    private settings: Settings = {};
    private tplVisto: string | null = null;
    private tplEfectiva = "report";
    private editing = false;
    private formatMode = false;
    private guideStep = 1;
    private instance = ++instanceCounter;

    // Geometría y texto del dibujo en curso
    private W = 0;
    private H = 0;
    private k = 1;
    private minFs = 8;
    private geo: Geo | null = null;
    private tableEl: HTMLDivElement | null = null;
    /** Letra de la tabla dibujada: las etiquetas nunca la superan. */
    private tableFs = 0;
    /** Leyenda clásica dibujada (independiente de la tabla) y su letra. */
    private legendEl: HTMLDivElement | null = null;
    private legendFs = 0;
    /** Las etiquetas nunca superan la letra de la leyenda ni la de la tabla (la menor de las dibujadas). */
    private get capFs(): number {
        const v = [this.legendFs, this.tableFs].filter(x => x > 0);
        return v.length ? Math.min(...v) : 0;
    }
    /** Segment anidado en Category (cada categoría en un solo segmento): sin anillo exterior. */
    private segNested = false;
    private canvasCtx: CanvasRenderingContext2D | null = null;
    private fmtCache = new Map<string, valueFormatter.IValueFormatter>();
    private idCache = new Map<string, ISelectionId>();

    // Estado de interacción (no se guarda: no va en marcadores salvo la selección)
    private otherExpanded = false;
    private hoverKey: string | null = null;
    private focusIdx = -1;
    private hasFocus = false;
    /**
     * Foco de teclado visible (patrón focus-visible): solo cuando el foco llega o se mueve con el teclado. Un clic da el
     * foco al contenedor pero no pinta contorno ni mueve el elemento enfocado (si no, el mayor parecía seleccionado).
     */
    private kbMode = false;
    /** Lazo en curso (FC.PROP07): arrastre de más de 6 px sobre el gráfico. */
    private drag: { x0: number; y0: number; x1: number; y1: number; on: boolean; add: boolean; id: number } | null = null;
    private lassoEl: SVGRectElement | null = null;
    private suppressClick = false;
    /** La selección actual es demasiado grande para filtrar fuera: solo se dibuja aquí. */
    private localOnly = false;
    /** Decimales de % of target en este update (computeTgtDec). */
    private tgtDec = 0;
    /**
     * Vista previa Pro limitada (norma de cartera, 26-10): editando sin licencia, el dato de Compare, Target, Segment y
     * Annotations solo en las PREVIEW_TOP mayores categorías; el resto, «—» o sin anillo. Vacío = sin límite.
     */
    private previewKeys: Set<string> | null = null;
    private selN = 0;
    /** Por update: segmentos de cada categoría (top SEG_MAX + «Other») y sus valores (ver segListOf / segSplit). */
    private segLists = new Map<string, { sd: Dim; keys: string[] }[]>();
    private splitCache = new Map<string, { sd: Dim; v: number; h: number }[]>();
    private segOrder: Map<string, number> | null = null;
    private segDims: Map<string, Dim> | null = null;
    private pointerDown = false;
    /** Selección propia: claves de categoría (o OTHER_KEY). Se calcula aquí y se pasa entera a Power BI. */
    private selKeys = new Set<string>();
    private pendingRestore: ISelectionId[] | null = null;

    // fetchMoreData
    private fetchRounds = 0;
    private moreState: "done" | "loading" | "incomplete" = "done";

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.selectionManager = options.host.createSelectionManager();
        this.loc = options.host.createLocalizationManager();

        this.root = document.createElement("div");
        this.root.className = "dn-root";
        this.root.tabIndex = 0;
        this.root.setAttribute("role", "group");
        options.element.appendChild(this.root);
        this.svg = d3.select(this.root).append("svg").attr("class", "dn-svg") as unknown as Sel<SVGSVGElement>;
        this.live = document.createElement("div");
        this.live.className = "dn-live";
        this.live.setAttribute("aria-live", "polite");
        this.root.appendChild(this.live);
        // Marca común en zona segura: esquina inferior del área del donut (sin tapar la cifra central).
        this.wmZone = document.createElement("div");
        this.wmZone.className = "dn-wmzone";
        this.root.appendChild(this.wmZone);
        this.wm = createProWatermark(this.wmZone);
        this.injectStyles();

        this.subSelectionHelper = HtmlSubSelectionHelper.createHtmlSubselectionHelper({
            hostElement: options.element,
            subSelectionService: options.host.subSelectionService,
            selectionIdCallback: () => undefined,
        });
        this.visualOnObjectFormatting = {
            getSubSelectionStyles: (subs) => this.getSubSelectionStyles(subs),
            getSubSelectionShortcuts: (subs) => this.getSubSelectionShortcuts(subs),
            getSubSelectables: (filter) => this.subSelectionHelper.getAllSubSelectables(filter),
        };

        // Marcadores y selección desde fuera: solo derivar y repintar. Nunca persistProperties aquí.
        const sm = this.selectionManager as any;
        if (typeof sm.registerOnSelectCallback === "function") {
            sm.registerOnSelectCallback((ids: ISelectionId[]) => {
                this.restoreSelection(ids || []);
                this.paintState();
            });
        }

        this.root.addEventListener("keydown", this.safe((e: KeyboardEvent) => this.onKey(e)));
        // Un puntero apaga el modo teclado y borra un contorno que hubiera quedado (en Desktop el foco del iframe puede
        // llegar antes que el pointerdown y parecer de teclado).
        const offKb = () => { this.pointerDown = true; if (this.kbMode) { this.kbMode = false; this.paintState(); } };
        this.root.addEventListener("pointerdown", offKb);
        this.root.addEventListener("mousedown", offKb);
        this.root.addEventListener("focus", () => {
            this.hasFocus = true;
            // Con Tab el foco llega sin puntero: modo teclado. Con un clic, no.
            let visible = true;
            try { visible = this.root.matches(":focus-visible"); } catch { /* navegador sin :focus-visible */ }
            this.kbMode = !this.pointerDown && visible;
            this.pointerDown = false;
            if (!this.kbMode) return;
            if (this.focusIdx < 0) this.focusIdx = 0;
            this.paintState();
            this.announce();
        });
        this.root.addEventListener("blur", () => { this.hasFocus = false; this.kbMode = false; this.pointerDown = false; this.hideTip(); this.paintState(); });
        this.root.addEventListener("pointerdown", this.safe((e: PointerEvent) => this.lassoStart(e)));
        this.root.addEventListener("pointermove", this.safe((e: PointerEvent) => this.lassoMove(e)));
        this.root.addEventListener("pointerup", this.safe((e: PointerEvent) => this.lassoEnd(e)));
        this.root.addEventListener("pointercancel", this.safe(() => this.lassoCancel()));
        this.root.addEventListener("click", this.safe((e: MouseEvent) => this.onClick(e)));
        this.root.addEventListener("contextmenu", this.safe((e: MouseEvent) => this.onContext(e)));
        this.root.addEventListener("mousemove", this.safe((e: MouseEvent) => this.onMove(e)));
        this.root.addEventListener("mouseleave", () => { if (this.hoverKey !== null) { this.hoverKey = null; this.paintState(); } this.hideTip(); });
    }

    // ── Textos y formato ─────────────────────────────────────────────────────

    /** Primero la tabla del bundle (Desktop solo traduce las claves de capabilities.json), luego el gestor, luego inglés. */
    private t(key: string, fallback: string): string {
        const loc = String(this.host?.locale || "");
        const tabla = STRINGS[loc] || STRINGS[Object.keys(STRINGS).find(l => l.slice(0, 2) === loc.slice(0, 2)) || ""];
        if (tabla && tabla[key]) return tabla[key];
        try {
            const s = this.loc?.getDisplayName(key);
            return s && s !== key ? s : fallback;
        } catch { return fallback; }
    }

    private tf(key: string, fallback: string, ...args: string[]): string {
        return this.t(key, fallback).replace(/\{(\d+)\}/g, (_m, i) => args[Number(i)] ?? "");
    }

    private static isPct(fmt: string | undefined): boolean {
        return !!fmt && /%/.test(fmt.replace(/"[^"]*"|\\./g, ""));
    }

    private formatter(format: string | undefined, scale?: number, precision?: number): valueFormatter.IValueFormatter {
        const k = (format ?? "") + "|" + (scale === undefined ? "" : String(scale)) + "|" + (precision ?? "");
        let f = this.fmtCache.get(k);
        if (!f) {
            const o: any = { format, cultureSelector: this.host.locale };
            if (scale !== undefined) { o.value = scale; o.displayUnitSystemType = 2; }
            if (precision !== undefined) o.precision = precision;
            f = valueFormatter.create(o);
            this.fmtCache.set(k, f);
        }
        return f;
    }

    /**
     * Formato por defecto cuando la columna llega sin formato (columna sumada): miles con separador y sin decimales
     * espurios (3,340,463, no 3,340,462.5); por debajo de 100, hasta dos decimales.
     */
    private static defaultFmt(v: number): string {
        return Math.abs(v) >= 100 ? "#,0" : "#,0.##";
    }

    /** Valor completo (tooltip, lector de pantalla): el formato de la fila (dinámico) o el de la medida. */
    private fmtFull(v: number | null, fmt: string | undefined): string {
        if (v === null || v === undefined || !isFinite(v)) return this.t("UI_Blank", "(Blank)");
        return this.formatter(fmt || Visual.defaultFmt(v)).format(v);
    }

    /** Valor compacto con 3 cifras significativas (490K, 2,06M, 12,5K); los porcentajes, tal cual. */
    private fmtCompact(v: number, fmt: string | undefined): string {
        return this.fmtValue(v, fmt, "auto", null, "compact");
    }

    /**
     * Formato de números como el nativo (patrón de Bar Chart): el formato del modelo + host.locale, con Display units
     * (Auto / None / Thousands / Millions / Billions / Trillions) y Value decimal places (null = automático).
     * autoMode decide qué es "Auto" en cada sitio: unidades automáticas (etiquetas, centro) o cifra completa (tabla).
     */
    private fmtValue(v: number, fmt: string | undefined, units: string, decimals: number | null, autoMode: "compact" | "full"): string {
        if (v === null || v === undefined || !isFinite(v)) return this.t("UI_Blank", "(Blank)");
        const f = fmt || Visual.defaultFmt(v);
        const dec = decimals === null || decimals === undefined || !isFinite(decimals) ? undefined : Math.max(0, Math.round(decimals));
        const a = Math.abs(v);
        const fixed: Record<string, number> = { thousands: 1e3, millions: 1e6, billions: 1e9, trillions: 1e12 };
        let u = units;
        if (u === "auto") u = autoMode === "compact" ? "auto" : "none";
        try {
            if (Visual.isPct(f) || u === "none") return this.formatter(f, undefined, dec).format(v);
            if (fixed[u]) return this.formatter(f, fixed[u], dec ?? 0).format(v);
            if (a < 1000) return this.formatter(f, undefined, dec).format(v);
            const unit = a >= 1e12 ? 1e12 : a >= 1e9 ? 1e9 : a >= 1e6 ? 1e6 : 1e3;
            const precision = dec ?? Math.max(0, Math.min(2, 3 - (Math.floor(Math.log10(Math.max(a / unit, 1))) + 1)));
            return this.formatter(f, a, precision).format(v);
        } catch { return this.formatter(f).format(v); }
    }

    private numOpt(obj: string): number | null {
        const d = this.settings[obj]?.valueDecimals;
        return d === null || d === undefined || d === "" ? null : Number(d);
    }

    /** % con la configuración regional (24 % en español, 24% en inglés). units en 10^-d de punto porcentual. */
    private fmtPct(units: number, d: number = this.pctDec("labels")): string {
        try {
            return new Intl.NumberFormat(this.host.locale || "en-US", { style: "percent", minimumFractionDigits: d, maximumFractionDigits: d })
                .format(units / Math.pow(10, d) / 100);
        } catch { return (units / Math.pow(10, d)).toFixed(d) + "%"; }
    }

    private pctDec(obj: string): number {
        return Math.max(0, Math.min(4, Math.round(Number(this.settings[obj]?.percentDecimals ?? 0)) || 0));
    }

    /**
     * % de la tabla con sus propios decimales, por resto mayor (suman 100 y los de "Otros" suman lo de "Otros").
     */
    private tablePct(): { pct: Map<string, number>; adjusted: boolean } {
        const d = this.pctDec("dataTable");
        const units = 100 * Math.pow(10, d);
        const lr = largestRemainder(this.entries.map(e => e.value), units);
        const pct = new Map<string, number>();
        let adjusted = lr.adjusted;
        this.entries.forEach((e, i) => {
            pct.set(e.key, lr.out[i]);
            if (e.isOther) {
                const sub = largestRemainder(e.members.map(c => c.value), lr.out[i]);
                e.members.forEach((c, j) => pct.set(c.key, sub.out[j]));
                adjusted = adjusted || sub.adjusted;
            }
        });
        return { pct, adjusted };
    }

    private int(n: number): string { return this.formatter("#,0").format(n); }

    private intlDate(d: Date): string {
        try { return new Intl.DateTimeFormat(this.host.locale || "en-US", { day: "numeric", month: "short", year: "numeric" }).format(d); } catch { return d.toDateString(); }
    }

    /** Texto de un valor de categoría con el formato de su columna. */
    private catLabel(v: PrimitiveValue, col: DataViewCategoryColumn): string {
        const fmt = col.source.format;
        if (v instanceof Date) return fmt ? this.formatter(fmt).format(v) : this.intlDate(v);
        if (typeof v === "number") return fmt ? this.formatter(fmt).format(v) : String(v);
        return String(v);
    }

    private get font(): string { return this.look?.font ?? FONT_DEFAULT; }

    /** Ancho del texto con la fuente real (familia, negrita, cursiva): las fuentes anchas deciden si caben. */
    private measure(text: string, size: number, bold = false, f: FontInfo | null = null): number {
        if (!this.canvasCtx) {
            try { this.canvasCtx = document.createElement("canvas").getContext("2d"); } catch { this.canvasCtx = null; }
        }
        const b = bold || !!f?.bold;
        if (!this.canvasCtx) return text.length * size * (b ? 0.66 : 0.56);
        this.canvasCtx.font = (f?.italic ? "italic " : "") + (b ? "700 " : "") + size + "px " + (f?.family ?? this.font);
        return this.canvasCtx.measureText(text).width;
    }

    /**
     * Fuente elegida en el panel para un objeto (FontControl). Vacía = la del estilo activo (Report theme: la del
     * informe por defecto; cada estilo de la colección, la suya).
     */
    private fontOf(obj: string, fam = "fontFamily", bold: string | null = "bold", ital: string | null = "italic", und: string | null = "underline"): FontInfo {
        const o = this.settings?.[obj] ?? {};
        const v = String(o[fam] || "").trim();
        return { family: v ? cssFamily(v) : this.font, bold: bold ? !!o[bold] : false, italic: ital ? !!o[ital] : false, underline: und ? !!o[und] : false };
    }

    private get lblFont(): FontInfo { return this.fontOf("labels"); }

    /** Aplica una fuente a un elemento HTML (tabla, leyenda, Summary, títulos de panel). */
    private static styleFont(el: HTMLElement, f: FontInfo, setWeight = true): void {
        el.style.fontFamily = f.family;
        if (setWeight) el.style.fontWeight = f.bold ? "700" : "";
        el.style.fontStyle = f.italic ? "italic" : "";
        el.style.textDecoration = f.underline ? "underline" : "";
    }

    /** Aplica una fuente a un texto SVG. */
    private static svgFont(t: Sel<SVGTextElement>, f: FontInfo): void {
        t.style("font-family", f.family).attr("font-weight", f.bold ? 700 : 400).attr("font-style", f.italic ? "italic" : null)
            .attr("text-decoration", f.underline ? "underline" : null);
    }

    /** Texto que escala con el visual: k = lado menor / 300 (0,6–1,8), nunca bajo 8 px ni bajo el mínimo de Accessibility. */
    private fz(base: number): number {
        return Math.max(this.minFs, Math.round(base * this.k * 2) / 2);
    }

    // ── Ajustes ──────────────────────────────────────────────────────────────

    private readSettings(dv: DataView | null, tpl: string): Settings {
        const o: any = dv?.metadata?.objects ?? {};
        const t = TEMPLATES[tpl] ?? {};
        const out: Settings = {};
        for (const obj of Object.keys(OBJECTS)) {
            out[obj] = {};
            for (const p of OBJECTS[obj].props) {
                let saved = o?.[obj]?.[p.name];
                // Informes anteriores al 25-11: la tabla vivía en el objeto legend (mismos nombres de propiedad).
                if (saved === undefined && obj === "dataTable" && p.name !== "position" && o?.legend?.content === "table") saved = o?.legend?.[p.name];
                let v: any = p.type === "fill" ? saved?.solid?.color : saved;
                if (v === undefined || v === null) v = t?.[obj]?.[p.name];
                if (v === undefined || v === null) v = p.def;
                if (p.type === "num" && v !== null && v !== "") {
                    v = Number(v);
                    if (!isFinite(v)) v = p.def;
                    if (p.min !== undefined) v = Math.max(p.min, v);
                    if (p.max !== undefined) v = Math.min(p.max, v);
                }
                out[obj][p.name] = v;
            }
        }
        // Migración de la leyenda-tabla (antes del 25-11, legend.content = table): la tabla pasa a Data table en la posición
        // que tenía (Top no existe en la tabla: Bottom) y la leyenda clásica se apaga, para que el informe se vea como antes.
        if (o?.legend?.content === "table" && o?.dataTable?.position === undefined) {
            const old = String(o.legend.position ?? "auto");
            out.dataTable.position = old === "top" ? "bottom" : old;
            out.legend.position = "off";
        }
        return out;
    }

    /** La plantilla que se dibuja: un estilo de la colección solo con Pro o en la vista previa; si no, Report theme. */
    private plantillaEfectiva(dv: DataView | null): string {
        const t = String((dv?.metadata?.objects as any)?.style?.template ?? "report");
        if (!TEMPLATES[t]) return "report";
        return PRO_STYLES.indexOf(t) < 0 || this.previewOf("style templates") ? t : "report";
    }

    private get look(): StyleTokens | null {
        return !this.hc && PRO_STYLES.indexOf(this.tplEfectiva) >= 0 ? STYLE_TOKENS[this.tplEfectiva] : null;
    }

    private get bgColor(): string {
        if (this.hc) return this.hcBg;
        return this.look?.bg ?? (this.host.colorPalette as any)?.background?.value ?? "#FFFFFF";
    }

    private get ink(): string {
        if (this.hc) return this.hcFg;
        return this.look?.text ?? (this.host.colorPalette as any)?.foreground?.value ?? "#252423";
    }

    private aplicarAspecto(): void {
        const look = this.look;
        this.root.style.background = this.hc ? this.hcBg : (look ? (look.grad ?? look.bg) : "");
        this.root.style.fontFamily = look?.font ?? "";
        const motion = !this.settings.accessibility?.reduceMotion;
        this.root.classList.toggle("dn-motion", motion);
    }

    /**
     * Qué funciones Pro pide el informe: un campo en Compare with, Target, Segment, Small multiples o Annotation, o un
     * estilo de la colección. Sin licencia: editando se dibujan completas bajo la marca común; en lectura, el gratis exacto.
     */
    private attemptedProFeatures(): { labels: string[]; signature: string; touched: Set<string> } {
        const objs: any = this.dataView?.metadata?.objects ?? {};
        const tpl = String(objs.style?.template ?? "");
        const cols = this.dataView?.metadata?.columns ?? [];
        const has = (role: string) => cols.some(c => !!(c.roles && c.roles[role]));
        const groups: [string, boolean, string][] = [
            ["comparison", has("compare"), "cmp"],
            ["targets", has("target"), "tgt"],
            ["segments", has("segment"), "seg"],
            ["small multiples", has("facet"), "sm"],
            ["annotations", has("annotation") && objs.annotations?.show !== false, "ann"],
            ["style templates", PRO_STYLES.indexOf(tpl) >= 0, "style=" + tpl],
        ];
        const labels: string[] = [];
        const parts: string[] = [];
        const touched = new Set<string>();
        for (const [label, activa, firma] of groups) {
            if (!activa) continue;
            labels.push(label); touched.add(label); parts.push(firma);
        }
        return { labels, signature: parts.join("|"), touched };
    }

    private previewOf(feature: string): boolean {
        if (this.isPro) return true;
        if (!this.proPreview) return false;
        return this.attemptedProFeatures().touched.has(feature);
    }

    private featName(id: string): string {
        switch (id) {
            case "style templates": return this.t("Feat_styles", "collection styles");
            case "comparison": return this.t("Feat_compare", "comparison");
            case "targets": return this.t("Feat_target", "targets");
            case "segments": return this.t("Feat_segment", "segment ring");
            case "small multiples": return this.t("Feat_sm", "small multiples");
            case "annotations": return this.t("Feat_ann", "annotations");
            default: return id;
        }
    }

    /**
     * La marca común, solo con una función Pro puesta y solo editando, en la franja baja del área de dibujo: por debajo
     * de la cifra central de cada panel y nunca encima de la tabla (donde van las columnas Δ y % of target).
     */
    private updateWatermark(): void {
        const { labels } = this.attemptedProFeatures();
        const ps = this.panels.filter(p => p.geo);
        if (!this.proPreview || !labels.length || !this.model || !ps.length) { renderProWatermark(this.wm, null); this.wmZone.style.display = "none"; return; }
        const g = ps[0].geo;
        // Área de dibujo: la del panel único, o la unión de las celdas de la rejilla.
        const ax = Math.min(...ps.map(p => p.geo.ax)), aw = Math.max(...ps.map(p => p.geo.ax + p.geo.aw)) - ax;
        const ay = Math.min(...ps.map(p => p.geo.ay)), bottom = Math.max(...ps.map(p => p.geo.ay + p.geo.ah));
        const ah = bottom - ay;
        const lastRow = ps.filter(p => Math.abs(p.geo.cy - Math.max(...ps.map(q => q.geo.cy))) < 1);
        const safe = Math.max(...lastRow.map(p => p.geo.cy + Math.max(p.geo.ri * 0.55 + 2, this.centerHalf(p))));
        const top = Math.max(safe, ps.length > 1 ? 0 : g.ay + g.ah * 0.62);
        const h = Math.max(40, bottom - top);
        Object.assign(this.wmZone.style, { display: "block", left: ax + "px", top: (bottom - h) + "px", width: aw + "px", height: h + "px" });
        renderProWatermark(this.wm, {
            width: aw, height: Math.min(ah, h * 2.2), title: this.t("UI_ProPreview", "Pro preview"), features: labels.map(l => this.featName(l)),
            highContrast: this.hc ? { foreground: this.hcFg, background: this.hcBg } : null,
        });
    }

    /** Media altura del texto central dibujado en un panel (para no taparlo con la marca). */
    private centerHalf(p: PanelDraw): number {
        if (!p.g) return 0;
        let half = 0;
        p.g.selectAll<SVGTextElement, unknown>(".dn-center-text").each((_d, i, nodes) => {
            const y = Number(nodes[i].getAttribute("y")), fs = Number(nodes[i].getAttribute("font-size"));
            half = Math.max(half, Math.abs(y - p.geo.cy) + fs * 0.6);
        });
        return half;
    }

    private cancelLicenseIcon(): void {
        if (this.licenseIconTimer !== null) { window.clearTimeout(this.licenseIconTimer); this.licenseIconTimer = null; }
    }

    private clearLicenseNotice(): void {
        this.lastBlockedNotice = "";
        this.cancelLicenseIcon();
        if (!this.licenseIconShown) return;
        this.licenseIconShown = false;
        try { (this.host.licenseManager as any)?.clearLicenseNotification?.(); } catch { /* best-effort */ }
    }

    /**
     * Avisos de licencia del propio Power BI (sin UX de licencia propia): quitar lo que haya, el aviso que nombra la
     * función y, ~10 s después, la barra de Upgrade. Solo ante un cambio NUEVO de un ajuste Pro.
     */
    private notifyProFeatureBlocked(): void {
        const lm: any = this.host.licenseManager;
        if (!lm || !this.licenseResolved) return;
        if (this.isPro) { this.clearLicenseNotice(); return; }
        const { labels, signature } = this.attemptedProFeatures();
        if (!labels.length) { this.clearLicenseNotice(); return; }
        if (this.licenseEnvUnsupported) return;
        if (signature === this.lastBlockedNotice) return;
        this.lastBlockedNotice = signature;
        this.licenseIconShown = true;
        const list = labels.map(l => this.featName(l)).join(", ");
        const msg = this.proPreview
            ? this.tf("UI_NoticePreview", "Donut & Pie Chart: {0} — part of the Pro plan, shown here as a watermarked preview. Reading view shows the free chart.", list)
            : this.tf("UI_NoticeBlocked", "Donut & Pie Chart: {0} — part of the Pro plan. Get a licence to enable it.", list);
        const show = () => {
            try { lm.notifyFeatureBlocked?.(msg.slice(0, 500)); } catch { /* best-effort */ }
            this.cancelLicenseIcon();
            this.licenseIconTimer = window.setTimeout(() => {
                this.licenseIconTimer = null;
                if (this.isPro || !this.licenseIconShown) return;
                try { lm.notifyLicenseRequired?.(powerbi.LicenseNotificationType.General); } catch { /* best-effort */ }
            }, 10500);
        };
        let cleared: any;
        try { cleared = lm.clearLicenseNotification?.(); } catch { /* best-effort */ }
        if (cleared && typeof cleared.then === "function") cleared.then(show, show); else show();
    }

    private get canInteract(): boolean {
        if (this.formatMode) return false;
        // hostCapabilities es donde la API 5.x lo pone; host.allowInteractions era el sitio antiguo.
        const h: any = this.host;
        return (h?.hostCapabilities?.allowInteractions ?? h?.allowInteractions) !== false;
    }

    /** Alto contraste del tema (Windows / Power BI). Escrito así a propósito: OKviz lo detecta por `p.isHighContrast`. */
    private themeHighContrast(): boolean {
        const p = this.host.colorPalette;
        return !!(p && p.isHighContrast);
    }
    /** Alto contraste efectivo: el del tema, o forzado con Accessibility → High contrast = On. */
    private get hc(): boolean { return this.themeHighContrast() || this.settings.accessibility?.highContrast === "on"; }
    private get hcFg(): string { return this.themeHighContrast() ? ((this.host.colorPalette as any)?.foreground?.value ?? "#000000") : "#000000"; }
    private get hcBg(): string { return this.themeHighContrast() ? ((this.host.colorPalette as any)?.background?.value ?? "#FFFFFF") : "#FFFFFF"; }
    private get hcSel(): string { return this.themeHighContrast() ? ((this.host.colorPalette as any)?.foregroundSelected?.value ?? this.hcFg) : "#0037DA"; }

    private get focusColor(): string {
        const c = String(this.settings.accessibility?.focusColor || "");
        if (c && !this.themeHighContrast()) return c;
        return this.hc ? this.hcSel : (this.look ? this.look.text : "#2B6CB0");
    }

    // ── Update ───────────────────────────────────────────────────────────────

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        let fetchNow = false;
        try {
            this.lastOptions = options;
            const dv = options.dataViews?.[0] ?? null;
            this.dataView = dv;
            const vm = (options as any).viewMode;
            this.editing = typeof vm === "number" && vm !== 0;
            this.formatMode = !!(options as any).formatMode;
            this.subSelectionHelper.setFormatMode(this.formatMode);
            if (dv) {
                const ahora = String(((dv.metadata?.objects as any)?.style?.template) ?? "report");
                if (this.editing && this.tplVisto !== null && this.tplVisto !== ahora) this.aplicarPlantilla(ahora);
                this.tplVisto = ahora;
            }
            // fetchMoreData: si Power BI recortó (metadata.segment), se pide el resto (segmentos agregados) con tope.
            const op = (options as any).operationKind;
            if (op === 0 || op === undefined) this.fetchRounds = 0;
            const seg = dv && dv.metadata ? (dv.metadata as any).segment : undefined;
            if (seg === undefined) this.moreState = "done";
            else if (this.fetchRounds < MAX_FETCH_ROUNDS && typeof (this.host as any).fetchMoreData === "function") { this.moreState = "loading"; fetchNow = true; }
            else this.moreState = "incomplete";
            this.fmtCache.clear();
            this.render(options);
            if (this.formatMode) this.subSelectionHelper.updateOutlinesFromSubSelections((options as any).subSelections ?? [], true);
            this.events.renderingFinished(options);
        } catch (e) {
            // Nunca una excepción hacia el host: se avisa dentro del visual y se cierra el evento de render.
            console.error("[DonutChart]", e);
            try { this.clearDrawing(); this.message(this.W || 300, this.H || 200, this.t("UI_RenderError", "This data could not be drawn. Try fewer categories or segments.")); } catch { /* nada */ }
            this.events.renderingFailed(options, String(e));
        }
        if (fetchNow) {
            let ok = false;
            try { ok = !!(this.host as any).fetchMoreData(true); } catch { ok = false; }
            this.fetchRounds++;
            // Rechazado (memoria agotada o entorno sin paginación): el aviso pasa a "incompleto", sin rendering events.
            if (!ok) { this.moreState = "incomplete"; this.paint(); }
        }
        // Fuera del try: un fallo de licencia nunca convierte un render correcto en renderingFailed.
        this.requestLicenseDeferred();
        try { this.notifyProFeatureBlocked(); } catch { /* best-effort */ }
    }

    /** Repinta todo con las últimas options fuera de update(): no emite rendering events. */
    private paint(): void {
        if (!this.lastOptions) return;
        try { this.render(this.lastOptions); } catch (e) { console.error("[DonutChart]", e); }
    }

    private requestLicenseDeferred(): void {
        if (this.licenseRequested || this.isPro) return;
        this.licenseRequested = true;
        window.setTimeout(() => {
            try {
                const lm: any = this.host.licenseManager;
                if (!lm) { this.licenseEnvUnsupported = true; this.licenseResolved = true; return; }
                lm.getAvailableServicePlans().then(
                    (r: any) => {
                        if (r?.isLicenseUnsupportedEnv === true || r?.isLicenseInfoAvailable === false) this.licenseEnvUnsupported = true;
                        this.licenseResolved = true;
                        const pro = (r?.plans ?? []).some((p: any) => PLAN_IDS.some(id => matchesPlan(p.spIdentifier, id)) &&
                            (p.state === STATE_ACTIVE || p.state === STATE_WARNING));
                        if (pro) this.isPro = true;
                        this.paint();
                        try { this.notifyProFeatureBlocked(); } catch { /* best-effort */ }
                    },
                    () => { this.licenseEnvUnsupported = true; this.licenseResolved = true; });
            } catch {
                this.licenseEnvUnsupported = true;
                this.licenseResolved = true;
            }
        }, 0);
    }

    private clearDrawing(): void {
        this.svg.selectAll("*").remove();
        d3.select(this.root).selectAll(".dn-landing, .dn-msg, .dn-table, .dn-legend, .dn-notes, .dn-summary").remove();
        this.tableEl = null;
        this.tableFs = 0;
        this.legendEl = null;
        this.legendFs = 0;
        this.geo = null;
        this.arcs = [];
        d3.select(this.root).selectAll(".dn-sm-title, .dn-smnote").remove();
        this.panels = [];
    }

    private render(options: VisualUpdateOptions): void {
        const dv = this.dataView;
        TEMPLATES.report = reportTemplate(this.host);
        this.proPreview = !this.isPro && this.editing && this.licenseResolved && !this.licenseEnvUnsupported;
        this.tplEfectiva = this.plantillaEfectiva(dv);
        this.settings = this.readSettings(dv, this.tplEfectiva);
        this.clearDrawing();
        const W = Math.max(0, options.viewport.width), H = Math.max(0, options.viewport.height);
        this.W = W; this.H = H;
        this.svg.attr("width", W).attr("height", H);
        this.aplicarAspecto();
        this.idCache.clear();
        this.segLists.clear();
        this.splitCache.clear();
        this.segOrder = null;
        this.segDims = null;
        this.k = Math.max(0.6, Math.min(1.8, Math.min(W, H) / 300));
        this.minFs = Math.max(8, Number(this.settings.accessibility.minFontSize) || 8);

        const blank = this.t("UI_Blank", "(Blank)");
        this.model = dv ? buildModel(dv, blank, (v, col) => this.catLabel(v, col)) : null;
        const m = this.model;
        if (!m) {
            this.entries = [];
            this.renderLanding(W, H);
            this.renderGuide(W, H);
            this.updateWatermark();
            return;
        }
        const s = this.settings;
        const g = groupEntries(m, { maxSlices: Number(s.slices.maxSlices), groupBelow: Number(s.slices.groupBelow), sort: String(s.slices.sort),
            decimals: this.pctDec("labels"), otherName: this.t("UI_Other", "Other") });
        this.entries = g.entries;
        this.roundedNote = g.adjusted || (this.entries.length > 0 && this.tablePct().adjusted);
        this.segNested = this.computeSegNested();
        this.assignColors();
        // Pro: cambio frente a Compare with, orden (cabecera / Sort by change) y paneles. Colores antes de ordenar: el
        // color va con la categoría, no con la posición.
        this.computeChanges();
        this.previewKeys = this.computePreviewKeys();
        this.tgtDec = this.computeTgtDec();
        this.applySort();
        this.panels = this.buildPanels();
        if (this.pendingRestore) this.restoreSelection(this.pendingRestore);
        else if (!this.selKeys.size) {
            const ids = this.selectionManager.getSelectionIds?.() as ISelectionId[] | undefined;
            if (ids && ids.length) this.restoreSelection(ids);
        }
        this.pruneSelection();
        if (this.localOnly && !this.selKeys.size) { this.localOnly = false; this.showLocalNote(0); }
        this.root.setAttribute("aria-label", this.tf("UI_Aria", "{0} chart: {1} by {2}, {3} categories, total {4}",
            s.slices.shape === "pie" ? this.t("Enum_shape_pie", "Pie") : this.t("Enum_shape_donut", "Donut"),
            m.measureName, m.categoryName, String(m.cats.length), this.fmtFull(m.total, m.format)));
        if (!this.entries.length) {
            this.message(W, H, this.t("UI_NoPositive", "No positive values to draw."), this.notesList({ pct: false }));
            this.renderGuide(W, H);
            this.updateWatermark();
            return;
        }
        this.layoutAndDraw(W, H);
        if (this.localOnly) this.showLocalNote();
        if (TEST_STAMP && W >= 200) {
            // Sello de las builds de prueba: abajo si arriba está Summary.
            const sy = this.root.querySelector(".dn-summary") ? H - 3 : 10;
            this.svg.append("text").attr("x", 4).attr("y", sy).style("font-size", "9px")
                .attr("fill", this.hc ? this.hcFg : "#A19F9D").text("[" + TEST_STAMP + "]");
        }
        if (this.focusIdx >= this.focusItems().length) this.focusIdx = this.focusItems().length - 1;
        this.paintState();
        this.markSubSelectables();
        this.renderGuide(W, H);
        this.updateWatermark();
    }

    // ── Colores ──────────────────────────────────────────────────────────────

    /** Color por clave: lo guardado para la categoría > regla fx de su fila > "All slices" fijo > paleta. */
    /**
     * Color por clave: lo guardado para la categoría > regla fx de su fila > "All slices" fijo > paleta del estilo.
     * La paleta del estilo (o del tema del informe) se usa TAL CUAL y en su orden para los primeros sectores (identidad
     * de los estilos, Tino 24-11). Solo cuando se agota, o un color repetiría uno ya usado o al vecino, se generan tonos
     * nuevos (luminosidad primero, tono después) con ΔE2000 ≥ 12 frente a todos y ≥ 20 frente a sus vecinos, nunca grises.
     * "Otros": el gris neutro más alejado de los colores visibles; si aun así queda cerca, lleva una trama ligera.
     */
    private assignColors(): void {
        const s = this.settings;
        const pal: any = this.host.colorPalette;
        const look = this.look;
        const styleCols = look ? Array.from(new Set(look.series.concat([look.plan, look.up, look.down]))) : null;
        const fixedAll = String(s.dataColors.rule || "");
        const near = (x: string, y: string, d: number) => deltaE2000(toLab(x), toLab(y)) < d;
        const slices = this.entries.filter(e => !e.isOther);
        const isUser = new Set<Entry>();
        const generate: Entry[] = [];
        let k = 0;
        for (const e of slices) {
            const c = e.members[0];
            e.otherPattern = false;
            if (this.hc) { e.color = this.hcBg; continue; }
            if (c.fill || c.rule || fixedAll) { e.color = c.fill || c.rule || fixedAll; isUser.add(e); continue; }
            const idx = k++;
            let base: string | null;
            if (styleCols) base = idx < styleCols.length ? styleCols[idx] : null;
            else if (this.tplEfectiva === "classic") base = idx < CLASSIC.length ? CLASSIC[idx] : null;
            else base = pal?.getColor?.(c.name)?.value ?? null;
            // La paleta se respeta salvo que el color repita uno ya puesto o al vecino anterior (paleta agotada o cíclica).
            const prevC = this.entries[this.entries.indexOf(e) - 1];
            const taken = slices.slice(0, slices.indexOf(e)).map(x => x.color);
            if (base && !taken.some(t => near(t, base, 8)) && !(prevC && !prevC.isOther && near(prevC.color, base, 8))) e.color = base.toUpperCase();
            else { e.color = base || (styleCols ? styleCols[idx % styleCols.length] : CLASSIC[idx % CLASSIC.length]); generate.push(e); }
        }
        const other = this.entries.find(e => e.isOther);
        if (this.hc) { if (other) other.color = this.hcBg; return; }
        // Tonos generados: distinguibles de todo lo visible y de sus vecinos.
        const done = new Set<Entry>(slices.filter(e => generate.indexOf(e) < 0));
        for (const e of generate) {
            const idx = this.entries.indexOf(e);
            const prev = idx > 0 ? this.entries[idx - 1] : null;
            const next = idx < this.entries.length - 1 ? this.entries[idx + 1] : this.entries[0];
            const neigh = [prev, next].filter(x => x && !x.isOther && done.has(x)).map(x => x.color);
            const others = Array.from(done).map(x => x.color);
            let bestC = e.color, bestScore = -Infinity;
            for (const c of colorCandidates(e.color)) {
                const lab = toLab(c);
                const minAll = others.length ? Math.min(...others.map(o => deltaE2000(lab, toLab(o)))) : 99;
                const minNb = neigh.length ? Math.min(...neigh.map(o => deltaE2000(lab, toLab(o)))) : 99;
                if (minAll >= 12 && minNb >= 20) { bestC = c; break; }
                const score = Math.min(minAll / 12, minNb / 20);
                if (score > bestScore) { bestScore = score; bestC = c; }
            }
            e.color = bestC;
            done.add(e);
        }
        if (!other) return;
        // "Otros": el gris del ajuste si el autor lo eligió; si no, el gris neutro más alejado (ΔE) de los sectores.
        const saved = (this.dataView?.metadata?.objects as any)?.slices?.otherColor?.solid?.color;
        const cols = slices.map(e => e.color);
        const dist = (g: string) => (cols.length ? Math.min(...cols.map(c => deltaE2000(toLab(g), toLab(c)))) : 99);
        if (saved) other.color = String(saved);
        else {
            const pref = String(s.slices.otherColor || "#A19F9D");
            const grays = [pref, "#A19F9D", "#C8C6C4", "#8A8886", "#D9D9D9", "#E6E6E6", "#6E6E6E", "#B3B3B3"];
            other.color = dist(pref) >= 20 ? pref : grays.reduce((a, g) => (dist(g) > dist(a) ? g : a), pref);
        }
        other.otherPattern = dist(other.color) < 20;
    }

    // ── Pro: comparación, objetivo, segmentos, paneles ────────────────────────

    /** Funciones Pro que se dibujan: con licencia, o en la vista previa (editando) si el informe las pide. */
    private get cmpOn(): boolean { return !!this.model?.compareCol && this.previewOf("comparison"); }
    private get tgtOn(): boolean { return !!this.model?.targetCol && this.previewOf("targets"); }
    private get segOn(): boolean { return !!this.model?.segmentCol && this.model.segments.length > 0 && !this.segNested && this.previewOf("segments"); }

    /**
     * Jerarquía anidada en Segment (p. ej. Category = Marca, Segment = Familia): cada categoría con valor en un único
     * segmento. El anillo exterior sería una partición inútil (cada sector al 100 % de sí mismo): no se dibuja y,
     * editando, una nota propone intercambiar los campos.
     */
    private computeSegNested(): boolean {
        const m = this.model;
        if (!m?.segmentCol || !m.segments.length) return false;
        let any = false;
        for (const e of this.entries) for (const c of e.members) {
            let n = 0;
            for (const a of c.bySeg.values()) if (a.value > 0) n++;
            if (n > 1) return false;
            if (n === 1) any = true;
        }
        return any;
    }
    private get smOn(): boolean { return !!this.model?.facetCol && this.model.facets.length > 0 && this.previewOf("small multiples"); }
    private get annOn(): boolean { return !!this.model?.annotationCol && this.settings.annotations?.show !== false && this.previewOf("annotations"); }
    /** Columnas Pro que la tabla dibuja de verdad (con su pozo, su licencia o vista previa y su interruptor en Legend). */
    private get proColumns(): boolean {
        const l = this.settings.dataTable ?? {};
        return (this.cmpOn && l.colChange !== false) || (this.tgtOn && l.colTarget !== false) || (this.annOn && l.colNote !== false) || (this.segOn && !!l.segRows);
    }

    /**
     * ¿Se pide la tabla de datos? Off = no; Automatic = con Compare, Target o Annotation en los pozos (o si un informe
     * anterior al 25-11 tenía la leyenda en Content = Table). Que llegue a dibujarse depende además de que tenga columnas.
     */
    private tableWanted(): boolean {
        const pos = String(this.settings.dataTable?.position ?? "auto");
        if (pos === "off") return false;
        if (pos !== "auto" || this.legacyTable) return true;
        const has = (r: string) => !!this.model?.hasRole(r);
        return has("compare") || has("target") || has("annotation");
    }

    /** Informe guardado con la leyenda-tabla anterior (legend.content = table): la tabla sigue encendida. */
    private get legacyTable(): boolean {
        return (this.dataView?.metadata?.objects as any)?.legend?.content === "table";
    }

    /** Columnas de cifras que la tabla dibujaría: sin ninguna no hay tabla (nunca una tabla de una sola columna). */
    private get tableHasData(): boolean {
        const l = this.settings.dataTable ?? {};
        return l.colValue !== false || l.colShare !== false || (this.cmpOn && l.colChange !== false) || (this.tgtOn && l.colTarget !== false);
    }

    private get cmpName(): string { return this.model?.compareCol?.source.displayName ?? ""; }
    private get tgtName(): string { return this.model?.targetCol?.source.displayName ?? ""; }

    /**
     * Cambio frente a Compare with de las filas del donut y de las que salen (gone), con el mismo conjunto de "Otros".
     * Los Δ pp se reparten por resto mayor y suman 0; los miembros de "Otros" reparten el suyo.
     */
    private computeChanges(): void {
        this.goneEntries = [];
        for (const e of this.entries) { e.ch = undefined; e.memberCh = undefined; }
        const m = this.model;
        if (!this.cmpOn || !m) return;
        const gone: Entry[] = m.gone.map(c => ({ key: c.key, name: c.name, value: 0, hl: null, isOther: false, members: [c], pct: 0, color: "",
            memberPct: [], cmp: c.cmp, tgt: null }));
        const all = this.entries.concat(gone);
        const ch = computeChange(all.map(e => e.value), all.map(e => e.cmp));
        all.forEach((e, i) => { e.ch = ch[i]; });
        for (const e of this.entries) if (e.isOther && e.ch) e.memberCh = splitChange(e.ch, e.members.map(c => c.value), e.members.map(c => c.cmp));
        this.goneEntries = gone;
    }

    /** Orden: el de la cabecera pulsada (en memoria) > Sort by change > el de Slices. "Otros" siempre el último. */
    private applySort(): void {
        let col = this.sortCol, dir = this.sortDir;
        if (!col && this.cmpOn && this.settings.compare?.sortByChange) { col = "dpp"; dir = -1; }
        if (!col) return;
        const loc = this.host.locale || "en-US";
        const num = (e: Entry): number => {
            switch (col) {
                case "dpp": return e.ch ? e.ch.dpp10 : 0;
                case "dval": return e.ch ? (e.ch.isNew ? Infinity : e.ch.dval === null ? -Infinity : e.ch.dval) : 0;
                case "tgt": return e.tgt ? e.value / e.tgt : -Infinity;
                default: return e.value;
            }
        };
        const list = this.entries.filter(e => !e.isOther);
        list.sort((a, b) => {
            if (col === "name") return dir * a.name.localeCompare(b.name, loc);
            const x = num(a), y = num(b);
            if (x === y) return b.value - a.value;
            return x > y ? dir : -dir;
        });
        this.entries = list.concat(this.entries.filter(e => e.isOther));
    }

    /**
     * Paneles: uno con el donut total, o uno por valor de Small multiples con el MISMO conjunto de "Otros", orden y colores
     * globales (las filas de cada panel salen de las partes de cada categoría). Vista previa sin licencia: 4 paneles.
     */
    private buildPanels(): PanelDraw[] {
        const m = this.model;
        if (!m || !this.smOn) return [{ index: 0, fkey: null, title: "", entries: this.entries, total: m ? m.total : 0, arcs: [], segArcs: [], geo: null, g: null }];
        const facets = this.isPro ? m.facets : m.facets.slice(0, 4);
        const d = this.pctDec("labels");
        const units = 100 * Math.pow(10, d);
        return facets.map((f, index) => {
            const entries: Entry[] = this.entries.map(e => {
                let v = 0, c = 0, t = 0, h = 0, nc = 0, tOk = true;
                for (const mc of e.members) {
                    const a = mc.byFacet.get(f.key);
                    if (!a) { tOk = false; continue; }
                    v += a.value; c += a.cmp; t += a.tgt; h += a.hl; nc += a.nc;
                    if (!(a.nt > 0 && a.tgt > 0)) tOk = false;
                }
                return { key: e.key, name: e.name, value: Math.max(0, v), hl: m.hasHighlights ? h : null, isOther: e.isOther, members: e.members, pct: 0,
                    color: e.color, otherPattern: e.otherPattern, memberPct: [], cmp: nc ? c : null, tgt: tOk && t > 0 ? t : null };
            });
            const lr = largestRemainder(entries.map(e => e.value), units);
            entries.forEach((e, i) => {
                e.pct = lr.out[i];
                if (e.isOther) e.memberPct = largestRemainder(e.members.map(mc => Math.max(0, mc.byFacet.get(f.key)?.value ?? 0)), e.pct).out;
            });
            if (this.cmpOn) {
                const goneV = m.gone.map(gc => gc.byFacet.get(f.key)?.cmp ?? 0).filter(x => x > 0);
                const ch = computeChange(entries.map(e => e.value).concat(goneV.map(() => 0)), (entries.map(e => e.cmp) as (number | null)[]).concat(goneV));
                entries.forEach((e, i) => { e.ch = ch[i]; });
            }
            return { index, fkey: f.key, title: f.name, entries, total: entries.reduce((s, e) => s + e.value, 0), arcs: [], segArcs: [], geo: null, g: null };
        });
    }

    /**
     * Segmentos de una categoría (en el anillo exterior, la leyenda, la tabla, el teclado y la selección): los que tienen
     * valor, en el orden del campo; con más de SEG_MAX + 1, los SEG_MAX mayores y el resto en un «Other (n)» propio de
     * la categoría. Miles de arcos no se ven ni se pueden leer (Detalle: 1.746 PDV por SKU). Una pasada por los mapas
     * bySeg de sus miembros; se calcula una vez por update.
     */
    private segListOf(e: Entry): { sd: Dim; keys: string[] }[] {
        let l = this.segLists.get(e.key);
        if (l) return l;
        const m = this.model;
        if (!this.segOrder) {
            this.segOrder = new Map();
            this.segDims = new Map();
            m.segments.forEach((sd, i) => { this.segOrder.set(sd.key, i); this.segDims.set(sd.key, sd); });
        }
        const tot = new Map<string, number>();
        for (const c of e.members) for (const [k, a] of c.bySeg) if (a.value > 0) tot.set(k, (tot.get(k) ?? 0) + a.value);
        const ord = (k: string) => this.segOrder.get(k) ?? 0;
        let top = Array.from(tot.keys());
        let rest: string[] = [];
        if (top.length > SEG_MAX + 1) {
            top.sort((a, b) => tot.get(b) - tot.get(a) || ord(a) - ord(b));
            rest = top.slice(SEG_MAX);
            top = top.slice(0, SEG_MAX);
        }
        top.sort((a, b) => ord(a) - ord(b));
        l = top.map(k => ({ sd: this.segDims.get(k), keys: [k] }));
        if (rest.length) l.push({ sd: { key: SEG_OTHER, name: this.t("UI_Other", "Other") + " (" + rest.length + ")" }, keys: rest });
        this.segLists.set(e.key, l);
        return l;
    }

    /** Valores de cada segmento de una fila (en un panel o en total) y sus % por resto mayor dentro de los de la fila. */
    private segSplit(e: Entry, fkey: string | null, units: number): { sd: Dim; v: number; h: number; pct: number }[] {
        const ck = e.key + "|" + (fkey ?? "");
        let base = this.splitCache.get(ck);
        if (!base) {
            base = this.segListOf(e).map(it => {
                let v = 0, h = 0;
                for (const c of e.members) for (const k of it.keys) {
                    const a = fkey !== null ? c.parts.get(fkey + "␟" + k) : c.bySeg.get(k);
                    if (a) { v += a.value; h += a.hl; }
                }
                return { sd: it.sd, v: Math.max(0, v), h };
            });
            this.splitCache.set(ck, base);
        }
        const lr = largestRemainder(base.map(x => x.v), units).out;
        return base.map((x, i) => ({ sd: x.sd, v: x.v, h: x.h, pct: lr[i] }));
    }

    /** Tono de un segmento: el color de su categoría mezclado con el fondo, más claro cuanto más atrás va el segmento. */
    private segColor(base: string, i: number, n: number): string {
        if (this.hc) return this.hcBg;
        const t = n <= 1 ? 0.3 : 0.18 + 0.5 * i / (n - 1);
        const a = rgbOf(base), b = rgbOf(this.look ? this.look.bg : this.bgColor);
        return "#" + a.map((x, k) => Math.round(x + (b[k] - x) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
    }

    private static pairKey(entryKey: string, segKey: string): string { return entryKey + "␞" + segKey; }

    /**
     * Selección por panel (small multiples, como los nativos): «␜panel␜clave» = la clave (categoría, par o miembro de
     * Otros) solo en las filas de ese panel. Sin prefijo, la clave en todos los paneles (leyenda, tabla del Total).
     */
    private static scoped(fkey: string, key: string): string { return "␜" + fkey + "␜" + key; }
    private static unscope(key: string): { fkey: string | null; inner: string } {
        if (key.charAt(0) !== "␜") return { fkey: null, inner: key };
        const j = key.indexOf("␜", 1);
        return { fkey: key.slice(1, j), inner: key.slice(j + 1) };
    }
    /** Claves que valen en un panel: las globales y las de ese panel, sin prefijo. */
    private keysIn(fkey: string | null): Set<string> {
        const out = new Set<string>();
        for (const k of this.selKeys) {
            const u = Visual.unscope(k);
            if (u.fkey === null || u.fkey === fkey) out.add(u.inner);
        }
        return out;
    }

    private pairOf(key: string | null): { e: Entry; sd: Dim; si: number } | null {
        if (!key || key.indexOf("␞") < 0 || !this.model) return null;
        const i = key.indexOf("␞");
        const e = this.entryOf(key.slice(0, i));
        const sk = key.slice(i + 1);
        if (!e) return null;
        const l = this.segListOf(e);
        const si = l.findIndex(it => it.sd.key === sk);
        return si >= 0 ? { e, sd: l[si].sd, si } : null;
    }

    /** Las PREVIEW_TOP mayores categorías con nombre, solo en la vista previa sin licencia con alguna función de datos Pro. */
    private computePreviewKeys(): Set<string> | null {
        if (this.isPro || !this.proPreview) return null;
        const t = this.attemptedProFeatures().touched;
        if (!["comparison", "targets", "segments", "annotations"].some(f => t.has(f))) return null;
        return new Set(this.entries.filter(e => !e.isOther).slice().sort((a, b) => b.value - a.value).slice(0, PREVIEW_TOP).map(e => e.key));
    }

    /** ¿Lleva el dato Pro esta clave (categoría, miembro de Otros o par)? Con licencia, siempre. */
    private pv(key: string | null | undefined): boolean {
        if (!this.previewKeys) return true;
        if (!key) return false;
        const inner = Visual.unscope(key).inner;
        const i = inner.indexOf("␞");
        return this.previewKeys.has(i >= 0 ? inner.slice(0, i) : inner);
    }

    /**
     * Decimales de % of target (para todo el visual: tabla, tooltip, voz): 0 salvo que hagan falta para que el número no
     * contradiga su símbolo (Met at 99,5: «✕ 99%» junto a «✓ 99%»). Se busca el mínimo, hasta 2, con el que: un ✓ no
     * baja de Met at, un ≈ no baja de Close at y dos estados distintos nunca muestran la misma cifra. Siempre truncado:
     * un ✕ o un ≈ nunca enseñan el umbral alcanzado.
     */
    private computeTgtDec(): number {
        if (!this.tgtOn) return 0;
        const met = Number(this.settings.target?.metAt) || 100;
        const close = Math.min(met, Number(this.settings.target?.closeAt) || 90);
        const vals: { pct: number; g: string }[] = [];
        const add = (v: number, t: number | null) => { const st = this.tgtStatus(v, t); if (st) vals.push({ pct: st.pct, g: st.glyph }); };
        for (const e of this.entries) {
            if (!this.pv(e.key)) continue;
            add(e.value, e.tgt);
            if (e.isOther) for (const c of e.members) add(c.value, c.tgt !== null && c.tgt > 0 ? c.tgt : null);
        }
        for (let d = 0; d <= 2; d++) {
            const f = Math.pow(10, d);
            const seen = new Map<number, string>();
            let ok = true;
            for (const x of vals) {
                const t = this.truncTgt(x.pct, d) / f;
                if ((x.g === "✓" && t < met) || (x.g === "≈" && t < close)) { ok = false; break; }
                const prev = seen.get(t);
                if (prev !== undefined && prev !== x.g) { ok = false; break; }
                seen.set(t, x.g);
            }
            if (ok) return d;
        }
        return 2;
    }

    private fmtTgt(pct: number): string {
        return this.fmtPct(this.truncTgt(pct, this.tgtDec), this.tgtDec);
    }

    /**
     * % of target truncado a d decimales (en unidades de 10^-d) con tolerancia al ruido (coma flotante y plan redondeado:
     * 103,99999… →
     * 104), sin cruzar nunca hacia arriba el umbral de su estado: un ≈ sigue por debajo de Met at y un ✕ por debajo de
     * Close at (99,9999999 % con Met at 100 sigue siendo ≈ 99).
     */
    private truncTgt(pct: number, d: number): number {
        const f = Math.pow(10, d);
        const met = Number(this.settings.target?.metAt) || 100;
        const close = Math.min(met, Number(this.settings.target?.closeAt) || 90);
        // Tolerancia de 0,0001 puntos: el plan redondeado a 1 decimal y sumado por filas deja errores de ~1e-5 puntos
        // (Aigua Serena: 103,9999927 %); 1e-6 no bastaba.
        const tol = Math.floor((pct + 1e-4) * f);
        const thr = pct >= met ? null : pct >= close ? met : close;
        return thr !== null && tol / f >= thr ? Math.floor(pct * f) : tol;
    }

    /** Estado frente al objetivo: ✓ (≥ Met at) · ≈ (≥ Close at) · ✕; forma y color. null sin objetivo. */
    private tgtStatus(v: number, t: number | null): { pct: number; glyph: string; color: string; word: string } | null {
        if (t === null || !(t > 0)) return null;
        const met = Number(this.settings.target?.metAt) || 100;
        const close = Math.min(met, Number(this.settings.target?.closeAt) || 90);
        const pct = v / t * 100;
        const look = this.look;
        // El % se enseña truncado (Math.floor en quien lo pinta): un ≈ nunca sale como «100 %» (Nord 0,0: 99,5 %).
        if (pct >= met) return { pct, glyph: "✓", color: this.hc ? this.hcFg : (look ? look.up : "#107C10"), word: this.t("UI_Met", "met") };
        if (pct >= close) return { pct, glyph: "≈", color: this.hc ? this.hcFg : "#B86E00", word: this.t("UI_Close", "close") };
        return { pct, glyph: "✕", color: this.hc ? this.hcFg : (look ? look.down : "#C4314B"), word: this.t("UI_Miss", "below") };
    }

    private fmtPP(d10: number): string {
        const s = d10 > 0 ? "+" : d10 < 0 ? "−" : "";
        try {
            return s + new Intl.NumberFormat(this.host.locale || "en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(d10) / 10);
        } catch { return s + (Math.abs(d10) / 10).toFixed(1); }
    }

    private fmtSignedPct(x: number): string {
        const r = Math.round(x * 1000);
        const s = r > 0 ? "+" : r < 0 ? "−" : "";
        try {
            return s + new Intl.NumberFormat(this.host.locale || "en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(r) / 1000);
        } catch { return s + (Math.abs(r) / 10).toFixed(1) + "%"; }
    }

    private chgText(ch: Change, which: "pp" | "val"): string {
        if (ch.isNew) return this.t("UI_New", "new");
        if (ch.isGone) return this.t("UI_Gone", "gone");
        if (which === "pp") return this.fmtPP(ch.dpp10);
        return ch.dval === null ? "—" : this.fmtSignedPct(ch.dval);
    }

    private mixText(ch: Change): string {
        return ch.dpp10 < 0 ? this.t("UI_MixUp", "Value up but share down: the total grew faster")
            : this.t("UI_MixDown", "Value down but share up: the total fell faster");
    }

    /** Total del objetivo (todas las categorías con objetivo) y si no coincide con el real (más de un 0,5 %). */
    private targetTotals(): { tgt: number; mismatch: boolean } {
        const m = this.model;
        const tgt = m ? m.cats.reduce((s, c) => s + (c.tgt !== null && c.tgt > 0 ? c.tgt : 0), 0) : 0;
        return { tgt, mismatch: !!m && tgt > 0 && m.total > 0 && Math.abs(tgt - m.total) / m.total > 0.005 };
    }

    private cmpTotal(): number {
        const m = this.model;
        if (!m) return 0;
        return m.cats.concat(m.gone).reduce((s, c) => s + (c.cmp !== null && c.cmp > 0 ? c.cmp : 0), 0);
    }

    // ── Notas bajo la tabla ──────────────────────────────────────────────────

    /**
     * Notas al pie. Regla (Tino, 25-11): una nota solo sale si lo que explica está a la vista.
     *  - Excluded (negativos, blancos, ceros) y filas incompletas o cargando: siempre (afectan al dibujo entero).
     *  - Redondeo a 100 %: hoy no sale (SHOW_ROUNDED_NOTE); si se activa, solo con porcentajes visibles.
     *  - ⚠ de mezcla: solo por cada fila con ⚠ dibujado, con su nombre y el sentido («⚠ Zumos: value up, share down»).
     *  - new / gone: solo si la tabla enseña esas marcas.
     *  - El aviso «Target total ≠ actual» se retira: el % de objetivo de cada categoría no depende de él y el total ya
     *    se compara con la suma de objetivos; al lector no le añadía nada.
     * Footnotes = Off las quita todas; los avisos de configuración (solo editando) se quedan.
     */
    private notesList(v: { pct: boolean; mix?: { name: string; ch: Change }[]; tags?: boolean }): string[] {
        const m = this.model;
        if (!m) return [];
        const out: string[] = [];
        if (this.settings.footnotes?.show !== "off") {
            const ex = m.excluded;
            const parts: string[] = [];
            if (ex.negative) parts.push(this.tf("UI_ExNeg", "{0} negative ({1})", this.int(ex.negative), this.fmtCompact(ex.negativeSum, m.format)));
            if (ex.blank) parts.push(this.tf("UI_ExBlank", "{0} blank", this.int(ex.blank)));
            if (ex.zero) parts.push(this.tf("UI_ExZero", "{0} zero", this.int(ex.zero)));
            if (parts.length) out.push(this.tf("UI_Excluded", "Excluded: {0}", parts.join(", ")));
            if (this.moreState === "incomplete") out.push(this.tf("UI_Incomplete", "Showing {0} rows; Other is incomplete", this.int(m.rowCount)));
            else if (this.moreState === "loading") out.push(this.tf("UI_Loading", "Loading more rows: {0} so far", this.int(m.rowCount)));
            if (SHOW_ROUNDED_NOTE && v.pct && this.roundedNote) out.push(this.t("UI_Rounded", "Percentages rounded to add up to 100%"));
            const up = (v.mix ?? []).filter(x => (x.ch.dval ?? 0) > 0).map(x => x.name);
            const down = (v.mix ?? []).filter(x => !((x.ch.dval ?? 0) > 0)).map(x => x.name);
            if (up.length) out.push(this.tf("UI_MixUp", "⚠ {0}: value up, share down", up.join(", ")));
            if (down.length) out.push(this.tf("UI_MixDown", "⚠ {0}: value down, share up", down.join(", ")));
            if (v.tags) out.push(this.tf("UI_NewNote", "new: no value in {0} · gone: no value now", this.cmpName));
        }
        if (this.previewKeys) out.push(this.tf("UI_PreviewTop", "Pro preview: first {0} categories", String(PREVIEW_TOP)));
        if (this.editing && this.segNested && this.previewOf("segments")) {
            const cat = m.categoryName, seg = m.segmentCol.source.displayName;
            out.push(this.tf("UI_SegNested", "Each {0} belongs to one {1}: put {1} in Category and {0} in Segment", cat, seg));
        }
        // Muchas categorías y poco peso con nombre: un donut no es la forma (solo editando, como el aviso de anidado).
        const other = this.entries.find(e => e.isOther);
        if (this.editing && other && m.cats.length > 20) {
            const units = 100 * Math.pow(10, this.pctDec("labels"));
            const named = this.entries.filter(e => !e.isOther);
            const namedPct = named.reduce((a, e) => a + e.pct, 0);
            if (namedPct < units * 0.5 || other.pct > units * 0.6) {
                out.push(this.tf("UI_ManyCats", "{0} categories: the top {1} hold {2}. A bar chart or treemap reads this better.",
                    this.int(m.cats.length), String(named.length), this.fmtPct(namedPct)));
            }
        }
                if (this.editing && m.annotationCol && m.annotationNotText > 0) out.push(this.t("UI_NotesNotText", "Annotations expects text: set the field to First"));
        return out;
    }

    /** ¿Las etiquetas enseñan porcentajes? (para la nota de redondeo cuando no hay tabla). */
    private get labelsShowPct(): boolean {
        const s = this.settings;
        if (!s.labels.show) return false;
        const c = String(s.labels.content);
        return c !== "value" && c !== "name";
    }

    /** Estilo de las notas al pie (Footnotes): tamaño con la k común, fuente y color propios. */
    private styleFootnotes(el: HTMLElement, maxFs?: number): void {
        const f = this.settings.footnotes ?? {};
        let fs = Math.max(this.minFs, this.fz(Number(f.fontSize) || 9));
        if (maxFs !== undefined) fs = Math.max(this.minFs, Math.min(fs, maxFs));
        el.style.fontSize = fs + "px";
        el.style.color = this.hc ? this.hcFg : String(f.color || this.mutedInk);
        Visual.styleFont(el, this.fontOf("footnotes"));
    }

    // ── Disposición ──────────────────────────────────────────────────────────

    /**
     * Disposición: Summary arriba; después la leyenda clásica (por fuera) y la tabla de datos (dentro del hueco que deja),
     * cada una con su posición; el donut ocupa lo que queda. Sin tabla, los avisos van al pie.
     */
    private layoutAndDraw(W: number, H: number): void {
        const s = this.settings;
        const pad = Math.max(2, Math.round(4 * this.k));
        const top0 = this.drawSummary(W, H, pad);
        let ax = pad, ay = top0 + pad;
        let aw = W - 2 * pad, ah = H - top0 - 2 * pad;
        type Fit = { el: HTMLDivElement; w: number; h: number; score: number; fs: number; lines?: number };
        const place = (t: Fit, pos: string) => {
            t.el.setAttribute("data-pos", pos);
            if (pos === "right" || pos === "left") {
                t.el.style.left = (pos === "right" ? ax + aw - t.w : ax) + "px";
                t.el.style.top = (ay + Math.max(0, Math.round((ah - t.h) / 2))) + "px";
                if (pos === "left") ax += t.w + pad;
                aw -= t.w + pad;
            } else {
                t.el.style.top = (pos === "bottom" ? ay + ah - t.h : ay) + "px";
                t.el.style.left = (ax + Math.max(0, Math.round((aw - t.w) / 2))) + "px";
                if (pos === "top") ay += t.h + pad;
                ah -= t.h + pad;
            }
        };
        // Leyenda clásica. Automatic: arriba en línea si cabe en dos líneas sin plegar; si no, al lado en un visual ancho
        // (el hueco sobrante es horizontal) o arriba partida en líneas en uno alto (el sobrante es vertical).
        let lpos = String(s.legend.position);
        if (lpos !== "off") {
            let t: Fit | null;
            if (lpos === "auto") {
                t = this.fitLegend("top", aw + 2 * pad, ah + 2 * pad, pad);
                lpos = "top";
                if ((!t || t.score > 0 || (t.lines ?? 1) > 2) && aw / Math.max(1, ah) >= 1.3) {
                    const alt = this.fitLegend("right", aw + 2 * pad, ah + 2 * pad, pad);
                    if (alt && (!t || alt.score <= t.score)) { if (t) t.el.remove(); t = alt; lpos = "right"; }
                    else if (alt) alt.el.remove();
                }
            } else t = this.fitLegend(lpos, aw + 2 * pad, ah + 2 * pad, pad);
            if (t) { this.legendEl = t.el; this.legendFs = t.fs; place(t, lpos); }
        }
        // Tabla de datos.
        if (this.tableWanted()) {
            let tpos = String(s.dataTable.position);
            const auto = tpos === "auto";
            if (auto) tpos = aw / Math.max(1, ah) >= 1.3 ? "right" : "bottom";
            // Con small multiples la tabla no puede dejar los paneles por debajo de un radio mínimo: su caja se limita
            // a lo que sobra y, si no cabe, recorta según su orden (o pasa a la otra posición en Automático).
            const cap = (pos: string) => this.smOn ? this.smTableCap(pos, aw, ah, pad) : Infinity;
            let t: Fit | null = this.fitTable(tpos, aw + 2 * pad, ah + 2 * pad, pad, cap(tpos));
            // Con columnas Pro (o paneles), en Automático se prueba también la otra posición y gana la que menos recorta.
            if (auto && (this.proColumns || this.smOn) && (!t || t.score > 0)) {
                const otra = tpos === "right" ? "bottom" : "right";
                const alt = this.fitTable(otra, aw + 2 * pad, ah + 2 * pad, pad, cap(otra));
                if (alt && (!t || alt.score < t.score)) { if (t) t.el.remove(); t = alt; tpos = otra; }
                else if (alt) alt.el.remove();
            }
            // Si con el radio mínimo de los paneles la tabla no cabe en ninguna posición (visual pequeño o muchos paneles),
            // se dibuja como antes, sin límite: mejor paneles pequeños que perder la tabla del total.
            if (!t && this.smOn && this.tableHasData) {
                t = this.fitTable(tpos, aw + 2 * pad, ah + 2 * pad, pad);
                if (auto && (!t || t.score > 0)) {
                    const otra = tpos === "right" ? "bottom" : "right";
                    const alt = this.fitTable(otra, aw + 2 * pad, ah + 2 * pad, pad);
                    if (alt && (!t || alt.score < t.score)) { if (t) t.el.remove(); t = alt; tpos = otra; }
                    else if (alt) alt.el.remove();
                }
            }
            if (t) { this.tableEl = t.el; this.tableFs = t.fs; place(t, tpos); }
        }
        if (!this.tableEl) {
            // Sin tabla no hay ⚠ ni marcas new/gone dibujadas: solo lo que afecta al dibujo y el redondeo si hay % en etiquetas.
            const notes = this.notesList({ pct: this.labelsShowPct });
            if (notes.length) {
                const n = document.createElement("div");
                n.className = "dn-notes";
                Object.assign(n.style, { left: ax + "px", width: aw + "px" });
                this.styleFootnotes(n);
                for (const t of notes) { const d = document.createElement("div"); d.textContent = t; n.appendChild(d); }
                this.root.appendChild(n);
                const h = n.offsetHeight;
                n.style.top = (ay + ah - h) + "px";
                ah -= h + pad;
            }
        }
        const defs = this.svg.append("defs") as unknown as Sel<SVGDefsElement>;
        this.ensurePatterns(defs);
        if (this.smOn) this.drawGrid(Math.max(0, ax), Math.max(0, ay), Math.max(0, aw), Math.max(0, ah));
        else this.drawDonut(this.panels[0], Math.max(0, ax), Math.max(0, ay), Math.max(0, aw), Math.max(0, ah));
        this.geo = this.panels[0]?.geo ?? null;
        this.arcs = this.panels[0]?.arcs ?? [];
    }

    /**
     * Escala de pantalla del host (zoom del informe o transform: scale de un contenedor): getBoundingClientRect mide en
     * píxeles de pantalla; el diseño va en píxeles CSS. Todas las medidas de cajas se dividen por ella.
     */
    private get zoom(): number {
        const w = this.root.offsetWidth;
        const z = w > 0 ? this.root.getBoundingClientRect().width / w : 1;
        return isFinite(z) && z > 0 ? z : 1;
    }

    private boxW(el: HTMLElement): number { return el.getBoundingClientRect().width / this.zoom; }
    private boxH(el: HTMLElement): number { return el.getBoundingClientRect().height / this.zoom; }

    /**
     * Radio mínimo de los paneles de small multiples a tamaño de informe (Tino, vídeo a 1040×576: donuts de ~60 px con
     * la tabla al lado): el 13 % del lado menor del visual, entre 32 y 80 px.
     */
    private get smMinR(): number { return Math.max(32, Math.min(80, Math.min(this.W, this.H) * 0.13)); }

    /**
     * Lo que puede ocupar la tabla (ancho si va al lado, alto si va abajo) dejando a los paneles su radio mínimo, con la
     * mejor rejilla posible en el hueco que queda.
     */
    private smTableCap(pos: string, aw: number, ah: number, pad: number): number {
        const sm = this.settings.smallMultiples;
        const n = Math.max(1, this.model?.facets.length ?? 1);
        // Radio de la celda: el mínimo del donut más lo que se reserva alrededor (anillo de escala e iconos del objetivo).
        const r0 = this.smMinR;
        const R = r0 + (this.settings.scaleRing.mode !== "off" ? Math.max(3, Math.round(r0 * 0.06)) + 2 : 0) + this.iconSpaceFor(r0 * 1.2);
        const gap = Math.max(0, Math.min(40, Number(sm.gap))) * Math.min(1, this.k);
        const th = Math.max(10, this.minFs, this.fz(Number(sm.titleFontSize))) * 1.3 + Math.max(2, Math.round(3 * this.k));
        const cellW = 2 * R + 6, cellH = 2 * R + 6 + th;
        const side = pos === "right" || pos === "left";
        let best = Infinity;
        const fixed = Number(sm.columns) >= 1 ? Math.min(n, Math.round(Number(sm.columns))) : 0;
        for (let c = fixed || 1; c <= (fixed || n); c++) {
            const rows = Math.ceil(n / c);
            const needW = c * cellW + gap * (c - 1), needH = rows * cellH + gap * (rows - 1);
            if (side && needH <= ah) best = Math.min(best, needW);
            if (!side && needW <= aw) best = Math.min(best, needH);
        }
        // Si ni sin tabla caben los paneles al radio mínimo (muchos paneles o visual pequeño), la rejilla ya enseña los que
        // caben («Showing N of M»): la tabla no se limita.
        if (!isFinite(best)) return Infinity;
        return Math.floor((side ? aw : ah) - best - pad);
    }

    /** Summary: Automatic = encendida si hay Compare en los pozos. */
    private get summaryOn(): boolean {
        const m = String(this.settings.summary?.show ?? "auto");
        return m === "on" || (m === "auto" && !!this.model?.hasRole("compare"));
    }

    /**
     * Frase de resumen con los números que enseña el visual (cuotas por resto mayor, las de las etiquetas): la mayor
     * cuota, el peso de las tres primeras y, con Pro (o su vista previa, como las columnas), el mayor movimiento en pp
     * frente a Compare y cuántas categorías no llegan al objetivo. Plantillas completas por idioma (sin concatenar
     * palabras sueltas). Con small multiples, una sola frase para el total. Devuelve las oraciones.
     */
    private summarySentences(): string[] {
        const reales = this.entries.filter(e => !e.isOther).slice().sort((a, b) => b.value - a.value);
        if (!reales.length) return [];
        const out: string[] = [];
        const top = reales[0];
        out.push(this.tf("UI_SumLead", "{0} leads with {1} of the total.", top.name, this.fmtPct(top.pct)));
        if (this.entries.length >= 4 && reales.length >= 3) {
            out.push(this.tf("UI_SumTop3", "The top three add up to {0}.", this.fmtPct(reales.slice(0, 3).reduce((a, e) => a + e.pct, 0))));
        }
        if (this.cmpOn) {
            const mov = this.entries.filter(e => this.pv(e.key) && e.ch && !e.ch.isNew && !e.ch.isGone && e.ch.dpp10 !== 0)
                .sort((a, b) => Math.abs(b.ch.dpp10) - Math.abs(a.ch.dpp10))[0];
            if (mov) out.push(this.tf("UI_SumMove", "Biggest shift vs {0}: {1}, {2} pp.", this.cmpName, mov.name, this.fmtPP(mov.ch.dpp10)));
        }
        if (this.tgtOn) {
            const st = this.entries.filter(e => this.pv(e.key)).map(e => this.tgtStatus(e.value, e.tgt)).filter(x => !!x);
            if (st.length) {
                // Fallo = ✕ (el criterio de Status on slices = Misses only); ≈ es «en el objetivo dentro de la tolerancia».
                const n = String(st.length);
                const miss = st.filter(x => x.glyph === "✕").length, met = st.filter(x => x.glyph === "✓").length;
                out.push(miss === 1 ? this.tf("UI_SumTgtOne", "1 of {0} categories misses the target.", n)
                    : miss > 1 ? this.tf("UI_SumTgtMany", "{0} of {1} categories miss the target.", String(miss), n)
                        : met === st.length ? this.tf("UI_SumTgtAll", "All {0} categories meet the target.", n)
                            : met === 0 ? this.tf("UI_SumTgtNear", "All {0} categories are near the target.", n)
                                : this.tf("UI_SumTgtMix", "On target: {0} of {1}; near it: {2}.", String(met), n, String(st.length - met)));
            }
        }
        return out;
    }

    /**
     * Dibuja Summary arriba (hasta dos líneas). Letra con la norma de la tabla: k común y nunca bajo 10 px. Si no cabe,
     * solo la primera oración; si tampoco, nada. La frase completa va también al aria-label (misma lectura en voz alta).
     * Devuelve el alto ocupado (con su margen).
     */
    private drawSummary(W: number, H: number, pad: number): number {
        if (!this.summaryOn) return 0;
        const ss = this.summarySentences();
        if (!ss.length) return 0;
        const s = this.settings;
        const fs = Math.max(10, this.minFs, this.fz(Number(s.summary.fontSize)));
        const maxH = Math.min(Math.ceil(fs * 1.3 * 2) + 1, Math.floor(H * 0.22));
        const el = document.createElement("div");
        el.className = "dn-summary";
        Object.assign(el.style, { left: pad + "px", top: pad + "px", width: (W - 2 * pad) + "px", fontSize: fs + "px",
            color: this.hc ? this.hcFg : String(s.summary.color || this.ink) });
        el.setAttribute("aria-hidden", "true");
        Visual.styleFont(el, this.fontOf("summary"));
        this.root.appendChild(el);
        for (const text of [ss.join(" "), ss[0]]) {
            el.textContent = text;
            if (el.offsetHeight <= maxH && el.scrollWidth <= W - 2 * pad + 1) {
                el.setAttribute("data-full", String(text === ss.join(" ") || ss.length === 1));
                const lab = this.root.getAttribute("aria-label") || "";
                this.root.setAttribute("aria-label", lab + ". " + ss.join(" "));
                return el.offsetHeight + pad;
            }
        }
        el.remove();
        return 0;
    }

    /**
     * Border (FC.PROP04): con el interruptor encendido, color fijo o regla fx (la primera con valor); vacío = el fondo del
     * visual o del estilo. null = sin borde (apagado o alto contraste, que pone su propio trazo).
     */
    private get borderColor(): string | null {
        if (this.hc || !this.settings.slices?.border) return null;
        const fixed = String(this.settings.slices?.borderColor || "");
        if (fixed) return fixed;
        for (const cc of this.dataView?.categorical?.categories ?? []) for (const o of (cc.objects ?? []) as any[]) {
            const v = o?.slices?.borderColor?.solid?.color;
            if (v) return String(v);
        }
        return this.bgColor;
    }

    /** Separación radial entre el anillo de categorías y el de segmentos: el hueco (Space between slices), con su mínimo de siempre. */
    private ringSep(R: number): number {
        const gap = Number(this.settings.slices?.gap) || 0;
        return gap > 0 ? Math.max(gap, 1.5, Math.min(3, R * 0.02)) : 0;
    }

    private get mutedInk(): string {
        if (this.hc) return this.hcFg;
        if (this.look) return this.look.axis;
        return (this.host.colorPalette as any)?.foregroundNeutralSecondary?.value ?? "#605E5C";
    }

    /**
     * La leyenda-tabla en su sitio. El reparto de espacio sale del contenido: con más columnas el donut cede ancho. La
     * letra escala como las etiquetas (k común) y no baja de 0,9 × su base escalada mientras quede otra salida: primero
     * se quita lo accesorio (nota de redondeo, "Otros" desplegado, cifras completas, filas de segmento, notas, total y
     * cabecera), después las columnas (minibarra, segunda columna de cambio), y solo entonces la letra baja hasta el
     * mínimo y se pliegan las últimas filas en "+N more · x %" (suma 100, sin "…"). score = cuánto se ha recortado,
     * con más peso cuanto peor (letra bajo el suelo > columnas > filas): en Automático gana la posición que menos recorta.
     */
    private fitTable(pos: string, W: number, H: number, pad: number, cap = Infinity): { el: HTMLDivElement; w: number; h: number; score: number; fs: number } | null {
        const s = this.settings;
        const mini = W < 200 || H < 140;
        const pro = this.proColumns;
        const side = pos === "right" || pos === "left";
        const maxW = Math.min(side ? Math.floor(W * (mini ? 0.55 : pro ? 0.64 : 0.5)) : W - 2 * pad, side ? cap : Infinity);
        const maxH = Math.min(side ? H - 2 * pad : Math.floor(H * (mini ? 0.6 : pro ? 0.56 : 0.5)), side ? Infinity : cap);
        if (maxW < 40 || maxH < 12) return null;
        if (!this.tableHasData) return null;
        const fs0 = this.fz(Number(s.dataTable.fontSize));
        const floorFs = Math.max(this.minFs, Math.round(fs0 * 0.9 * 2) / 2);
        const o: TableOpts = {
            fs: fs0, expanded: this.otherExpanded, fold: 0, compact: false,
            header: !!s.dataTable.header, total: s.dataTable.totalRow === "on" || (s.dataTable.totalRow === "auto" && s.slices.shape === "pie"),
            rounded: true, segRows: !!s.dataTable.segRows, ann: s.dataTable.colNote !== false, bar: true, second: true,
        };
        let score = 0;
        let el: HTMLDivElement | null = null;
        for (let iter = 0; iter < 120; iter++) {
            el = this.buildTable(o);
            el.style.visibility = "hidden";
            el.style.left = "0px"; el.style.top = "0px";
            el.style.width = "max-content";
            this.root.appendChild(el);
            let w = Math.ceil(this.boxW(el));
            if (w > maxW) { el.style.width = maxW + "px"; w = maxW; }
            const h = Math.ceil(this.boxH(el));
            const fitsW = el.scrollWidth <= w + 1;
            if (h <= maxH && fitsW) {
                el.style.visibility = "";
                el.style.width = w + "px";
                return { el, w, h, score: score + (fs0 - o.fs), fs: o.fs };
            }
            el.remove();
            if (o.fs > floorFs) { o.fs = Math.max(floorFs, o.fs - 0.5); continue; }
            if (o.rounded && this.roundedNote) { o.rounded = false; score += 5; continue; }
            if (o.expanded) { o.expanded = false; score += 5; continue; }
            if (!o.compact) { o.compact = true; score += 10; continue; }
            if (o.segRows && this.segOn) { o.segRows = false; score += 20; continue; }
            if (o.ann && this.annOn) { o.ann = false; score += 20; continue; }
            if (mini && o.header) { o.header = false; score += 20; continue; }
            if (o.total) { o.total = false; score += 20; continue; }
            if (o.header) { o.header = false; score += 30; continue; }
            const chgCol = this.cmpOn && s.dataTable.colChange !== false;
            if (o.bar && chgCol) { o.bar = false; score += 100; continue; }
            if (o.second && chgCol && s.compare.changeShown === "both") { o.second = false; score += 100; continue; }
            if (o.fs > this.minFs) { o.fs = Math.max(this.minFs, o.fs - 0.5); score += 1000; continue; }
            if (o.fold < this.entries.length - 1) { o.fold = o.fold === 0 ? 2 : o.fold + 1; score += 200; continue; }
            break;
        }
        return null;
    }

    /**
     * Leyenda compacta (Content = Legend): muestra + nombre, como la nativa. Arriba/abajo fluye en horizontal y parte en
     * varias líneas; a izquierda/derecha, lista vertical. La letra sigue las normas de la tabla (k común, nunca bajo
     * 10 px ni bajo el mínimo de Accessibility, y las etiquetas nunca la superan). Un nombre que no cabe se recorta con
     * elipsis (el tooltip del elemento lo da entero); no se quita ningún elemento salvo, al final, "+N more" si no caben.
     */
    private fitLegend(pos: string, W: number, H: number, pad: number): { el: HTMLDivElement; w: number; h: number; score: number; fs: number; lines: number } | null {
        const s = this.settings;
        const side = pos === "right" || pos === "left";
        const mini = W < 200 || H < 140;
        const fs = Math.max(10, this.minFs, this.fz(Number(s.legend.fontSize)));
        const maxW = side ? Math.floor(W * (mini ? 0.45 : 0.36)) : W - 2 * pad;
        const maxH = side ? H - 2 * pad : Math.floor(H * (mini ? 0.42 : 0.3));
        if (maxW < fs * 3 || maxH < fs * 1.3) return null;
        const n = this.entries.length;
        // Primero con los segmentos de cada categoría; si no caben, sin ellos; después se pliegan las últimas en «+N more»,
        // pero nunca por debajo de los K sectores con nombre (si ni eso cabe, se recorta el alto: nunca solo «+N more»).
        const keepMin = Math.min(MIN_NAMED, n);
        const maxFold = n - keepMin;
        const tries: [boolean, number][] = [];
        if (this.segOn) tries.push([true, 0]);
        tries.push([false, 0]);
        for (let f = 2; f <= maxFold; f++) tries.push([false, f]);
        let last: { el: HTMLDivElement; w: number; h: number; lines: number; fold: number } | null = null;
        for (const [withSeg, fold] of tries) {
            const el = this.buildLegend(side, fs, fold, maxW, false, withSeg);
            el.style.visibility = "hidden";
            el.style.left = "0px"; el.style.top = "0px";
            el.style.width = "max-content";
            this.root.appendChild(el);
            let w = Math.ceil(this.boxW(el));
            if (w > maxW) { el.style.width = maxW + "px"; w = maxW; }
            const h = Math.ceil(this.boxH(el));
            if (h <= maxH) {
                el.style.visibility = "";
                el.style.width = w + "px";
                const tops = new Set(Array.from(el.querySelectorAll<HTMLElement>(".dn-li")).map(x => Math.round(x.getBoundingClientRect().top / this.zoom)));
                if (last) last.el.remove();
                return { el, w, h, score: fold, fs, lines: tops.size };
            }
            if (last) last.el.remove();
            last = { el, w, h, lines: 0, fold };
        }
        if (!last) return null;
        // Ni los K mayores caben: se quedan, recortados al alto disponible.
        Object.assign(last.el.style, { visibility: "", width: last.w + "px", height: maxH + "px", overflow: "hidden" });
        return { el: last.el, w: last.w, h: maxH, score: last.fold + 100, fs, lines: 0 };
    }

    private buildLegend(side: boolean, fs: number, fold: number, maxW: number, withNotes: boolean, withSeg = true): HTMLDivElement {
        const s = this.settings;
        const el = document.createElement("div");
        el.className = "dn-legend" + (side ? " dn-legend-v" : " dn-legend-h");
        el.setAttribute("aria-label", this.t("Obj_legend", "Legend"));
        const color = this.hc ? this.hcFg : String(s.legend.color || this.ink);
        Object.assign(el.style, { fontSize: fs + "px", color });
        Visual.styleFont(el, this.fontOf("legend"));
        const list = document.createElement("div");
        list.className = "dn-litems";
        list.setAttribute("role", "list");
        el.appendChild(list);
        const n = this.entries.length;
        const f = Math.min(fold, n);
        const itemMax = side ? maxW : Math.min(maxW, Math.max(Math.round(fs * 9), Math.floor(maxW * 0.45)));
        // Con Segment, cada categoría lleva detrás sus segmentos (solo los que tienen valor), en sus tonos: el tono
        // depende de la categoría, así que un bloque "Segment" aparte no podría dar un color único por segmento.
        let ri = 0;
        const item = (key: string, name: string, sw: SVGSVGElement, cls: string): HTMLDivElement => {
            const it = document.createElement("div");
            it.className = "dn-li" + cls;
            it.setAttribute("role", "listitem");
            it.setAttribute("data-key", key);
            it.setAttribute("data-row", key);
            it.setAttribute("data-col", "name");
            it.setAttribute("data-ri", String(ri++));
            it.setAttribute("aria-label", name);
            it.style.maxWidth = itemMax + "px";
            it.appendChild(sw);
            const nm = document.createElement("span");
            nm.className = "dn-lname";
            nm.textContent = name;
            it.appendChild(nm);
            return it;
        };
        this.entries.slice(0, n - f).forEach((e, idx) => {
            const ci = item(e.key, e.name, this.swatch(e, this.arcIndexOf(e, idx), fs), "");
            if (!this.segOn || !withSeg || !this.pv(e.key)) { list.appendChild(ci); return; }
            const grp = document.createElement("div");
            grp.className = "dn-lgroup";
            grp.appendChild(ci);
            const split = this.segSplit(e, null, e.pct);
            split.forEach((x, si) => {
                if (x.v <= 0) return;
                grp.appendChild(item(Visual.pairKey(e.key, x.sd.key), x.sd.name, this.segSwatch(this.segColor(e.color, si, split.length), si, fs), " dn-lseg"));
            });
            list.appendChild(grp);
        });
        if (f > 0) {
            const rest = this.entries.slice(n - f);
            const it = document.createElement("div");
            it.className = "dn-li dn-lmore";
            it.setAttribute("role", "listitem");
            it.textContent = this.tf("UI_More", "+{0} more", String(rest.reduce((a, e) => a + (e.isOther ? e.members.length : 1), 0)));
            it.style.color = this.mutedInk;
            list.appendChild(it);
        }
        const notes = withNotes ? this.notesList({ pct: false }) : [];
        if (notes.length) {
            const nd = document.createElement("div");
            nd.className = "dn-note";
            nd.style.fontSize = Math.max(this.minFs, fs * 0.85) + "px";
            nd.style.color = this.mutedInk;
            for (const t of notes) { const d = document.createElement("div"); d.textContent = t; nd.appendChild(d); }
            el.appendChild(nd);
        }
        el.setAttribute("data-fold", String(f));
        el.setAttribute("data-expanded", "false");
        el.setAttribute("data-segrows", "false");
        return el;
    }

    private buildTable(o: TableOpts): HTMLDivElement {
        const m = this.model;
        const s = this.settings;
        const el = document.createElement("div");
        el.className = "dn-table";
        el.setAttribute("role", "table");
        el.setAttribute("aria-label", this.t("UI_LegendTable", "Legend table"));
        // Cifras compactas = poco sitio: padding de celda más apretado (igual en todas las celdas).
        if (o.compact) el.classList.add("dn-tight");
        const color = this.hc ? this.hcFg : String(s.dataTable.color || this.ink);
        Object.assign(el.style, { fontSize: o.fs + "px", color });
        Visual.styleFont(el, this.fontOf("dataTable"));
        const L = s.dataTable;
        const cmp = this.cmpOn && L.colChange !== false, tgt = this.tgtOn && L.colTarget !== false;
        const shown = String(s.compare?.changeShown ?? "both");
        const showPP = cmp && shown !== "value";
        const showDV = cmp && (shown === "value" || (shown === "both" && o.second));
        const showBar = showPP && o.bar;
        // Con la leyenda clásica a la vista, la tabla no repite la muestra de color (no se lee doble).
        const cols: string[] = this.legendEl ? ["name"] : ["sw", "name"];
        if (L.colValue !== false) cols.push("val");
        if (L.colShare !== false) cols.push("pct");
        if (showBar) cols.push("bar");
        if (showPP) cols.push("dpp");
        if (showDV) cols.push("dval");
        if (tgt) cols.push("tgt");
        const grid = document.createElement("div");
        grid.className = "dn-grid";
        grid.style.gridTemplateColumns = (this.legendEl ? "" : "auto ") + "minmax(0, 1fr)" + " auto".repeat(cols.length - (this.legendEl ? 1 : 2));
        const ni = cols.indexOf("name");
        el.appendChild(grid);
        const units = String(s.dataTable.displayUnits), dec = this.numOpt("dataTable");
        // Auto = cifra completa; en tamaño mini (o si no cabe) la tabla pasa a unidades automáticas.
        const val = (v: number, fmt: string | undefined) => this.fmtValue(v, fmt ?? m.format, o.compact && units === "auto" ? "auto" : units, dec, "full");
        const tp = this.tablePct();
        const dT = this.pctDec("dataTable");
        const pctOf = (key: string) => this.fmtPct(tp.pct.get(key) ?? 0, dT);
        const muted = this.mutedInk;
        let ri = 0;
        const colCls = (c: string) => (c === "sw" ? "dn-sw" : c === "name" ? "dn-name" : c === "bar" ? "dn-num dn-bar" : "dn-num");
        type Content = Record<string, string | Node | undefined>;
        const row = (cls: string, key: string | undefined, rowKey: string | null, content: Content, extra?: (c: HTMLDivElement, col: string) => void): HTMLDivElement[] => {
            const r: HTMLDivElement[] = [];
            for (const col of cols) {
                const c = document.createElement("div");
                c.className = ("dn-c " + cls + " " + colCls(col)).replace(/\s+/g, " ").trim();
                const v = content[col];
                if (typeof v === "string") c.textContent = v; else if (v) c.appendChild(v);
                if (key !== undefined) c.setAttribute("data-key", key);
                if (rowKey) c.setAttribute("data-row", rowKey);
                c.setAttribute("data-col", col);
                c.setAttribute("data-ri", String(ri));
                if (extra) extra(c, col);
                grid.appendChild(c);
                r.push(c);
            }
            ri++;
            return r;
        };
        const spanRow = (cls: string, text: string, rowKey: string | null, from: number, colName: string): HTMLDivElement => {
            const c = document.createElement("div");
            c.className = "dn-c " + cls;
            c.textContent = text;
            c.style.gridColumn = from + " / -1";
            c.setAttribute("data-col", colName);
            c.setAttribute("data-ri", String(ri++));
            if (rowKey) { c.setAttribute("data-row", rowKey); c.setAttribute("data-key", rowKey); }
            grid.appendChild(c);
            return c;
        };
        // Escala común de las minibarras: el mayor |Δ pp| visible (nuevas y salientes no cuentan: no tienen Δ).
        const chsVisible: Change[] = [];
        for (const e of this.entries.concat(this.goneEntries)) {
            if (e.ch) chsVisible.push(e.ch);
            if (e.memberCh && o.expanded) chsVisible.push(...e.memberCh);
        }
        const maxAbs = Math.max(0, ...chsVisible.filter(c => !c.isNew && !c.isGone).map(c => Math.abs(c.dpp10)));
        const chg = (ch: Change | undefined): Content => {
            if (!ch) return {};
            const out: Content = {};
            const warn = (text: string, mix: boolean): Node => {
                const sp = document.createElement("span");
                if (mix) {
                    const w = document.createElement("span");
                    w.className = "dn-warn";
                    w.textContent = "⚠ ";
                    w.setAttribute("aria-hidden", "true");
                    if (!this.hc) w.style.color = this.look ? this.look.plan : "#B86E00";
                    sp.appendChild(w);
                }
                const t = document.createElement("span");
                t.textContent = text;
                if (ch.isNew || ch.isGone) t.className = "dn-tag";
                sp.appendChild(t);
                return sp;
            };
            if (showBar) out.bar = ch.isNew || ch.isGone ? "" : this.miniBar(ch.dpp10, maxAbs, o.fs);
            if (showPP) out.dpp = warn(this.chgText(ch, "pp"), ch.mix && !showDV);
            if (showDV) out.dval = warn(this.chgText(ch, "val"), ch.mix);
            return out;
        };
        // Vista previa limitada: las filas sin dato Pro llevan «—» en las columnas de cambio (sin minibarra ni ⚠).
        const dash: Content = { bar: "", dpp: "—", dval: "—" };
        const tgtCell = (v: number, t: number | null): string | Node => {
            const st = this.tgtStatus(v, t);
            if (!st) return "—";
            const sp = document.createElement("span");
            const g = document.createElement("span");
            g.className = "dn-glyph";
            g.textContent = st.glyph;
            g.style.color = st.color;
            g.setAttribute("aria-label", st.word);
            sp.appendChild(g);
            sp.appendChild(document.createTextNode(" " + this.fmtTgt(st.pct)));
            return sp;
        };
        const mark = (ch: Change | undefined) => (c: HTMLDivElement, col: string) => {
            if (!ch) return;
            if (col === "dpp" || (col === "name" && !showPP)) c.setAttribute("data-dpp10", String(ch.dpp10));
            if (ch.mix) c.setAttribute("data-mix", "1");
            if (ch.isNew) c.setAttribute("data-new", "1");
            if (ch.isGone) c.setAttribute("data-gone", "1");
        };
        const hColor = this.hc ? this.hcFg : String(L.headerColor || color);
        // Con small multiples el título «Total» se queda aunque la cabecera se retire por falta de sitio: sin él no se sabe
        // que la tabla es la de todos los paneles.
        if (o.header || this.smOn) {
            if (cmp || this.smOn) {
                const tc = cmp ? this.cmpTotal() : 0;
                // Con small multiples la tabla es la del total de todos los paneles: lo dice su título.
                // En la vista previa limitada no se da el cambio del total (sería el dato completo).
                const cap = tc > 0 && !this.previewKeys ? this.tf("UI_TotalVs", "Total {0} vs {1}", this.fmtSignedPct(m.total / tc - 1), this.cmpName) : this.smOn ? this.t("UI_Total", "Total") : "";
                // Título de la tabla, fuera de la rejilla y con aire: con el total del donut apagado por defecto, integrarlo
                // en la fila Total lo haría desaparecer; como título no se mezcla con las columnas.
                if (cap) {
                    const c = document.createElement("div");
                    c.className = "dn-cap dn-title";
                    c.textContent = cap;
                    c.style.color = muted;
                    el.insertBefore(c, grid);
                }
            }
            if (o.header) {
            const hb = (col: string, text: string): Node => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "dn-sort";
                b.setAttribute("data-sort", col);
                const active = this.sortCol === col;
                b.textContent = text + (active ? (this.sortDir > 0 ? " ▲" : " ▼") : "");
                b.setAttribute("aria-label", this.tf("UI_SortCol", "Sort by {0}", text));
                b.style.color = hColor;
                return b;
            };
            const r = row("dn-h", undefined, null, {
                sw: "", name: hb("name", m.categoryName), val: hb("val", m.measureName), pct: hb("pct", "%"), bar: "",
                dpp: hb("dpp", this.t("UI_DeltaPP", "Δ pp")), dval: hb("dval", this.t("UI_DeltaPct", "Δ %")), tgt: hb("tgt", this.t("UI_OfTarget", "% of target")),
            }, (c, col) => {
                c.setAttribute("role", "columnheader");
                if (this.sortCol === col) c.setAttribute("aria-sort", this.sortDir > 0 ? "ascending" : "descending");
            });
            // La minibarra no lleva cabecera propia: "Δ pp" cubre la barra y su cifra (sin hueco ni subrayado suelto).
            const barH = r.find(c => c.getAttribute("data-col") === "bar");
            const dppH = r.find(c => c.getAttribute("data-col") === "dpp");
            if (barH && dppH) { barH.remove(); dppH.style.gridColumn = "span 2"; }
            const hBg = this.headerBg();
            r.forEach(c => {
                c.style.color = hColor;
                c.style.borderBottomColor = this.hc ? this.hcFg : alpha(color, 0.35);
                if (hBg) c.style.backgroundColor = hBg;
            });
            }
        }
        const noteRows = (notes: string[], rowKey: string, prefix?: string) => {
            if (!o.ann || !this.annOn) return;
            for (const n of notes) {
                const c = spanRow("dn-ann", (prefix ? prefix + ": " : "") + n, rowKey, 1, "ann");
                c.style.color = muted;
            }
        };
        const n = this.entries.length;
        const fold = o.fold >= 2 ? Math.min(o.fold, n - 1) : 0;
        const visible = this.entries.slice(0, n - fold);
        const segUnitsT = (e: Entry) => tp.pct.get(e.key) ?? 0;
        visible.forEach((e, idx) => {
            const sw = this.swatch(e, this.arcIndexOf(e, idx), o.fs);
            let nameNode: string | Node = e.name;
            if (e.isOther) {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "dn-toggle";
                b.setAttribute("data-toggle", "1");
                b.setAttribute("aria-expanded", String(o.expanded));
                b.textContent = e.name + " " + (o.expanded ? "▾" : "▸");
                b.style.color = color;
                nameNode = b;
            }
            const lleva = this.pv(e.key);
            row("", e.key, e.key, { sw, name: nameNode, val: val(e.value, e.members[0].fmt), pct: pctOf(e.key), ...(lleva ? chg(e.ch) : dash),
                tgt: lleva ? tgtCell(e.value, e.tgt) : "—" }, lleva ? mark(e.ch) : undefined);
            if (lleva && !e.isOther) noteRows(e.members[0].notes, e.key);
            else if (lleva && !o.expanded) e.members.forEach(c => noteRows(c.notes, e.key, c.name));
            if (e.isOther && o.expanded) {
                e.members.forEach((c, i) => {
                    const ch = e.memberCh ? e.memberCh[i] : undefined;
                    const rr = row("dn-child", c.key, c.key, { sw: "", name: c.name, val: val(c.value, c.fmt), pct: pctOf(c.key), ...(lleva ? chg(ch) : dash),
                        tgt: lleva ? tgtCell(c.value, c.tgt !== null && c.tgt > 0 ? c.tgt : null) : "—" }, lleva ? mark(ch) : undefined);
                    rr.forEach(x => x.setAttribute("data-child", "1"));
                    rr[ni].style.color = muted;
                    if (lleva) noteRows(c.notes, c.key);
                });
            }
            if (o.segRows && this.segOn && lleva) {
                const split = this.segSplit(e, null, segUnitsT(e));
                split.forEach((x, si) => {
                    // Solo los segmentos con valor en esta categoría (con Segment poco poblado, nada de filas a 0 %).
                    if (x.v <= 0) return;
                    const key = Visual.pairKey(e.key, x.sd.key);
                    const ssw = this.segSwatch(this.segColor(e.color, si, split.length), si, o.fs);
                    const rr = row("dn-seg", key, key, { sw: ssw, name: x.sd.name, val: val(x.v, e.members[0].fmt), pct: this.fmtPct(x.pct, dT) });
                    rr.forEach(c => c.setAttribute("data-seg", "1"));
                    rr[ni].style.color = muted;
                });
            }
        });
        if (fold) {
            const rest = this.entries.slice(n - fold);
            const r = row("", undefined, null, {
                sw: "", name: this.tf("UI_More", "+{0} more", String(rest.reduce((a, e) => a + (e.isOther ? e.members.length : 1), 0))),
                val: val(rest.reduce((a, e) => a + e.value, 0), m.format), pct: this.fmtPct(rest.reduce((a, e) => a + (tp.pct.get(e.key) ?? 0), 0), dT),
            });
            r.forEach(c => { c.style.color = muted; });
        }
        // Las que salen: con su cuota anterior en el cambio, sin sector (no tienen valor actual).
        for (const e of cmp ? this.goneEntries : []) {
            const gsw = this.swatch({ ...e, color: "transparent" }, -1, o.fs);
            const r = row("dn-gone", undefined, null, { sw: gsw, name: e.name, val: "—", pct: this.fmtPct(0, dT), ...(this.previewKeys ? dash : chg(e.ch)), tgt: "" }, this.previewKeys ? undefined : mark(e.ch));
            r.forEach(c => { c.style.color = muted; });
        }
        if (o.total) {
            const tc = this.cmpTotal();
            const tt = this.targetTotals();
            const totCh: Content = {};
            if (showDV && tc > 0) totCh.dval = this.previewKeys ? "—" : this.fmtSignedPct(m.total / tc - 1);
            const r = row("dn-t", undefined, null, { sw: "", name: this.t("UI_Total", "Total"), val: val(m.total, m.format), pct: this.fmtPct(100 * Math.pow(10, dT), dT),
                ...totCh, tgt: tgt ? (this.previewKeys ? "—" : tgtCell(m.total, tt.tgt > 0 ? tt.tgt : null)) : undefined });
            r.forEach(c => { c.style.borderTopColor = this.hc ? this.hcFg : alpha(color, 0.35); });
        }
        this.styleGrid(grid, cols.length, color);
        // Avisos del pie: separados de la tabla por una línea fina y, como mucho, un punto menos de letra. Solo lo que la
        // tabla enseña: el ⚠ de las filas que lo llevan dibujado, las marcas new/gone si salen, el redondeo si hay %.
        const byKey = new Map<string, { name: string; ch: Change }>();
        for (const e of this.entries) {
            if (e.ch) byKey.set(e.key, { name: e.name, ch: e.ch });
            if (e.memberCh) e.members.forEach((c, i) => { if (e.memberCh[i]) byKey.set(c.key, { name: c.name, ch: e.memberCh[i] }); });
        }
        const mixShown: { name: string; ch: Change }[] = [];
        const vistos = new Set<string>();
        grid.querySelectorAll(".dn-warn").forEach(w => {
            const k = (w.closest("[data-row]") as HTMLElement | null)?.getAttribute("data-row");
            if (k && !vistos.has(k) && byKey.has(k)) { vistos.add(k); mixShown.push(byKey.get(k)); }
        });
        const notes = this.notesList({ pct: o.rounded && (L.colShare !== false || this.labelsShowPct), mix: mixShown, tags: !!grid.querySelector(".dn-tag") });
        if (notes.length) {
            const nd = document.createElement("div");
            nd.className = "dn-note dn-foot";
            this.styleFootnotes(nd, o.fs - 1);
            nd.style.borderTopColor = this.hc ? this.hcFg : alpha(color, 0.18);
            for (const t of notes) { const d = document.createElement("div"); d.textContent = t; nd.appendChild(d); }
            el.appendChild(nd);
        }
        el.setAttribute("data-fold", String(fold));
        el.setAttribute("data-expanded", String(o.expanded));
        el.setAttribute("data-segrows", String(o.segRows && this.segOn));
        return el;
    }

    /**
     * Rejilla y bandas de la tabla, sobre las filas ya construidas (data-ri). Horizontal: una línea fina entre filas (las
     * notas van con su fila, sin línea); All: además, líneas verticales entre las columnas de cifras (la muestra y el
     * nombre no se separan). Color vacío = texto al 18 %. Bandas: filas alternas por categoría (sus notas y subfilas
     * con ella), texto al 5 %; nunca en alto contraste.
     */
    private styleGrid(grid: HTMLDivElement, nCols: number, color: string): void {
        const L = this.settings.dataTable;
        const mode = String(L.gridlines ?? "horizontal");
        const lineC = this.hc ? this.hcFg : String(L.gridColor || alpha(color, 0.18));
        const lw = Math.max(1, Number(L.gridWidth) || 1) + "px";
        const bandC = !this.hc && L.banding ? alpha(color, 0.05) : "";
        const rows = new Map<string, HTMLDivElement[]>();
        grid.querySelectorAll<HTMLDivElement>(":scope > .dn-c").forEach(c => {
            const ri = c.getAttribute("data-ri") ?? "";
            if (!rows.has(ri)) rows.set(ri, []);
            rows.get(ri).push(c);
        });
        let first = true, band = false;
        for (const cells of rows.values()) {
            const c0 = cells[0];
            const isHead = c0.classList.contains("dn-h"), isTot = c0.classList.contains("dn-t"), isAnn = c0.classList.contains("dn-ann");
            if (isHead) continue;
            if (!isAnn && !c0.classList.contains("dn-seg") && !c0.classList.contains("dn-child") && !isTot) band = !band;
            if (!isAnn && !isTot && !first && mode !== "none") cells.forEach(c => { c.style.borderTop = lw + " solid " + lineC; });
            // La minibarra y su Δ pp son una sola columna lógica: sin línea entre ellas.
            const vline = (c: HTMLDivElement) => { const col = c.getAttribute("data-col"); return col !== "sw" && col !== "name" && !(col === "dpp" && grid.querySelector("[data-col=bar]")); };
            if (mode === "all" && !isAnn && cells.length === nCols) cells.forEach(c => { if (vline(c)) c.style.borderLeft = lw + " solid " + lineC; });
            if (bandC && band && !isTot) cells.forEach(c => { c.style.backgroundColor = bandC; c.setAttribute("data-bg", bandC); });
            first = false;
        }
        if (mode === "all") {
            const head = rows.values().next().value as HTMLDivElement[] | undefined;
            if (head && head[0].classList.contains("dn-h")) head.forEach(c => {
                const col = c.getAttribute("data-col");
                if (col !== "sw" && col !== "name") c.style.borderLeft = lw + " solid " + lineC;
            });
        }
    }

    /** Fondo de la cabecera: color fijo o regla fx (evaluada por fila; se toma la primera con valor). Nunca en alto contraste. */
    private headerBg(): string {
        if (this.hc) return "";
        const fixed = String(this.settings.dataTable?.headerBackground || "");
        if (fixed) return fixed;
        const cats = this.dataView?.categorical?.categories ?? [];
        for (const cc of cats) for (const o of (cc.objects ?? []) as any[]) {
            const v = o?.dataTable?.headerBackground?.solid?.color;
            if (v) return String(v);
        }
        return "";
    }

    /** Minibarra divergente lineal del Δ pp: cero en el centro, longitud proporcional (escala común), sentido = signo. */
    private miniBar(d10: number, maxAbs: number, fs: number): SVGSVGElement {
        const NS = "http://www.w3.org/2000/svg";
        const w = Math.max(16, Math.round(fs * 2.6)), h = Math.max(6, Math.round(fs * 0.7));
        const svg = document.createElementNS(NS, "svg") as SVGSVGElement;
        svg.setAttribute("width", String(w)); svg.setAttribute("height", String(h)); svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("class", "dn-mbar");
        const mid = w / 2;
        if (maxAbs > 0 && d10 !== 0) {
            const len = Math.max(1, (mid - 1) * Math.abs(d10) / maxAbs);
            const r = document.createElementNS(NS, "rect");
            r.setAttribute("x", String(d10 > 0 ? mid : mid - len)); r.setAttribute("y", "1");
            r.setAttribute("width", String(len)); r.setAttribute("height", String(h - 2));
            const look = this.look;
            r.setAttribute("fill", this.hc ? this.hcFg : d10 > 0 ? (look ? look.up : "#2E7D5B") : (look ? look.down : "#C4314B"));
            r.setAttribute("data-sign", d10 > 0 ? "+" : "-");
            svg.appendChild(r);
        }
        const z = document.createElementNS(NS, "line");
        z.setAttribute("x1", String(mid)); z.setAttribute("x2", String(mid)); z.setAttribute("y1", "0"); z.setAttribute("y2", String(h));
        z.setAttribute("stroke", this.mutedInk); z.setAttribute("stroke-width", "1");
        svg.appendChild(z);
        return svg;
    }

    private get gridLine(): string {
        if (this.look) return this.look.grid;
        return (this.host.colorPalette as any)?.backgroundNeutral?.value ?? "#E1DFDD";
    }

    private arcIndexOf(e: Entry, fallback: number): number {
        const i = this.entries.findIndex(x => x.key === e.key);
        return i >= 0 ? i : fallback;
    }

    /** Muestra de color de la tabla: el mismo relleno (y trama) que su sector. */
    private swatch(e: Entry, idx: number, fs: number): SVGSVGElement {
        const NS = "http://www.w3.org/2000/svg";
        const sz = Math.max(7, Math.round(fs * 0.8));
        const svg = document.createElementNS(NS, "svg") as SVGSVGElement;
        svg.setAttribute("width", String(sz)); svg.setAttribute("height", String(sz)); svg.setAttribute("aria-hidden", "true");
        const r = document.createElementNS(NS, "rect");
        r.setAttribute("x", "0.5"); r.setAttribute("y", "0.5"); r.setAttribute("width", String(sz - 1)); r.setAttribute("height", String(sz - 1)); r.setAttribute("rx", "1.5");
        r.setAttribute("fill", e.color === "transparent" ? "none" : e.color);
        if (this.hc || e.color === "transparent") { r.setAttribute("stroke", this.hc ? this.hcFg : this.mutedInk); r.setAttribute("stroke-width", "1"); r.setAttribute("stroke-dasharray", e.color === "transparent" ? "2 1.5" : ""); }
        svg.appendChild(r);
        if (idx < 0) return svg;
        if (e.otherPattern && !(this.patternsOn && idx > 0)) {
            const p = document.createElementNS(NS, "rect");
            p.setAttribute("x", "0.5"); p.setAttribute("y", "0.5"); p.setAttribute("width", String(sz - 1)); p.setAttribute("height", String(sz - 1));
            p.setAttribute("fill", "url(#" + this.otherPatternId(e) + ")");
            svg.appendChild(p);
        }
        if (this.patternsOn && idx > 0) {
            const p = document.createElementNS(NS, "rect");
            p.setAttribute("x", "0.5"); p.setAttribute("y", "0.5"); p.setAttribute("width", String(sz - 1)); p.setAttribute("height", String(sz - 1));
            p.setAttribute("fill", "url(#" + this.patternId(idx, e) + ")");
            svg.appendChild(p);
        }
        return svg;
    }

    /** Muestra de un segmento: su tono y, con tramas o alto contraste, la trama del segmento. */
    private segSwatch(color: string, si: number, fs: number): SVGSVGElement {
        const NS = "http://www.w3.org/2000/svg";
        const sz = Math.max(6, Math.round(fs * 0.65));
        const svg = document.createElementNS(NS, "svg") as SVGSVGElement;
        svg.setAttribute("width", String(sz)); svg.setAttribute("height", String(sz)); svg.setAttribute("aria-hidden", "true");
        svg.style.marginLeft = Math.round(fs * 0.5) + "px";
        const r = document.createElementNS(NS, "rect");
        r.setAttribute("x", "0.5"); r.setAttribute("y", "0.5"); r.setAttribute("width", String(sz - 1)); r.setAttribute("height", String(sz - 1));
        r.setAttribute("fill", color);
        if (this.hc) { r.setAttribute("stroke", this.hcFg); r.setAttribute("stroke-width", "1"); }
        svg.appendChild(r);
        if (this.patternsOn && si > 0) {
            const p = document.createElementNS(NS, "rect");
            p.setAttribute("x", "0.5"); p.setAttribute("y", "0.5"); p.setAttribute("width", String(sz - 1)); p.setAttribute("height", String(sz - 1));
            p.setAttribute("fill", "url(#" + this.segPatternId(si) + ")");
            svg.appendChild(p);
        }
        return svg;
    }

    // ── Donut ────────────────────────────────────────────────────────────────

    private get patternsOn(): boolean { return this.hc || !!this.settings.accessibility?.patterns; }

    private patternId(idx: number, e: Entry): string {
        return "dn-pat-" + this.instance + "-" + idx + (this.hc ? "h" : (luminance(e.color) > 0.45 ? "d" : "l"));
    }

    private otherPatternId(e: Entry): string {
        return "dn-pat-" + this.instance + "-other" + (luminance(e.color) > 0.45 ? "d" : "l");
    }

    private segPatternId(si: number): string { return "dn-segpat-" + this.instance + "-" + si; }

    /** Tramas (Accessibility → Patterns, y siempre en alto contraste): una por posición, la primera lisa. */
    private ensurePatterns(defs: Sel<SVGDefsElement>): void {
        // Trama ligera de "Otros" cuando su gris queda cerca de un gris de la paleta (Editorial).
        const ot = this.entries.find(e => e.isOther && e.otherPattern);
        if (ot) {
            const p = defs.append("pattern").attr("id", this.otherPatternId(ot)).attr("patternUnits", "userSpaceOnUse").attr("width", 5).attr("height", 5)
                .attr("patternTransform", "rotate(45)");
            p.append("line").attr("x1", 0).attr("y1", 2.5).attr("x2", 5).attr("y2", 2.5)
                .attr("stroke", luminance(ot.color) > 0.45 ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.45)").attr("stroke-width", 1);
        }
        if (!this.patternsOn) return;
        const kinds = ["", "d45", "h", "d135", "v", "dots", "cross", "grid"];
        const mk = (id: string, kind: string, stroke: string) => {
            const p = defs.append("pattern").attr("id", id).attr("patternUnits", "userSpaceOnUse").attr("width", 6).attr("height", 6);
            if (kind === "d45") p.attr("patternTransform", "rotate(45)");
            if (kind === "d135") p.attr("patternTransform", "rotate(-45)");
            const ln = (x1: number, y1: number, x2: number, y2: number) => p.append("line").attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2)
                .attr("stroke", stroke).attr("stroke-width", 1.4);
            if (kind === "d45" || kind === "d135" || kind === "h") ln(0, 3, 6, 3);
            else if (kind === "v") ln(3, 0, 3, 6);
            else if (kind === "dots") p.append("circle").attr("cx", 3).attr("cy", 3).attr("r", 1.2).attr("fill", stroke);
            else if (kind === "cross") { ln(0, 0, 6, 6); ln(6, 0, 0, 6); }
            else { ln(0, 3, 6, 3); ln(3, 0, 3, 6); }
        };
        this.entries.forEach((e, i) => {
            if (i === 0) return;
            const stroke = this.hc ? this.hcFg : (luminance(e.color) > 0.45 ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.75)");
            mk(this.patternId(i, e), kinds[1 + ((i - 1) % (kinds.length - 1))], stroke);
        });
        if (this.segOn) {
            // Segmentos: tramas propias (puntos, rayas…) para distinguirlos sin color.
            const sk = ["", "dots", "v", "d135", "cross", "h", "grid", "d45"];
            const nSeg = Math.max(0, ...this.entries.map(e => this.segListOf(e).length));
            for (let si = 1; si < nSeg; si++) ((_s: number) => { mk(this.segPatternId(si), sk[1 + ((si - 1) % (sk.length - 1))], this.hc ? this.hcFg : "rgba(0,0,0,0.45)"); })(si);
        }
    }

    private makeArcs(entries: Entry[], sa: number): Arc[] {
        // Ángulos: d3.pie con el orden ya decidido (el de la tabla), en sentido horario desde el ángulo de inicio.
        const pieGen = d3.pie<Entry>().sort(null).value(e => e.value).startAngle(sa).endAngle(sa + 2 * Math.PI);
        return pieGen(entries).map((p, i) => ({ e: p.data, a0: p.startAngle, a1: p.endAngle, idx: i }));
    }

    /** Hueco para los iconos del objetivo en el borde exterior (solo con Target y radio suficiente). */
    private iconSpaceFor(R: number): number {
        if (!this.tgtOn || R < 40 || !this.anyStatusIcon()) return 0;
        return Math.max(12, Math.min(16, Math.round(this.fz(8.5)))) + 3;
    }

    /** Radio exterior del anillo de categorías (con Segment, el anillo exterior ocupa el resto) y radio interior. */
    private rinOf(R: number): number { return this.segOn ? Math.round(R * 0.74) : R; }
    private riOf(R: number): number { return this.settings.slices.shape === "pie" ? 0 : this.rinOf(R) * Number(this.settings.slices.innerRadius) / 100; }

    private drawDonut(p: PanelDraw, ax: number, ay: number, aw: number, ah: number): void {
        const s = this.settings;
        const ringOn = s.scaleRing.mode !== "off";
        const R0full = Math.max(0, Math.min(aw, ah) / 2 - 2);
        if (R0full < 8) return;
        const ringSpace = ringOn ? Math.max(4, Math.round(R0full * 0.06)) + 2 : 0;
        const iconSpace = this.iconSpaceFor(R0full);
        const R0 = R0full - ringSpace - iconSpace;
        const cx = ax + aw / 2, cy = ay + ah / 2;
        const sa = (Number(s.slices.startAngle) || 0) * Math.PI / 180;
        p.arcs = this.makeArcs(p.entries, sa);
        const labelsOn = !!s.labels.show;
        // Las etiquetas nunca con más letra que la tabla (la tabla es la lectura principal).
        const fsL = this.capFs > 0 ? Math.max(this.minFs, Math.min(this.fz(Number(s.labels.fontSize)), this.capFs)) : this.fz(Number(s.labels.fontSize));
        let R = R0;
        let labels: PlacedLabel[] = [];
        const outSpace = ringSpace + iconSpace;
        if (labelsOn && p.arcs.length) {
            // Todas las etiquetas con el mismo contenido y la misma letra (Tino, 24-11). Con la tabla visible, siempre
            // dentro: se encoge la letra de todas a la vez hasta el mínimo y luego se recorta el contenido de todas
            // (Δ → valor → nombre → %); el sector que no admite ni la mínima se queda sin etiqueta (el dato está en la tabla).
            // Fuera con guía solo con la tabla en Off, donde la etiqueta es lo único que nombra el sector.
            const tableOn = !!this.tableEl || !!this.legendEl;
            const pmode = String(s.labels.position);
            const mode: "inside" | "auto" | "outside" = tableOn || pmode === "inside" ? "inside" : pmode === "outside" ? "outside" : "auto";
            const levels = Math.max(...p.arcs.map(a => this.variants(this.labelParts(a.e)).length));
            const sizes: number[] = [];
            for (let f = fsL; f > this.minFs; f -= 0.5) sizes.push(f);
            sizes.push(this.minFs);
            const planAt = (level: number, f: number) => {
                let pl = this.planLabels(p.arcs, R0, this.rinOf(R0), this.riOf(R0), cx, cy, ax, ay, aw, ah, f, outSpace, level, mode);
                let r = R0;
                if (mode !== "inside" && pl.needW > 0) {
                    const e = Math.max(6, f * 0.8);
                    const nr = Math.min(R0, aw / 2 - outSpace - e - 6 - pl.needW - 2);
                    if (nr < R0 && nr >= Math.max(R0 * 0.6, 24)) {
                        r = Math.floor(nr);
                        pl = this.planLabels(p.arcs, r, this.rinOf(r), this.riOf(r), cx, cy, ax, ay, aw, ah, f, outSpace, level, mode);
                    }
                }
                return { p: pl, r };
            };
            // La letra común la deciden los sectores legibles (los que admiten su etiqueta mínima a ≥ 0,75 × la letra base),
            // no el más pequeño: con esa letra, la etiqueta que no cabe en su sector se oculta (el dato está en la tabla).
            const fsLeg = Math.max(this.minFs, fsL * 0.75);
            const legible = new Set(planAt(levels - 1, fsLeg).p.placed.map(l => l.e.key));
            const floor = planAt(levels - 1, this.minFs);
            let best = floor;
            const fitsAll = (c: { p: { placed: PlacedLabel[] } }) => {
                if (!legible.size) return c.p.placed.length >= floor.p.placed.length;
                const got = new Set(c.p.placed.map(l => l.e.key));
                for (const k of legible) if (!got.has(k)) return false;
                return true;
            };
            search: for (let level = 0; level < levels; level++) {
                for (const f of sizes) {
                    if (legible.size && f < fsLeg) break;
                    const c = planAt(level, f);
                    if (fitsAll(c)) { best = c; break search; }
                }
            }
            R = best.r;
            labels = best.p.placed;
        }
        p.geo = { cx, cy, R, Rin: this.rinOf(R), ri: this.riOf(R), ringR: R + (ringOn ? 2 : 0), ax, ay, aw, ah, ringSpace, iconSpace };
        this.drawPanelShapes(p, labels, ringOn, sa);
    }

    /**
     * Small multiples (Pro): rejilla con las 9 opciones comunes. Mismo radio en todos los paneles (o radio ∝ √total con
     * Size by total), mismo conjunto de "Otros", orden y colores que la tabla compartida, centro con el total de cada
     * panel y etiquetas uniformes también ENTRE paneles (misma letra y contenido; la que no cabe se oculta).
     */
    private drawGrid(ax: number, ay: number, aw: number, ah: number): void {
        const s = this.settings, sm = s.smallMultiples;
        const m = this.model;
        const totalPanels = m.facets.length;
        let panels = this.panels;
        const noteFs = Math.max(this.minFs, this.fz(8.5));
        const gap = Math.max(0, Math.min(40, Number(sm.gap))) * Math.min(1, this.k);
        const boxed = !!sm.border || !!sm.background;
        const pad = boxed ? Math.max(3, Math.round(5 * Math.min(1, this.k))) : 0;
        // Título con la norma de la leyenda: escala con k y no baja de 10 px (ni del mínimo de Accessibility); solo en
        // paneles muy bajos se limita a una fracción de la celda para no comerse el donut.
        let tfs = Math.max(10, this.minFs, this.fz(Number(sm.titleFontSize)));
        const titleGap = Math.max(2, Math.round(3 * this.k));
        const titleHOf = (f: number) => Math.ceil(f * 1.3) + titleGap;
        let titleH = titleHOf(tfs) + pad;
        const MIN = 36;
        const layout = (n: number, top: number) => {
            const h = ah - top;
            let best = { cols: 1, rows: n, side: -1 };
            const fixed = Number(sm.columns) >= 1 ? Math.min(n, Math.round(Number(sm.columns))) : 0;
            for (let c = fixed || 1; c <= (fixed || n); c++) {
                const rows = Math.ceil(n / c);
                const cw = (aw - gap * (c - 1)) / c, ch = (h - gap * (rows - 1)) / rows;
                const side = Math.min(cw - 2 * pad, ch - titleH - pad);
                if (side > best.side) best = { cols: c, rows, side };
            }
            return best;
        };
        const notes: string[] = [];
        if (!this.isPro && totalPanels > panels.length) notes.push(this.tf("UI_SmPreview", "Pro preview: the first {0} of {1} panels", String(panels.length), String(totalPanels)));
        let top = notes.length ? Math.ceil(noteFs * 1.5) : 0;
        let L = layout(panels.length, top);
        if (L.side < MIN && panels.length > 1) {
            // Paneles demasiado pequeños: se enseñan los que caben a un tamaño legible, y se dice cuántos.
            if (!top) top = Math.ceil(noteFs * 1.5);
            let n = panels.length;
            while (n > 1 && layout(n, top).side < MIN) n--;
            notes.length = 0;
            notes.push(this.tf("UI_SmShowing", "Showing {0} of {1} panels", String(n), String(totalPanels)));
            panels = panels.slice(0, n);
            this.panels = panels;
            L = layout(n, top);
        }
        if (notes.length) {
            const nd = document.createElement("div");
            nd.className = "dn-smnote";
            Object.assign(nd.style, { left: ax + "px", top: ay + "px", width: aw + "px", fontSize: noteFs + "px", color: this.mutedInk });
            nd.textContent = notes.join(" · ");
            this.root.appendChild(nd);
        }
        const cw = (aw - gap * (L.cols - 1)) / L.cols, ch = (ah - top - gap * (L.rows - 1)) / L.rows;
        const capT = Math.max(this.minFs, Math.floor(ch * 0.16 * 2) / 2);
        if (tfs > capT) { tfs = capT; titleH = titleHOf(tfs) + pad; }
        const dw = Math.max(0, cw - 2 * pad), dh = Math.max(0, ch - titleH - pad);
        const ringOn0 = s.scaleRing.mode !== "off";
        const Rcell = Math.max(0, Math.min(dw, dh) / 2 - 2);
        const ringOn = ringOn0 && Rcell >= 28;
        const ringSpace = ringOn ? Math.max(3, Math.round(Rcell * 0.06)) + 2 : 0;
        const iconSpace = this.iconSpaceFor(Rcell);
        const R0 = Math.max(4, Rcell - ringSpace - iconSpace);
        const maxT = Math.max(0, ...panels.map(p => p.total));
        const sa = (Number(s.slices.startAngle) || 0) * Math.PI / 180;
        const hc = this.hc;
        const cells: { x: number; y: number }[] = [];
        panels.forEach((p, i) => {
            const x = ax + (i % L.cols) * (cw + gap), y = ay + top + Math.floor(i / L.cols) * (ch + gap);
            cells.push({ x, y });
            if (boxed) {
                this.svg.append("rect").attr("class", "dn-sm-box").attr("x", x + 0.5).attr("y", y + 0.5).attr("width", Math.max(0, cw - 1)).attr("height", Math.max(0, ch - 1))
                    .attr("rx", 2).attr("fill", hc ? "none" : (sm.background || "none")).attr("stroke", sm.border ? (hc ? this.hcFg : String(sm.borderColor)) : "none")
                    .style("pointer-events", "none");
            }
            const R = sm.sizeByTotal && maxT > 0 ? Math.max(4, R0 * Math.sqrt(p.total / maxT)) : R0;
            // Título + donut como un bloque centrado en la celda; el título, pegado encima de su donut (sobre el radio
            // real, también con Size by total) y centrado sobre él (o alineado a su borde izquierdo).
            // Lo que se dibuja de verdad: arriba, el círculo del anillo de escala (no lleva marca a las 12); al lado, su marca.
            const outerTop = R + (ringOn ? 3 : 1) + iconSpace;
            const outerSide = (ringOn ? R + 2 + Math.max(3, Math.round((R + 2) * 0.05)) : R) + iconSpace;
            const blockH = titleH - pad + 2 * (Rcell + 2);
            const blockTop = y + pad + Math.max(0, (ch - 2 * pad - blockH) / 2);
            const cx = x + cw / 2, cy = blockTop + titleH - pad + Rcell + 2;
            const t = document.createElement("div");
            t.className = "dn-sm-title";
            t.textContent = p.title;
            const tw = Math.max(0, cw - 2 * pad - 4);
            const center = sm.titleAlign !== "left";
            const lx = Math.max(x + pad + 2, cx - outerSide);
            Object.assign(t.style, { left: (center ? x + pad + 2 : lx) + "px", top: (cy - outerTop - titleHOf(tfs)) + "px",
                width: (center ? tw : Math.max(0, x + cw - pad - 2 - lx)) + "px", fontSize: tfs + "px",
                fontWeight: sm.titleBold ? "600" : "400", color: hc ? this.hcFg : String(sm.titleColor || this.ink), textAlign: center ? "center" : "left",
                lineHeight: "1.3" });
            Visual.styleFont(t, this.fontOf("smallMultiples", "titleFontFamily", null, "titleItalic", "titleUnderline"), false);
            this.root.appendChild(t);
            p.arcs = this.makeArcs(p.entries, sa);
            p.geo = { cx, cy, R, Rin: this.rinOf(R), ri: this.riOf(R), ringR: R + (ringOn ? 2 : 0), ax: x + pad, ay: y + titleH, aw: dw, ah: dh, ringSpace, iconSpace };
        });
        // Etiquetas comunes a todos los paneles: siempre dentro (la tabla compartida nombra los sectores).
        const labelsByPanel: PlacedLabel[][] = panels.map(() => []);
        if (s.labels.show) {
            // El texto escala con el PANEL (lado menor / 300), no con el visual entero: paneles pequeños, letra pequeña.
            const kp = Math.max(0.6, Math.min(1.8, Math.min(cw, ch) / 300));
            let fsL = Math.max(this.minFs, Math.round(Number(s.labels.fontSize) * kp * 2) / 2);
            if (this.capFs > 0) fsL = Math.max(this.minFs, Math.min(fsL, this.capFs));
            const levels = Math.max(1, ...panels.map(p => Math.max(0, ...p.arcs.map(a => this.variants(this.labelParts(a.e)).length))));
            const sizes: number[] = [];
            for (let f = fsL; f > this.minFs; f -= 0.5) sizes.push(f);
            sizes.push(this.minFs);
            const planAll = (level: number, f: number) => panels.map(p => this.planLabels(p.arcs, p.geo.R, p.geo.Rin, p.geo.ri, p.geo.cx, p.geo.cy, p.geo.ax, p.geo.ay,
                p.geo.aw, p.geo.ah, f, ringSpace + iconSpace, level, "inside").placed);
            const keys = (pl: PlacedLabel[][]) => { const out = new Set<string>(); pl.forEach((x, i) => x.forEach(l => out.add(i + "|" + l.e.key))); return out; };
            const fsLeg = Math.max(this.minFs, fsL * 0.75);
            const legible = keys(planAll(levels - 1, fsLeg));
            const floor = planAll(levels - 1, this.minFs);
            let best = floor;
            const nFloor = keys(floor).size;
            search: for (let level = 0; level < levels; level++) {
                for (const f of sizes) {
                    if (legible.size && f < fsLeg) break;
                    const c = planAll(level, f);
                    const got = keys(c);
                    let ok = legible.size ? true : got.size >= nFloor;
                    if (legible.size) for (const k of legible) if (!got.has(k)) { ok = false; break; }
                    if (ok) { best = c; break search; }
                }
            }
            best.forEach((pl, i) => { labelsByPanel[i] = pl; });
        }
        panels.forEach((p, i) => this.drawPanelShapes(p, labelsByPanel[i], ringOn, sa));
    }

    /** Dibuja un panel: sectores, anillo de segmentos, anillo de escala, iconos del objetivo, foco, etiquetas y centro. */
    private drawPanelShapes(p: PanelDraw, labels: PlacedLabel[], ringOn: boolean, sa: number): void {
        const s = this.settings;
        const g0 = p.geo;
        const { cx, cy, R, Rin, ri } = g0;
        const pg = this.svg.append("g").attr("class", "dn-panel").attr("data-panel", String(p.index)) as unknown as Sel<SVGGElement>;
        p.g = pg;
        // Space between slices = hueco real (se ve el fondo) entre sectores y entre los dos anillos. Border = trazo alrededor de
        // cada sector, compatible con el hueco. Igual en los dos anillos. El alto contraste manda sobre el borde propio.
        const bColor = this.borderColor;
        const gap = Number(s.slices.gap) || 0;
        const bw = bColor ? Math.max(0.5, Number(s.slices.borderWidth) || 1) : 0;
        const pad = (r: number) => (p.arcs.length > 1 ? gap / Math.max(r, 1) : 0);
        const arcGen = d3.arc<any>().innerRadius(ri).outerRadius(Rin).padRadius(Rin).padAngle(pad(Rin)).cornerRadius(0);
        // Un arco más fino que su borde sería solo borde (Tino: anillo negro de bordes): ese arco va sin borde.
        const border = (grp: Sel<SVGGElement>, d: string, arcLen = Infinity) => {
            if (bColor && arcLen >= 2 * bw + 3) grp.append("path").attr("class", "dn-border").attr("d", d).attr("fill", "none").attr("stroke", bColor).attr("stroke-width", bw)
                .attr("stroke-linejoin", "round").style("pointer-events", "none");
        };
        const g = pg.append("g").attr("class", "dn-slices");
        const hasHl = !!this.model.hasHighlights;
        const pidx = String(p.index);
        for (const a of p.arcs) {
            const e = a.e;
            const gi = this.arcIndexOf(e, a.idx);
            const sg = g.append("g").attr("class", "dn-sg").attr("data-key", e.key).attr("data-panel", pidx);
            const d = arcGen({ startAngle: a.a0, endAngle: a.a1 });
            const base = sg.append("path").attr("class", "dn-slice").attr("data-key", e.key).attr("data-panel", pidx).attr("d", d).attr("fill", e.color);
            if (this.hc) base.attr("stroke", this.hcFg).attr("stroke-width", 1.5);
            if (e.otherPattern && !(this.patternsOn && gi > 0)) {
                sg.append("path").attr("class", "dn-pat dn-pat-other").attr("d", d).attr("fill", "url(#" + this.otherPatternId(e) + ")").style("pointer-events", "none");
            }
            if (this.patternsOn && gi > 0) sg.append("path").attr("class", "dn-pat").attr("d", d).attr("fill", "url(#" + this.patternId(gi, e) + ")").style("pointer-events", "none");
            if (!this.hc) border(sg as unknown as Sel<SVGGElement>, d, (a.a1 - a.a0) * Rin - gap);
            if (hasHl) {
                // Resaltado parcial: la parte resaltada con área proporcional (radio en √), el resto atenuado.
                const ratio = e.value > 0 ? Math.max(0, Math.min(1, (e.hl || 0) / e.value)) : 0;
                base.attr("fill-opacity", 0.35);
                if (ratio > 0) {
                    const rh = Math.sqrt(ri * ri + ratio * (Rin * Rin - ri * ri));
                    const hd = d3.arc<any>().innerRadius(ri).outerRadius(rh).padRadius(Rin).padAngle(pad(Rin))({ startAngle: a.a0, endAngle: a.a1 });
                    sg.append("path").attr("class", "dn-hl").attr("d", hd).attr("fill", e.color).style("pointer-events", "none");
                }
            }
            sg.attr("transform", "translate(" + cx + "," + cy + ")");
        }
        // Anillo exterior de segmentos (Pro): el desglose de cada categoría, en el mismo ángulo que su sector.
        p.segArcs = [];
        if (this.segOn) {
            const r0 = Rin + this.ringSep(R), r1 = R;
            const sgen = d3.arc<any>().innerRadius(r0).outerRadius(r1).padRadius(r1).padAngle(gap > 0 ? gap / Math.max(r1, 1) : 0);
            const gs = pg.append("g").attr("class", "dn-segs").attr("transform", "translate(" + cx + "," + cy + ")");
            for (const a of p.arcs) {
                if (!this.pv(a.e.key)) continue;   // vista previa limitada: anillo solo en las mayores
                const split = this.segSplit(a.e, p.fkey, a.e.pct);
                const tot = split.reduce((x, y) => x + y.v, 0);
                let ang = a.a0;
                split.forEach((x, si) => {
                    const span = tot > 0 ? (a.a1 - a.a0) * x.v / tot : 0;
                    const sgA: SegArc = { e: a.e, sd: x.sd, si, key: Visual.pairKey(a.e.key, x.sd.key), a0: ang, a1: ang + span, value: x.v, hl: x.h, pct: x.pct,
                        color: this.segColor(a.e.color, si, split.length) };
                    ang += span;
                    p.segArcs.push(sgA);
                    if (span <= 0) return;
                    const sgg = gs.append("g").attr("class", "dn-segg").attr("data-key", sgA.key).attr("data-parent", a.e.key);
                    const d = sgen({ startAngle: sgA.a0, endAngle: sgA.a1 });
                    const path = sgg.append("path").attr("class", "dn-seg").attr("data-key", sgA.key).attr("data-panel", pidx).attr("d", d).attr("fill", sgA.color);
                    if (this.hc) path.attr("stroke", this.hcFg).attr("stroke-width", 1);
                    else if (!bColor) path.attr("stroke", this.bgColor).attr("stroke-width", 0.5);
                    if (this.patternsOn && si > 0) sgg.append("path").attr("class", "dn-pat").attr("d", d).attr("fill", "url(#" + this.segPatternId(si) + ")").style("pointer-events", "none");
                    if (!this.hc) border(sgg as unknown as Sel<SVGGElement>, d, (sgA.a1 - sgA.a0) * r1 - gap);
                    if (hasHl) {
                        const ratio = x.v > 0 ? Math.max(0, Math.min(1, x.h / x.v)) : 0;
                        path.attr("fill-opacity", 0.35);
                        if (ratio > 0) {
                            const rh = Math.sqrt(r0 * r0 + ratio * (r1 * r1 - r0 * r0));
                            sgg.append("path").attr("class", "dn-hl").attr("d", d3.arc<any>().innerRadius(r0).outerRadius(rh)({ startAngle: sgA.a0, endAngle: sgA.a1 }))
                                .attr("fill", sgA.color).style("pointer-events", "none");
                        }
                    }
                });
            }
        }
        if (this.segOn && s.labels.show && s.labels.segment !== "off" && p.segArcs.length) {
            const fsSeg = labels.length ? labels[0].fs : Math.max(this.minFs, this.capFs > 0 ? Math.min(this.fz(Number(s.labels.fontSize)), this.capFs) : this.fz(Number(s.labels.fontSize)));
            this.drawSegLabels(pg, p, Rin + this.ringSep(R), R, cx, cy, fsSeg);
        }
        if (ringOn) this.drawScaleRing(pg, cx, cy, g0.ringR, sa);
        if (this.tgtOn && g0.iconSpace > 0) this.drawTargetIcons(pg, p);
        pg.append("g").attr("class", "dn-focus").attr("transform", "translate(" + cx + "," + cy + ")");
        if (labels.length) this.drawLabels(pg, labels);
        pg.append("g").attr("class", "dn-center");
        this.drawCenter(p, null);
    }

    /** Status on slices: Misses only (por defecto, solo ✕) / All / Off. El estado completo siempre está en la tabla. */
    private showsStatus(st: { glyph: string } | null): boolean {
        if (!st) return false;
        const mode = String(this.settings.target?.statusOnSlices ?? "misses");
        return mode === "all" || (mode === "misses" && st.glyph === "✕");
    }

    /** ¿Algún sector de algún panel lleva icono? Si no, no se reserva hueco en el borde. */
    private anyStatusIcon(): boolean {
        return this.panels.some(p => p.entries.some(e => this.pv(e.key) && this.showsStatus(this.tgtStatus(e.value, e.tgt))));
    }

    /** Icono de estado del objetivo en el borde exterior de cada sector (✓ ≈ ✕), solo donde cabe sin pisar al vecino. */
    private drawTargetIcons(pg: Sel<SVGGElement>, p: PanelDraw): void {
        const g0 = p.geo;
        const d = g0.iconSpace - 3;
        const r = g0.R + g0.ringSpace + g0.iconSpace / 2;
        const gi = pg.append("g").attr("class", "dn-ticons").attr("transform", "translate(" + g0.cx + "," + g0.cy + ")");
        for (const a of p.arcs) {
            const st = this.tgtStatus(a.e.value, a.e.tgt);
            if (!st || !this.showsStatus(st) || !this.pv(a.e.key)) continue;
            if ((a.a1 - a.a0) * r < d * 1.15) continue;
            const am = (a.a0 + a.a1) / 2;
            const x = Math.sin(am) * r, y = -Math.cos(am) * r;
            const ig = gi.append("g").attr("class", "dn-ticon").attr("data-key", a.e.key).attr("data-panel", String(p.index)).attr("data-status", st.glyph)
                .attr("transform", "translate(" + x.toFixed(1) + "," + y.toFixed(1) + ")");
            ig.append("circle").attr("r", d / 2).attr("fill", this.hc ? this.hcBg : st.color).attr("stroke", this.hc ? this.hcFg : this.bgColor).attr("stroke-width", 1);
            ig.append("text").attr("text-anchor", "middle").attr("dy", "0.35em").attr("font-size", Math.max(8, d * 0.7)).attr("font-weight", 700)
                .attr("fill", this.hc ? this.hcFg : "#FFFFFF").style("pointer-events", "none").text(st.glyph);
        }
    }

    /** Anillo de escala: marcas a 25/50/75 % (o cada 10 %) desde el ángulo de inicio real, contraste ≥ 3:1. */
    private drawScaleRing(pg: Sel<SVGGElement>, cx: number, cy: number, r: number, sa: number): void {
        const s = this.settings;
        let color = this.hc ? this.hcFg : String(s.scaleRing.color || this.mutedInk);
        if (!this.hc && contrast(color, this.bgColor) < 3) color = this.ink;
        const g = pg.append("g").attr("class", "dn-ring").attr("transform", "translate(" + cx + "," + cy + ")").style("pointer-events", "none");
        g.append("circle").attr("r", r).attr("fill", "none").attr("stroke", color).attr("stroke-width", 1).attr("opacity", 0.55);
        const tick = Math.max(3, Math.round(r * 0.05));
        const marks = s.scaleRing.mode === "tens" ? [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => i / 10) : [0.25, 0.5, 0.75];
        for (const f of marks) {
            const a = sa + f * 2 * Math.PI;
            const major = Math.abs(f * 4 - Math.round(f * 4)) < 1e-9;
            const len = major ? tick : tick * 0.6;
            g.append("line").attr("x1", Math.sin(a) * r).attr("y1", -Math.cos(a) * r).attr("x2", Math.sin(a) * (r + len)).attr("y2", -Math.cos(a) * (r + len))
                .attr("stroke", color).attr("stroke-width", major ? 1.5 : 1);
        }
    }

    /** Partes de la etiqueta según Content (Automatic = Percent con la tabla visible, Name and percent sin ella). */
    private labelParts(e: Entry): LabelPart[] {
        const s = this.settings;
        let c = String(s.labels.content);
        if (c === "auto") c = this.tableEl || this.legendEl ? "percent" : "namePercent";
        const pct: LabelPart = { kind: "pct", text: this.fmtPct(e.pct) };
        const val: LabelPart = { kind: "val", text: this.fmtValue(e.value, e.members[0].fmt ?? this.model.format, String(s.labels.displayUnits), this.numOpt("labels"), "compact") };
        const name: LabelPart = { kind: "name", text: e.name };
        let parts: LabelPart[];
        switch (c) {
            case "value": parts = [val]; break;
            case "name": parts = [name]; break;
            case "namePercent": parts = [name, pct]; break;
            case "valuePercent": parts = [val, pct]; break;
            case "all": parts = [name, val, pct]; break;
            default: parts = [pct];
        }
        // "36 % +2,1": el Δ pp detrás del %, solo si cabe en TODAS (es lo primero que se retira).
        if (this.cmpOn && this.pv(e.key) && e.ch && parts.some(x => x.kind === "pct")) parts.push({ kind: "chg", text: e.ch.isNew ? this.t("UI_New", "new") : this.fmtPP(e.ch.dpp10) });
        return parts;
    }

    /** Variantes de una etiqueta, de la completa a la mínima: se retira Δ → valor → nombre → % (el % es lo último que se quita). */
    private variants(parts: LabelPart[]): string[] {
        const join = (ps: LabelPart[]) => ps.filter(p => p.kind !== "chg").map(p => p.text).join(" · ") + ps.filter(p => p.kind === "chg").map(p => " " + p.text).join("");
        const out: string[] = [];
        let cur = parts.slice();
        out.push(join(cur));
        for (const kind of ["chg", "val", "name", "pct"] as const) {
            if (cur.length <= 1) break;
            if (cur.some(p => p.kind === kind)) { cur = cur.filter(p => p.kind !== kind); out.push(join(cur)); }
        }
        return out;
    }

    /** ¿Cabe la caja (centrada en x, y; relativa al centro) dentro del sector anular? */
    private fitsInSlice(x: number, y: number, w: number, h: number, a0: number, a1: number, r0: number, r1: number, padPx: number): boolean {
        const full = a1 - a0 >= 2 * Math.PI - 1e-6;
        const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2], [0, -h / 2], [0, h / 2], [-w / 2, 0], [w / 2, 0]];
        for (const [dx, dy] of pts) {
            const px = x + dx, py = y + dy;
            const r = Math.hypot(px, py);
            if (r < r0 + 1.5 || r > r1 - 1.5) return false;
            if (full) continue;
            let a = Math.atan2(px, -py);
            while (a < a0) a += 2 * Math.PI;
            while (a >= a0 + 2 * Math.PI) a -= 2 * Math.PI;
            const pad = padPx / Math.max(r, 1);
            if (a < a0 + pad || a > a1 - pad) return false;
        }
        return true;
    }

    /**
     * Coloca TODAS las etiquetas con el mismo contenido (nivel de recorte `level`) y la misma letra `fs`: dentro del
     * sector (entre ri y Rin) si cabe; si no, y se permite (tabla en Off), fuera con guía en dos columnas sin solapes; si
     * no, retirada entera. Nunca se recorta un texto. needW = ancho que pedirían las de fuera (para encoger el radio).
     */
    private planLabels(arcs: Arc[], R: number, Rin: number, ri: number, cx: number, cy: number, ax: number, ay: number, aw: number, ah: number, fs: number, ringSpace: number,
        level: number, mode: "inside" | "auto" | "outside"): { placed: PlacedLabel[]; retired: number; needW: number } {
        const lf = this.lblFont;
        const h = fs * 1.2;
        const gap = Number(this.settings.slices.gap) || 0;
        const placed: PlacedLabel[] = [];
        const outside: { a: Arc; text: string; am: number }[] = [];
        let retired = 0;
        // La caja de texto es horizontal: en un anillo fino, a 45° necesita más fondo radial que arriba, abajo o a los
        // lados (infografía: «16 %» cabía en Nord, abajo, y «24 %» no en Aigua Serena, en diagonal). Por eso, además del
        // centro del sector, se prueban otros ángulos dentro del sector y otros radios dentro del anillo.
        const tryInside = (a: Arc, text: string): boolean => {
            const span = a.a1 - a.a0;
            const angles = [0.5, 0.35, 0.65, 0.2, 0.8].map(t => a.a0 + span * t);
            const mid = ri > 0 ? (ri + Rin) / 2 : 0;
            const band = Rin - ri;
            const radii = ri > 0 ? [mid, mid - band * 0.12, mid + band * 0.12] : [Rin * 0.62, Rin * 0.72, Rin * 0.5];
            if (span >= 2 * Math.PI - 1e-6) radii.unshift(ri > 0 ? mid : 0);
            const w = this.measure(text, fs, false, lf) + 2;
            for (const am of angles) for (const rm of radii) {
                const x = rm * Math.sin(am), y = -rm * Math.cos(am);
                if (this.fitsInSlice(x, y, w, h, a.a0, a.a1, ri, Rin, gap / 2 + 1)) {
                    placed.push({ e: a.e, text, x: cx + x, y: cy + y, anchor: "middle", inside: true, w, fs });
                    return true;
                }
            }
            return false;
        };
        for (const a of arcs) {
            if (!(a.a1 > a.a0)) continue;
            const vars = this.variants(this.labelParts(a.e));
            const text = vars[Math.min(level, vars.length - 1)];
            if (mode !== "outside" && tryInside(a, text)) continue;
            if (mode === "inside") retired++;
            else outside.push({ a, text, am: (a.a0 + a.a1) / 2 });
        }
        if (!outside.length) return { placed, retired, needW: 0 };
        const e = Math.max(6, fs * 0.8);
        const needW = Math.max(...outside.map(o => this.measure(o.text, fs, false, lf))) + 4;
        const rOut = R + ringSpace;
        const hOut = fs * 1.4;
        for (const side of [1, -1]) {
            const colX = cx + side * (rOut + e + 4);
            const avail = side > 0 ? ax + aw - (colX + 3) - 1 : colX - 3 - ax - 1;
            const mine = outside.filter(o => (Math.sin(o.am) >= 0 ? 1 : -1) === side);
            const items = mine.filter(o => this.measure(o.text, fs, false, lf) + 2 <= avail).map(o => ({ o, ideal: cy - (rOut + e) * Math.cos(o.am) }));
            retired += mine.length - items.length;
            const minY = ay + hOut / 2, maxY = ay + ah - hOut / 2;
            // Si no caben todas en la columna, se retiran enteras las de los sectores más pequeños.
            let ys: number[] = [];
            for (let guard = 0; guard < 200 && items.length; guard++) {
                items.sort((p, q) => p.ideal - q.ideal);
                ys = items.map(it => it.ideal);
                for (let i = 0; i < ys.length; i++) ys[i] = Math.max(ys[i], minY, i ? ys[i - 1] + hOut : -Infinity);
                for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i], maxY, i < ys.length - 1 ? ys[i + 1] - hOut : Infinity);
                if (ys[0] >= minY - 0.01 && (maxY - minY) >= (ys.length - 1) * hOut - 0.01) break;
                let worst = 0;
                items.forEach((it, i) => { if (it.o.a.e.value < items[worst].o.a.e.value) worst = i; });
                items.splice(worst, 1);
                retired++;
            }
            items.forEach((it, i) => {
                const am = it.o.am;
                const p0: [number, number] = [cx + R * Math.sin(am), cy - R * Math.cos(am)];
                const p1: [number, number] = [cx + (rOut + e * 0.6) * Math.sin(am), cy - (rOut + e * 0.6) * Math.cos(am)];
                const p2: [number, number] = [colX, ys[i]];
                placed.push({ e: it.o.a.e, text: it.o.text, x: colX + side * 3, y: ys[i], anchor: side > 0 ? "start" : "end", inside: false,
                    w: this.measure(it.o.text, fs, false, lf) + 2, fs, leader: [p0, p1, p2] });
            });
        }
        return { placed, retired, needW };
    }

    /**
     * Etiquetas del anillo exterior, con las normas de las interiores: todas dentro del anillo, la misma letra que las
     * interiores (que nunca supera la de la leyenda o la tabla) y el mismo contenido para todas. Automatic = nombre +
     * % del total si así no se pierde ninguna de las que caben con solo el nombre; si no, nombre. El trozo donde no cabe
     * ni el nombre va sin etiqueta (el dato sigue en el tooltip). El % es del total, coherente con el anillo interior.
     */
    private drawSegLabels(pg: Sel<SVGGElement>, p: PanelDraw, r0: number, r1: number, cx: number, cy: number, fs: number): void {
        const lf = this.lblFont;
        // Siguiendo el anillo (tangentes, giradas para leerse siempre de pie): en un anillo fino es la única orientación en
        // la que cabe un nombre. La misma para todas.
        const mode = String(this.settings.labels.segment);
        const h = fs * 1.5;   // caja de los glifos (ascendentes y descendentes), no solo el cuerpo
        const rm = (r0 + r1) / 2;
        type SL = { sa: SegArc; text: string; x: number; y: number; rot: number };
        const plan = (withPct: boolean) => {
            const out: SL[] = [];
            for (const sa of p.segArcs) {
                if (sa.a1 - sa.a0 <= 0) continue;
                const text = withPct ? sa.sd.name + " " + this.fmtPct(sa.pct) : sa.sd.name;
                const w = this.measure(text, fs, false, lf);
                const span = w / rm + 6 / rm;
                const sag = rm * (1 - Math.cos(Math.min(Math.PI / 2, w / (2 * rm))));
                if (span > sa.a1 - sa.a0 || h + sag > r1 - r0 - 2) continue;
                const am = (sa.a0 + sa.a1) / 2;
                let rot = am * 180 / Math.PI;
                if (am % (2 * Math.PI) > Math.PI / 2 && am % (2 * Math.PI) < 3 * Math.PI / 2) rot += 180;
                out.push({ sa, text, x: Math.sin(am) * rm, y: -Math.cos(am) * rm, rot });
            }
            return out;
        };
        let placed: SL[];
        if (mode === "name") placed = plan(false);
        else if (mode === "namePercent") placed = plan(true);
        else {
            const conPct = plan(true), solo = plan(false);
            placed = conPct.length >= solo.length ? conPct : solo;
        }
        if (!placed.length) return;
        const g = pg.append("g").attr("class", "dn-seglabels").style("pointer-events", "none");
        for (const l of placed) {
            const fill = this.hc ? this.hcFg : contrast("#FFFFFF", l.sa.color) >= contrast("#252423", l.sa.color) ? "#FFFFFF" : "#252423";
            const t = g.append("text").attr("class", "dn-seglabel").attr("data-key", l.sa.key).attr("x", cx + l.x).attr("y", cy + l.y).attr("dy", "0.35em")
                .attr("transform", "rotate(" + l.rot.toFixed(2) + " " + (cx + l.x).toFixed(2) + " " + (cy + l.y).toFixed(2) + ")")
                .attr("text-anchor", "middle").attr("font-size", fs).attr("fill", fill).text(l.text);
            Visual.svgFont(t, lf);
            if (this.hc) t.attr("paint-order", "stroke").attr("stroke", this.hcBg).attr("stroke-width", 3);
            else if (this.patternsOn) t.attr("paint-order", "stroke").attr("stroke", fill === "#FFFFFF" ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.8)").attr("stroke-width", 2.5);
        }
    }

    private drawLabels(pg: Sel<SVGGElement>, labels: PlacedLabel[]): void {
        const s = this.settings;
        const lf = this.lblFont;
        const g = pg.append("g").attr("class", "dn-labels").style("pointer-events", "none");
        const outColor = this.hc ? this.hcFg : String(s.labels.color || this.ink);
        for (const l of labels) {
            if (l.leader) {
                g.append("polyline").attr("class", "dn-leader").attr("points", l.leader.map(p => p.join(",")).join(" "))
                    .attr("fill", "none").attr("stroke", this.hc ? this.hcFg : this.mutedInk).attr("stroke-width", 1).attr("opacity", 0.8);
            }
            let fill = outColor;
            if (l.inside) {
                if (this.hc) fill = this.hcFg;
                else fill = contrast("#FFFFFF", l.e.color) >= contrast("#252423", l.e.color) ? "#FFFFFF" : "#252423";
            }
            const t = g.append("text").attr("class", "dn-label").attr("data-key", l.e.key).attr("x", l.x).attr("y", l.y).attr("dy", "0.35em")
                .attr("text-anchor", l.anchor).attr("font-size", l.fs).attr("fill", fill).text(l.text);
            Visual.svgFont(t, lf);
            if (l.inside && this.patternsOn && !this.hc) {
                t.attr("paint-order", "stroke").attr("stroke", fill === "#FFFFFF" ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.8)").attr("stroke-width", 2.5);
            }
            if (l.inside && this.hc) t.attr("paint-order", "stroke").attr("stroke", this.hcBg).attr("stroke-width", 3);
        }
    }

    /**
     * Suma de la selección en un panel, sin doble conteo: una categoría seleccionada cuenta entera (sus pares y miembros
     * no se suman otra vez); si no, cuentan sus miembros de «Otros» o sus pares seleccionados. El % suma los mismos
     * porcentajes redondeados que enseña el visual (sectores, miembros, pares), para no contradecirlo.
     */
    private selectionInfo(p: PanelDraw, ks: Set<string> = this.selKeys): { name: string; value: number; pct: number; fmt?: string } | null {
        let value = 0, pct = 0, n = 0, last = "";
        for (const e of p.entries) {
            if (ks.has(e.key)) { value += e.value; pct += e.pct; n++; last = e.key; continue; }
            if (e.isOther) e.members.forEach((c, i) => {
                if (!ks.has(c.key)) return;
                value += p.fkey !== null ? Math.max(0, c.byFacet.get(p.fkey)?.value ?? 0) : c.value;
                pct += e.memberPct[i] ?? 0; n++; last = c.key;
            });
            for (const sa of p.segArcs) if (sa.e.key === e.key && ks.has(sa.key)) { value += sa.value; pct += sa.pct; n++; last = sa.key; }
        }
        if (!n) return null;
        if (n === 1) return this.infoIn(p, last);
        return { name: this.tf("UI_NSelected", "{0} selected", String(n)), value, pct, fmt: this.model?.format };
    }

    /** Lo que enseña el centro de un panel para una clave (sector, miembro de "Otros" o par categoría·segmento). */
    private infoIn(p: PanelDraw, key: string | null): { name: string; value: number; pct: number; fmt?: string } | null {
        if (!key) return null;
        const e = p.entries.find(x => x.key === key);
        if (e) return { name: e.name, value: e.value, pct: e.pct, fmt: e.members[0].fmt };
        const sa = p.segArcs.find(x => x.key === key);
        if (sa) return { name: sa.e.name + " · " + sa.sd.name, value: sa.value, pct: sa.pct, fmt: sa.e.members[0].fmt };
        for (const o of p.entries) if (o.isOther) {
            const i = o.members.findIndex(c => c.key === key);
            if (i < 0) continue;
            const c = o.members[i];
            const v = p.fkey !== null ? Math.max(0, c.byFacet.get(p.fkey)?.value ?? 0) : c.value;
            return { name: c.name, value: v, pct: o.memberPct[i] ?? 0, fmt: c.fmt };
        }
        return null;
    }

    /**
     * Centro del donut: título + total de Values (en small multiples, el total de cada panel). Al pasar, seleccionar o
     * enfocar: "Nombre · valor · %". Se ajusta al hueco bajando la letra; si no cabe, se retira el título y luego todo
     * (nunca "…"). En el queso no hay centro.
     */
    private drawCenter(p: PanelDraw, focus: { name: string; value: number; pct: number; fmt?: string } | null): void {
        const g0 = p.geo;
        const m = this.model;
        const s = this.settings;
        if (!p.g) return;
        const gc = p.g.select<SVGGElement>(".dn-center");
        gc.selectAll("*").remove();
        if (!g0 || !m || s.slices.shape === "pie" || !s.center.show || g0.ri < 12) return;
        const color = this.hc ? this.hcFg : String(s.center.color || this.ink);
        const tColor = this.hc ? this.hcFg : String(s.center.titleColor || color);
        const vf = this.fontOf("center", "valueFontFamily", "valueBold", null, null);
        const tf = this.fontOf("center", "titleFontFamily", null, null, null);
        const rr = g0.ri * 0.9;
        const custom = String(s.center.title || "").trim();
        const title = focus ? focus.name : (custom || m.measureName);
        const cu = String(s.center.displayUnits), cd = this.numOpt("center");
        const v0 = focus ? focus.value : p.total, f0 = focus ? (focus.fmt ?? m.format) : m.format;
        // Auto = unidades automáticas; con unidades elegidas, solo esas.
        const values = [this.fmtValue(v0, f0, cu, cd, "compact")];
        const sub = focus ? this.fmtPct(focus.pct) : "";
        type CL = { text: string; fs: number; bold: boolean };
        // bold = la línea del valor (fuente del valor); las demás, la del título.
        const fits = (lines: CL[]) => {
            const lh = lines.map(l => l.fs * 1.15);
            const total = lh.reduce((a, b) => a + b, 0);
            let y = -total / 2;
            for (let i = 0; i < lines.length; i++) {
                const w = this.measure(lines[i].text, lines[i].fs, false, lines[i].bold ? vf : tf);
                const yt = y, yb = y + lh[i];
                const worst = Math.max(Math.abs(yt), Math.abs(yb));
                if (Math.hypot(w / 2, worst) > rr) return false;
                y = yb;
            }
            return true;
        };
        let chosen: CL[] | null = null;
        // Value size y Title size escalan con k; si el valor no cabe en el agujero, encoge y el título con él (misma proporción).
        const fv0 = this.fz(Number(s.center.fontSize));
        const ratio = Math.max(0.2, Math.min(2, Number(s.center.titleFontSize) / Math.max(1, Number(s.center.fontSize))));
        const build = (t: string, fv: number, v: string): { withAll: CL[]; noTitle: CL[] } => {
            const ft = Math.max(this.minFs, fv * ratio);
            const withAll: CL[] = [{ text: t, fs: ft, bold: false }, { text: v, fs: fv, bold: true }];
            if (sub) withAll.push({ text: sub, fs: ft, bold: false });
            const noTitle: CL[] = sub ? [{ text: v, fs: fv, bold: true }, { text: sub, fs: ft, bold: false }] : [{ text: v, fs: fv, bold: true }];
            return { withAll, noTitle };
        };
        if (focus && title) {
            // Un elemento señalado o seleccionado siempre lleva su nombre (Tino, 25-11: «9.72M / 70%» sin decir qué era):
            // antes que quitarlo, encoge el valor; después, solo la parte del segmento; al final, recortado.
            const titles = [title];
            const cut = title.lastIndexOf(" · ");
            const short = cut > 0 ? title.slice(cut + 3) : title;
            if (short !== title) titles.push(short);
            for (let n = short.length - 1; n >= 3; n--) titles.push(short.slice(0, n).trimEnd() + "…");
            outer: for (let fv = fv0; fv >= this.minFs; fv -= 1) {
                for (const t of titles) for (const v of values) {
                    const c = build(t, fv, v).withAll;
                    if (fits(c)) { chosen = c; break outer; }
                }
            }
        }
        for (let fv = fv0; fv >= this.minFs && !chosen; fv -= 1) {
            for (const v of values) {
                const c = build(title, fv, v);
                if (title && !focus && fits(c.withAll)) { chosen = c.withAll; break; }
                if (fits(c.noTitle)) { chosen = c.noTitle; break; }
            }
        }
        if (!chosen) return;
        const lh = chosen.map(l => l.fs * 1.15);
        let y = g0.cy - lh.reduce((a, b) => a + b, 0) / 2;
        chosen.forEach((l, i) => {
            const t = gc.append("text").attr("class", "dn-center-text").attr("data-part", l.bold ? "value" : "title").attr("x", g0.cx).attr("y", y + lh[i] / 2)
                .attr("dy", "0.35em").attr("text-anchor", "middle")
                .attr("font-size", l.fs).attr("fill", l.bold ? color : tColor).style("pointer-events", "none")
                .attr("opacity", l.bold || s.center.titleColor ? 1 : 0.85).text(l.text);
            Visual.svgFont(t as unknown as Sel<SVGTextElement>, l.bold ? vf : tf);
            y += lh[i];
        });
    }

    private message(W: number, H: number, text: string, notes: string[] = []): void {
        const el = document.createElement("div");
        el.className = "dn-msg";
        el.style.color = this.hc ? this.hcFg : this.mutedInk;
        el.style.fontSize = this.fz(11) + "px";
        const d = document.createElement("div");
        d.textContent = text;
        el.appendChild(d);
        for (const n of notes) { const x = document.createElement("div"); x.textContent = n; x.style.fontSize = "0.85em"; el.appendChild(x); }
        this.root.appendChild(el);
    }

    // ── Interacción ──────────────────────────────────────────────────────────

    private keyAt(e: Event): { key: string | null; toggle: boolean; sort: string | null; panel: number | null } {
        const t = e.target as Element | null;
        if (!t || !(t as any).closest) return { key: null, toggle: false, sort: null, panel: null };
        const so = t.closest("[data-sort]");
        if (so) return { key: null, toggle: false, sort: so.getAttribute("data-sort"), panel: null };
        if (t.closest("[data-toggle]")) return { key: OTHER_KEY, toggle: true, sort: null, panel: null };
        const el = t.closest("[data-key]");
        const pe = t.closest("[data-panel]");
        const pi = pe ? Number(pe.getAttribute("data-panel")) : NaN;
        return { key: el ? el.getAttribute("data-key") : null, toggle: false, sort: null, panel: this.smOn && isFinite(pi) ? pi : null };
    }

    private entryOf(key: string | null): Entry | null {
        if (!key) return null;
        return this.entries.find(e => e.key === key) ?? null;
    }

    private catOf(key: string): { c: Cat; e: Entry; i: number } | null {
        for (const e of this.entries) if (e.isOther) {
            const i = e.members.findIndex(c => c.key === key);
            if (i >= 0) return { c: e.members[i], e, i };
        }
        return null;
    }

    /** ¿La clave es algo seleccionable (sector, miembro de "Otros" o par categoría·segmento)? */
    private known(key: string | null): boolean {
        if (key && key.charAt(0) === "␜") return this.known(Visual.unscope(key).inner);
        return !!key && (!!this.entryOf(key) || !!this.catOf(key) || (this.segOn && !!this.pairOf(key)));
    }

    private onMove(e: MouseEvent): void {
        if (!this.model || !this.entries.length) return;
        const { key, panel } = this.keyAt(e);
        const hk = this.known(key) ? key : null;
        if (hk !== this.hoverKey) { this.hoverKey = hk; this.paintState(); }
        if (hk) this.showTip(hk, e.clientX, e.clientY, panel); else this.hideTip();
    }

    private onClick(e: MouseEvent): void {
        if (this.suppressClick) { this.suppressClick = false; return; }
        if (this.guideEl && this.guideEl.contains(e.target as Node)) return;
        if (!this.model || !this.entries.length) return;
        const { key, toggle, sort } = this.keyAt(e);
        if (sort) { e.stopPropagation(); if (!this.formatMode) this.setSort(sort); return; }
        if (toggle) { e.stopPropagation(); this.setExpanded(!this.otherExpanded); return; }
        if (!this.canInteract) return;
        if (this.known(key)) {
            // Small multiples, como los nativos: un sector de un panel selecciona esa clave en ese panel.
            const panel = this.keyAt(e).panel;
            const P = this.smOn && panel !== null ? this.panels.find(x => x.index === panel) : null;
            this.toggle(P && P.fkey !== null ? Visual.scoped(P.fkey, key) : key, e.ctrlKey || e.metaKey);
        } else {
            this.selKeys.clear();
            this.pushSelection();
            // Clic en vacío: también fuera el estado de foco (el siguiente Tab/flecha empieza de nuevo).
            this.kbMode = false;
            this.focusIdx = -1;
            this.paintState();
        }
    }

    // ── Lazo (FC.PROP07) ────────────────────────────────────────────────────
    // Arrastrar más de 6 px sobre el gráfico dibuja un rectángulo; entran los sectores que toca (en el anillo interior,
    // categorías; en el exterior, pares categoría · segmento), en todos los paneles. Ctrl (o Mayús) suma a la selección.
    // Un clic sin arrastre sigue siendo el clic normal. Sin update(), sin persistProperties; respeta allowInteractions.

    private rootPoint(e: { clientX: number; clientY: number }): [number, number] {
        const r = this.root.getBoundingClientRect();
        return [(e.clientX - r.left) / this.zoom, (e.clientY - r.top) / this.zoom];
    }

    private lassoStart(e: PointerEvent): void {
        if (e.button !== 0 || this.formatMode || !this.canInteract || this.settings.slices?.lasso === false || !this.entries.length) return;
        const t = e.target as Element | null;
        // Solo sobre el gráfico (no en la tabla, la leyenda, el asistente ni los botones).
        if (!t || !t.closest || !t.closest("svg.dn-svg") || t.closest(".dn-table, .dn-legend, .dn-guide, button")) return;
        const [x, y] = this.rootPoint(e);
        this.drag = { x0: x, y0: y, x1: x, y1: y, on: false, add: e.ctrlKey || e.metaKey || e.shiftKey, id: e.pointerId };
    }

    private lassoMove(e: PointerEvent): void {
        const d = this.drag;
        if (!d || e.pointerId !== d.id) return;
        const [x, y] = this.rootPoint(e);
        d.x1 = x; d.y1 = y;
        if (!d.on && Math.hypot(x - d.x0, y - d.y0) > 6) {
            d.on = true;
            try { this.root.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
            const NS = "http://www.w3.org/2000/svg";
            this.lassoEl = document.createElementNS(NS, "rect") as SVGRectElement;
            this.lassoEl.setAttribute("class", "dn-lasso");
            this.lassoEl.setAttribute("pointer-events", "none");
            this.lassoEl.setAttribute("stroke-dasharray", "4 3");
            this.lassoEl.setAttribute("stroke-width", "1.5");
            this.svg.node().appendChild(this.lassoEl);
            this.hideTip();
        }
        if (d.on) e.preventDefault();
        if (d.on && this.lassoEl) {
            this.lassoEl.setAttribute("x", String(Math.min(d.x0, x))); this.lassoEl.setAttribute("y", String(Math.min(d.y0, y)));
            this.lassoEl.setAttribute("width", String(Math.abs(x - d.x0))); this.lassoEl.setAttribute("height", String(Math.abs(y - d.y0)));
            this.lassoEl.setAttribute("stroke", this.focusColor);
            this.lassoEl.setAttribute("fill", this.hc ? "none" : "rgba(43,108,176,0.10)");
        }
    }

    private lassoEnd(e: PointerEvent): void {
        const d = this.drag;
        this.drag = null;
        if (!d || !d.on) return;
        try { this.root.releasePointerCapture(e.pointerId); } catch { /* nada */ }
        this.lassoEl?.remove(); this.lassoEl = null;
        // El clic que sigue al arrastre no es un clic.
        this.suppressClick = true;
        window.setTimeout(() => { this.suppressClick = false; }, 0);
        const keys = this.lassoHits(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
        if (!keys.length) return;
        if (!d.add) this.selKeys.clear();
        for (const k of keys) this.selKeys.add(k);
        this.pushSelection();
        this.paintState();
    }

    private lassoCancel(): void {
        this.drag = null;
        this.lassoEl?.remove(); this.lassoEl = null;
    }

    /** Claves que toca el rectángulo: muestreo de cada sector (ángulo × radio) y el centro del rectángulo dentro del sector. */
    private lassoHits(x0: number, y0: number, x1: number, y1: number): string[] {
        const out = new Set<string>();
        const inRect = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
        const touches = (cx: number, cy: number, a0: number, a1: number, r0: number, r1: number) => {
            if (a1 <= a0 || r1 <= r0) return false;
            const na = Math.max(3, Math.ceil((a1 - a0) * r1 / 5)), nr = Math.max(2, Math.ceil((r1 - r0) / 5));
            for (let i = 0; i <= na; i++) {
                const a = a0 + (a1 - a0) * i / na;
                for (let j = 0; j <= nr; j++) {
                    const r = r0 + (r1 - r0) * j / nr;
                    if (inRect(cx + Math.sin(a) * r, cy - Math.cos(a) * r)) return true;
                }
            }
            // Rectángulo pequeño dentro del sector.
            const mx = (x0 + x1) / 2 - cx, my = (y0 + y1) / 2 - cy;
            const rr = Math.hypot(mx, my);
            let am = Math.atan2(mx, -my);
            while (am < a0) am += 2 * Math.PI;
            while (am >= a0 + 2 * Math.PI) am -= 2 * Math.PI;
            return rr >= r0 && rr <= r1 && am <= a1;
        };
        for (const p of this.panels) {
            const g = p.geo;
            if (!g) continue;
            const sc = (k: string) => (this.smOn && p.fkey !== null ? Visual.scoped(p.fkey, k) : k);
            for (const a of p.arcs) if (touches(g.cx, g.cy, a.a0, a.a1, g.ri, g.Rin)) out.add(sc(a.e.key));
            for (const sa of p.segArcs) if (touches(g.cx, g.cy, sa.a0, sa.a1, g.Rin + this.ringSep(g.R), g.R)) out.add(sc(sa.key));
        }
        return Array.from(out);
    }

    /** Orden por cabecera de la tabla: solo en memoria (no se guarda en el informe ni llama a persistProperties). */
    private setSort(col: string): void {
        if (this.sortCol === col) this.sortDir = -this.sortDir;
        else { this.sortCol = col; this.sortDir = col === "name" ? 1 : -1; }
        const had = !!(document.activeElement && (document.activeElement as Element).closest && (document.activeElement as Element).closest("[data-sort]"));
        this.paint();
        if (had) {
            const b = this.root.querySelector<HTMLButtonElement>("[data-sort=\"" + col + "\"]");
            if (b) b.focus();
        }
        const lab = this.root.querySelector("[data-sort=\"" + col + "\"]");
        this.live.textContent = this.tf("UI_SortedBy", "Sorted by {0}", lab ? String(lab.textContent).replace(/[▲▼]/g, "").trim() : col)
            + ", " + (this.sortDir > 0 ? this.t("UI_Ascending", "ascending") : this.t("UI_Descending", "descending"));
    }

    private onContext(e: MouseEvent): void {
        e.preventDefault();
        if (!this.canInteract) return;
        const { key, panel } = this.keyAt(e);
        const P = this.smOn && panel !== null ? this.panels.find(x => x.index === panel) : null;
        const k = key && this.known(key) ? (P && P.fkey !== null ? Visual.scoped(P.fkey, key) : key) : null;
        this.selectionManager.showContextMenu(this.contextId(k), { x: e.clientX, y: e.clientY });
    }

    /**
     * Identidad para el menú contextual. showContextMenu admite una sola: si la marca cubre exactamente una fila, la
     * suya; si cubre varias (Segment, small multiples, Otros), ninguna (como un clic en el fondo), para que «Incluir»
     * o «Excluir» no actúen sobre una sola fila (el fallo de Refrescos → Nord Cola).
     */
    private contextId(key: string | null): ISelectionId {
        if (!key) return {} as ISelectionId;
        const rows = this.rowsOf(key);
        return rows.length === 1 ? this.rowId(rows[0]) : ({} as ISelectionId);
    }

    private setExpanded(on: boolean): void {
        if (this.otherExpanded === on) return;
        this.otherExpanded = on;
        // Desplegar cambia el alto de la tabla: repintado completo, sin rendering events.
        this.paint();
        if (this.hasFocus) this.root.focus();
    }

    /** Líneas de comparación y objetivo para el tooltip. */
    private proTipLines(items: VisualTooltipDataItem[], value: number, cmp: number | null, ch: Change | undefined, tgt: number | null, fmt: string | undefined): void {
        if (this.cmpOn && ch) {
            if (ch.isNew) items.push({ displayName: this.t("UI_Change", "Change"), value: this.tf("UI_NewTip", "New: no value in {0}", this.cmpName) });
            else if (ch.isGone) items.push({ displayName: this.t("UI_Change", "Change"), value: this.tf("UI_GoneTip", "Gone: no value now, {0} in {1}", this.fmtFull(cmp ?? 0, fmt), this.cmpName) });
            else {
                items.push({ displayName: this.cmpName, value: this.fmtFull(cmp ?? 0, fmt) });
                items.push({ displayName: this.t("UI_ShareChange", "Share change"), value: this.tf("UI_PP", "{0} pp", this.fmtPP(ch.dpp10)) });
                if (ch.dval !== null) items.push({ displayName: this.t("UI_Change", "Change"), value: this.fmtSignedPct(ch.dval) + " (" + (value - (cmp ?? 0) >= 0 ? "+" : "−") + this.fmtFull(Math.abs(value - (cmp ?? 0)), fmt) + ")" });
                if (ch.mix) items.push({ displayName: "⚠", value: this.mixText(ch) });
            }
        }
        if (this.tgtOn) {
            const st = this.tgtStatus(value, tgt);
            if (st) {
                items.push({ displayName: this.tgtName, value: this.fmtFull(tgt, fmt) });
                items.push({ displayName: this.t("UI_OfTarget", "% of target"), value: st.glyph + " " + this.fmtTgt(st.pct) + " · " + st.word });
            }
        }
    }

    private tipItems(key: string, panel: number | null): VisualTooltipDataItem[] {
        const m = this.model;
        const items: VisualTooltipDataItem[] = [];
        const P = panel !== null ? this.panels.find(p => p.index === panel) ?? null : null;
        if (P && this.smOn) items.push({ displayName: m.facetCol.source.displayName, value: P.title });
        const pr = this.segOn ? this.pairOf(key) : null;
        if (pr) {
            const scope = P ?? this.panels[0];
            const sa = scope.segArcs.find(x => x.key === key);
            const split = sa ? null : this.segSplit(pr.e, P ? P.fkey : null, 0)[pr.si];
            const v = sa ? sa.value : split ? split.v : 0;
            const base = P ? P.total : m.total;
            const ee = P ? P.entries.find(x => x.key === pr.e.key) : pr.e;
            items.push({ displayName: m.categoryName, value: pr.e.name, color: this.hc ? this.hcFg : pr.e.color });
            items.push({ displayName: m.segmentCol.source.displayName, value: pr.sd.name, color: this.hc ? this.hcFg : this.segColor(pr.e.color, pr.si, this.segListOf(pr.e).length) });
            items.push({ displayName: m.measureName, value: this.fmtFull(v, pr.e.members[0].fmt) });
            items.push({ displayName: this.t("UI_Share", "Share"), value: this.fmtPctRaw(base > 0 ? v / base : 0) });
            items.push({ displayName: this.tf("UI_ShareOf", "Share of {0}", pr.e.name), value: this.fmtPctRaw(ee && ee.value > 0 ? v / ee.value : 0) });
            return items;
        }
        const src = P ? P.entries : this.entries;
        const e = src.find(x => x.key === key) ?? null;
        const ch0 = e ? null : this.catOf(key);
        const name = e ? e.name : ch0 ? ch0.c.name : "";
        let value = e ? e.value : ch0 ? ch0.c.value : 0;
        let pct = e ? e.pct : ch0 ? ch0.e.memberPct[ch0.i] : 0;
        let cmp: number | null = e ? e.cmp : ch0 ? ch0.c.cmp : null;
        let tgt: number | null = e ? e.tgt : ch0 && ch0.c.tgt !== null && ch0.c.tgt > 0 ? ch0.c.tgt : null;
        let chg: Change | undefined = e ? e.ch : ch0 && ch0.e.memberCh ? ch0.e.memberCh[ch0.i] : undefined;
        if (!e && ch0 && P) {
            const pe = P.entries.find(x => x.isOther);
            const a = ch0.c.byFacet.get(P.fkey);
            value = Math.max(0, a?.value ?? 0);
            pct = pe ? pe.memberPct[ch0.i] ?? 0 : 0;
            cmp = a && a.nc ? a.cmp : null;
            tgt = a && a.nt && a.tgt > 0 ? a.tgt : null;
            chg = undefined;
        }
        const fmt = e ? e.members[0].fmt : ch0 ? ch0.c.fmt : m.format;
        const color = e ? e.color : ch0 ? ch0.e.color : undefined;
        items.push({ displayName: m.categoryName, value: name, color: this.hc ? this.hcFg : color });
        items.push({ displayName: m.measureName, value: this.fmtFull(value, fmt) });
        items.push({ displayName: this.t("UI_Share", "Share"), value: this.fmtPct(pct) });
        const hl = e ? e.hl : ch0 ? ch0.c.hl : null;
        if (m.hasHighlights && hl !== null && !P) items.push({ displayName: this.t("UI_Highlighted", "Highlighted"), value: this.fmtFull(hl, fmt) });
        if (this.pv(e ? e.key : ch0 ? ch0.e.key : null)) this.proTipLines(items, value, cmp, chg, tgt, fmt);
        if (e && e.isOther) {
            const mp = e.memberPct;
            e.members.slice(0, 10).forEach((c, i) => {
                const v = P ? Math.max(0, c.byFacet.get(P.fkey)?.value ?? 0) : c.value;
                items.push({ displayName: c.name, value: this.fmtFull(v, c.fmt) + " · " + this.fmtPct(mp[i] ?? 0) });
            });
            if (e.members.length > 10) items.push({ displayName: this.tf("UI_More", "+{0} more", String(e.members.length - 10)), value: "" });
        }
        // Anotaciones (Pro): el texto completo también en el tooltip.
        if (this.annOn && this.pv(e ? e.key : ch0 ? ch0.e.key : null)) {
            const cats = e ? (e.isOther ? [] : e.members) : ch0 ? [ch0.c] : [];
            for (const c of cats) for (const n of c.notes) items.push({ displayName: m.annotationCol.source.displayName, value: n });
        }
        // Small multiples: desde la tabla compartida, el detalle por panel.
        if (this.smOn && !P && (e || ch0)) {
            this.panels.slice(0, 12).forEach(pp => {
                const inf = this.infoIn(pp, key);
                if (inf) items.push({ displayName: pp.title, value: this.fmtFull(inf.value, fmt) + " · " + this.fmtPct(inf.pct) });
            });
            if (this.panels.length > 12) items.push({ displayName: this.tf("UI_More", "+{0} more", String(this.panels.length - 12)), value: "" });
        }
        // Medidas de Tooltips: solo si la categoría es una fila (sumar una media o un % entre filas daría un dato falso).
        const cat = e && !e.isOther ? e.members[0] : ch0 ? ch0.c : null;
        if (cat && cat.rows.length === 1) {
            for (const c of m.tooltipCols) {
                const v = c.values[cat.rows[0]];
                items.push({ displayName: c.name, value: typeof v === "number" ? this.fmtFull(v, c.format) : String(v ?? "") });
            }
        }
        return items;
    }

    private fmtPctRaw(x: number): string {
        const d = this.pctDec("labels");
        return this.fmtPct(Math.round(x * 100 * Math.pow(10, d)), d);
    }

    private showTip(key: string, clientX: number, clientY: number, panel: number | null = null): void {
        const ts: any = this.host.tooltipService;
        if (!ts || (ts.enabled && !ts.enabled())) return;
        const r = this.root.getBoundingClientRect();
        ts.show({ dataItems: this.tipItems(key, panel), identities: this.idsOf(key), coordinates: [clientX - r.left, clientY - r.top], isTouchEvent: false });
    }

    private hideTip(): void {
        try { this.host.tooltipService?.hide({ immediately: true, isTouchEvent: false }); } catch { /* nada */ }
    }

    // ── Selección ────────────────────────────────────────────────────────────

    /** Identidad de una categoría: todas las columnas de Category de su primera fila (cubre todas sus filas). */
    /** Selector de color por categoría (panel de formato): el de su primera fila, como hasta ahora. No se usa para filtrar. */
    private catId(c: Cat): ISelectionId {
        let id = this.idCache.get(c.key);
        if (!id) {
            let b = this.host.createSelectionIdBuilder();
            for (const col of this.model.catCols) b = b.withCategory(col, c.rows[0]);
            id = b.createSelectionId();
            this.idCache.set(c.key, id);
        }
        return id;
    }

    /**
     * Identidad de una FILA del dataView: withCategory(col, fila) para cada columna de categories (category, facet,
     * segment). Con varias columnas, Power BI ya da a categories[k].identity[i] la identidad de la fila completa: una
     * identidad «de categoría» hecha con la primera fila filtraba solo esa fila (defecto de la build .62: Refrescos
     * filtraba solo Nord Cola). Por eso cada marca envía las identidades de TODAS sus filas.
     */
    private rowId(r: number): ISelectionId {
        const ck = "row:" + r;
        let id = this.idCache.get(ck);
        if (!id) {
            let b = this.host.createSelectionIdBuilder();
            const m = this.model;
            for (const col of m.catCols) b = b.withCategory(col, r);
            if (m.facetCol) b = b.withCategory(m.facetCol, r);
            if (m.segmentCol) b = b.withCategory(m.segmentCol, r);
            id = b.createSelectionId();
            this.idCache.set(ck, id);
        }
        return id;
    }

    /**
     * Filas que cubre una clave (regla filtros-todas-las-filas): una categoría, todas sus filas (todos sus pares y todos
     * los paneles); «Otros», todas las filas de sus categorías; un par, sus filas en todos los paneles (el clic en un
     * panel filtra igual que el de la leyenda o la tabla, que no son de un panel); un miembro de «Otros», sus filas.
     */
    private rowsOf(key: string): number[] {
        const u = Visual.unscope(key);
        if (u.fkey !== null) return this.rowsIn(u.inner, u.fkey);
        const pr = this.segOn ? this.pairOf(key) : null;
        if (pr) {
            const out: number[] = [];
            const keys = this.segListOf(pr.e)[pr.si].keys;
            for (const c of pr.e.members) for (const k of keys) { const a = c.bySeg.get(k); if (a) for (const r of a.rows) out.push(r); }
            return out;
        }
        const e = this.entryOf(key);
        if (e) return ([] as number[]).concat(...e.members.map(c => c.rows));
        const ch = this.catOf(key);
        return ch ? ch.c.rows.slice() : [];
    }

    /** Filas de una clave dentro de un panel (las de su valor de Small multiples). */
    private rowsIn(key: string, fkey: string): number[] {
        const out: number[] = [];
        const push = (a: { rows: number[] } | undefined) => { if (a) for (const r of a.rows) out.push(r); };
        const pr = this.segOn ? this.pairOf(key) : null;
        if (pr) {
            const keys = this.segListOf(pr.e)[pr.si].keys;
            for (const c of pr.e.members) for (const k of keys) push(c.parts.get(fkey + "␟" + k));
            return out;
        }
        const e = this.entryOf(key);
        const cats = e ? e.members : (this.catOf(key) ? [this.catOf(key).c] : []);
        for (const c of cats) push(c.byFacet.get(fkey));
        return out;
    }

    private idsOf(key: string): ISelectionId[] {
        return this.rowsOf(key).map(r => this.rowId(r));
    }

    /**
     * La selección normalizada, para que lo dibujado, el centro y lo que filtra Power BI sean lo mismo (Tino, 25-11):
     * una categoría seleccionada (o «Otros») absorbe sus pares y sus miembros; si todos los pares con filas de una
     * categoría están seleccionados, pasa a ser la categoría.
     */
    private normalizeSel(): void {
        if (!this.selKeys.size || !this.model) return;
        // Por panel: la clave global cubre sus versiones por panel; una categoría en un panel cubre sus pares y miembros
        // en ese panel.
        for (const k of Array.from(this.selKeys)) {
            const u = Visual.unscope(k);
            if (u.fkey === null) continue;
            const pr = this.segOn ? this.pairOf(u.inner) : null;
            const owner = pr ? pr.e.key : (this.entryOf(u.inner) ? u.inner : this.catOf(u.inner)?.e.key ?? null);
            const covered = this.selKeys.has(u.inner) || (owner !== null && owner !== u.inner && (this.selKeys.has(owner) || this.selKeys.has(Visual.scoped(u.fkey, owner))));
            if (covered) this.selKeys.delete(k);
        }
        for (const e of this.entries) {
            const segKeys = this.segOn ? this.segListOf(e).map(it => Visual.pairKey(e.key, it.sd.key)) : [];
            if (!this.selKeys.has(e.key) && segKeys.length && segKeys.every(k => this.selKeys.has(k))) this.selKeys.add(e.key);
            if (e.isOther && !this.selKeys.has(e.key) && e.members.length && e.members.every(c => this.selKeys.has(c.key))) this.selKeys.add(e.key);
            if (this.selKeys.has(e.key)) {
                segKeys.forEach(k => this.selKeys.delete(k));
                for (const k of Array.from(this.selKeys)) if (k.indexOf(e.key + "␞") === 0) this.selKeys.delete(k);
                if (e.isOther) e.members.forEach(c => this.selKeys.delete(c.key));
            }
        }
    }

    /** Identidades de la selección: las de todas las filas que cubre, sin repetir ninguna (la unión es exacta). */
    private selectionIds(): ISelectionId[] {
        return Array.from(this.selectedRows()).map(r => this.rowId(r));
    }

    /** Filas de la selección (normalizada), sin repetir. Se cuentan antes de construir identidades (tope MAX_SELECT_IDS). */
    private selectedRows(): Set<number> {
        this.normalizeSel();
        const rows = new Set<number>();
        for (const k of this.selKeys) for (const r of this.rowsOf(k)) rows.add(r);
        return rows;
    }

    /**
     * Envía la selección a Power BI. Si pasa del tope de identidades, no filtra fuera: la selección se dibuja solo aquí
     * y un aviso lo dice (y la región viva lo lee). Nunca persistProperties.
     */
    private pushSelection(): void {
        let n = 0;
        try {
            const rows = this.selKeys.size ? this.selectedRows() : new Set<number>();
            n = rows.size;
            this.localOnly = n > MAX_SELECT_IDS;
            // Por encima del tope no se llama a select(): nada hacia fuera (ni a los marcadores), con aviso.
            if (!n || this.localOnly) this.selectionManager.clear();
            else this.selectionManager.select(Array.from(rows).map(r => this.rowId(r)), false)?.catch?.(() => { /* el host rechazó la selección */ });
        } catch (e) {
            console.error("[DonutChart]", e);
        }
        this.showLocalNote(n);
    }

    /** Un fallo en un callback de interacción nunca llega al host: se registra y el visual sigue. */
    private safe<A extends unknown[]>(fn: (...a: A) => void): (...a: A) => void {
        return (...a: A) => { try { fn(...a); } catch (e) { console.error("[DonutChart]", e); } };
    }

    private showLocalNote(n: number = this.selN): void {
        this.selN = n;
        let el = this.root.querySelector<HTMLDivElement>(".dn-selnote");
        if (!this.localOnly) { if (el) el.remove(); return; }
        if (!el) { el = document.createElement("div"); el.className = "dn-selnote"; this.root.appendChild(el); }
        // Apilado encima de las notas del pie (y de los avisos de edición), sin pisarlas; el texto se ajusta en líneas.
        let bottom = 4;
        this.root.querySelectorAll<HTMLElement>(".dn-notes, .dn-table[data-pos=bottom], .dn-legend[data-pos=bottom]").forEach(nb => { bottom = Math.max(bottom, this.H - nb.offsetTop + 4); });
        el.style.bottom = bottom + "px";
        // El consejo depende de la estructura: con una sola columna no hay Segment ni small multiples que quitar.
        el.textContent = this.model?.segmentCol || this.model?.facetCol
            ? this.tf("UI_LocalSel", "Too many rows to filter other visuals ({0}) — select fewer items or remove Segment/Small multiples", this.int(n))
            : this.tf("UI_LocalSelOne", "Too many items to filter other visuals ({0}) — select fewer items", this.int(n));
        this.styleFootnotes(el);
        el.style.background = this.hc ? this.hcBg : this.bgColor;
        this.live.textContent = el.textContent;
    }

    /** Cuánto de una categoría está seleccionado: entera, en parte (pares o miembros de «Otros») o nada. */
    private selLevel(e: Entry, fkey?: string | null): "full" | "part" | "none" {
        if (fkey !== undefined && fkey !== null) {
            // En un panel: las claves globales y las de ese panel.
            const ks = this.keysIn(fkey);
            if (ks.has(e.key)) return "full";
            if (e.isOther && e.members.some(c => ks.has(c.key))) return "part";
            for (const k of ks) if (k.indexOf(e.key + "␞") === 0) return "part";
            return "none";
        }
        if (this.selKeys.has(e.key)) return "full";
        // Fuera de los paneles (leyenda, tabla del Total): una selección solo en algunos paneles es parcial.
        for (const k of this.selKeys) {
            const u = Visual.unscope(k);
            if (u.fkey !== null && (u.inner === e.key || u.inner.indexOf(e.key + "␞") === 0 || e.members.some(c => c.key === u.inner))) return "part";
        }
        if (e.isOther && e.members.some(c => this.selKeys.has(c.key))) return "part";
        const pre = e.key + "␞";
        for (const k of this.selKeys) if (k.indexOf(pre) === 0) return "part";
        return "none";
    }

    /** select(lista) no alterna: la selección se calcula aquí y se pasa entera (o clear si queda vacía). */
    private toggle(key: string, multi: boolean): void {
        const pr = this.segOn && key.charAt(0) !== "␜" ? this.pairOf(key) : null;
        if (multi && pr && this.selKeys.has(pr.e.key)) {
            // Ctrl+clic en un par de una categoría seleccionada entera: queda la categoría menos ese par.
            this.selKeys.delete(pr.e.key);
            for (const it of this.segListOf(pr.e)) {
                const k = Visual.pairKey(pr.e.key, it.sd.key);
                if (k !== key) this.selKeys.add(k);
            }
        } else if (multi) { if (this.selKeys.has(key)) this.selKeys.delete(key); else this.selKeys.add(key); }
        else if (this.selKeys.size === 1 && this.selKeys.has(key)) this.selKeys.clear();
        else { this.selKeys.clear(); this.selKeys.add(key); }
        this.pushSelection();
        this.paintState();
    }

    /** Marcadores / selección externa: se casa por equals (getKey no coincide entre clic y marcador). Solo deriva. */
    private restoreSelection(ids: ISelectionId[]): void {
        if (!this.model || !this.entries.length) { this.pendingRestore = ids; return; }
        this.pendingRestore = null;
        this.selKeys.clear();
        if (!ids.length) return;
        // Las identidades son de fila: una categoría está seleccionada si lo están todas sus filas; si no, cada par con
        // todas sus filas. Se casa por getKey y, si no coincide (marcadores), por equals.
        const keyOf = (x: ISelectionId) => { try { return (x as any).getKey?.() ?? null; } catch { return null; } };
        const keys = new Set(ids.map(keyOf).filter(k => k !== null));
        const eq = (a: ISelectionId, b: ISelectionId) => { try { return a.equals(b) || b.equals(a); } catch { return false; } };
        let total = 0;
        for (const e of this.entries) for (const c of e.members) total += c.rows.length;
        const scan = ids.length * total <= 3e6;
        const memo = new Map<number, boolean>();
        const rowHit = (r: number) => {
            let v = memo.get(r);
            if (v === undefined) {
                const id = this.rowId(r);
                const k = keyOf(id);
                v = (k !== null && keys.has(k)) || (scan && ids.some(x => eq(x, id)));
                memo.set(r, v);
            }
            return v;
        };
        const all = (rows: number[]) => rows.length > 0 && rows.every(rowHit);
        for (const e of this.entries) {
            if (e.isOther) {
                const sel = e.members.filter(c => all(c.rows));
                if (sel.length === e.members.length) this.selKeys.add(e.key);
                else for (const c of sel) this.selKeys.add(c.key);
            } else if (all(e.members[0].rows)) this.selKeys.add(e.key);
            if (this.segOn && !this.selKeys.has(e.key)) {
                for (const it of this.segListOf(e)) {
                    const pk = Visual.pairKey(e.key, it.sd.key);
                    if (all(this.rowsOf(pk))) this.selKeys.add(pk);
                }
            }
            // Small multiples: lo que esté entero en un panel (categoría o par), por panel.
            if (this.smOn && !this.selKeys.has(e.key)) {
                for (const f of this.model.facets) {
                    const sk = Visual.scoped(f.key, e.key);
                    if (all(this.rowsOf(sk))) { this.selKeys.add(sk); continue; }
                    if (this.segOn) for (const it of this.segListOf(e)) {
                        const pk = Visual.pairKey(e.key, it.sd.key);
                        if (!this.selKeys.has(pk) && all(this.rowsOf(Visual.scoped(f.key, pk)))) this.selKeys.add(Visual.scoped(f.key, pk));
                    }
                }
            }
        }
        this.normalizeSel();
    }

    private pruneSelection(): void {
        if (!this.selKeys.size) return;
        const valid = new Set<string>();
        for (const e of this.entries) {
            valid.add(e.key);
            for (const c of e.members) valid.add(c.key);
            if (this.segOn) for (const it of this.segListOf(e)) valid.add(Visual.pairKey(e.key, it.sd.key));
        }
        const facets = new Set((this.model?.facets ?? []).map(f => f.key));
        for (const k of Array.from(this.selKeys)) {
            const u = Visual.unscope(k);
            if (!valid.has(u.inner) || (u.fkey !== null && (!this.smOn || !facets.has(u.fkey)))) this.selKeys.delete(k);
        }
    }

    private isSelected(e: Entry): boolean {
        if (this.selKeys.has(e.key)) return true;
        if (this.selLevel(e) !== "none") return true;
        if (e.isOther && e.members.some(c => this.selKeys.has(c.key))) return true;
        const pre = e.key + "␞";
        for (const k of this.selKeys) if (k.indexOf(pre) === 0) return true;
        return false;
    }

    /** Opacidades, foco y centro: sin redibujar ni emitir rendering events. */
    private paintState(): void {
        if (!this.panels.length || !this.panels.some(p => p.geo) || !this.entries.length) return;
        const any = this.selKeys.size > 0;
        const hover = this.hoverKey;
        const focus = this.hasFocus && this.kbMode ? this.focusItems()[this.focusIdx] : undefined;
        const hoverPair = hover ? this.pairOf(hover) : null;
        const hoverEntry = hover ? (this.entryOf(hover) ?? this.catOf(hover)?.e ?? hoverPair?.e ?? null) : null;
        this.svg.selectAll<SVGGElement, unknown>(".dn-sg").each((_d, i, nodes) => {
            const el = nodes[i];
            const e = this.entryOf(el.getAttribute("data-key"));
            if (!e) return;
            // Interior: entera = 1; solo algunos pares o miembros = parcial (0,6); nada = atenuado.
            const pi = el.getAttribute("data-panel");
            const P = this.smOn && pi !== null ? this.panels.find(x => x.index === Number(pi)) : null;
            const lv = any ? this.selLevel(e, P ? P.fkey : undefined) : "full";
            let op = lv === "full" ? 1 : lv === "part" ? 0.6 : 0.35;
            if (hoverEntry && hoverEntry.key !== e.key) op = Math.min(op, 0.6);
            el.setAttribute("opacity", String(op));
        });
        this.svg.selectAll<SVGGElement, unknown>(".dn-segg").each((_d, i, nodes) => {
            const el = nodes[i];
            const k = el.getAttribute("data-key"), parent = el.getAttribute("data-parent");
            const pi = el.querySelector("path.dn-seg")?.getAttribute("data-panel");
            const P = this.smOn && pi != null ? this.panels.find(x => x.index === Number(pi)) : null;
            const ks = P ? this.keysIn(P.fkey) : this.selKeys;
            const sel = ks.has(k) || ks.has(parent);
            let op = any && !sel ? 0.35 : 1;
            if (hover && hover !== k && hover !== parent) op = Math.min(op, 0.6);
            el.setAttribute("opacity", String(op));
        });
        this.svg.selectAll<SVGTextElement, unknown>(".dn-seglabel").each((_d, i, nodes) => {
            const k = nodes[i].getAttribute("data-key");
            const pr = this.pairOf(k);
            nodes[i].setAttribute("opacity", any && !(this.selKeys.has(k) || (pr && this.selKeys.has(pr.e.key))) ? "0.45" : "1");
        });
        this.svg.selectAll<SVGTextElement, unknown>(".dn-label").each((_d, i, nodes) => {
            const e = this.entryOf(nodes[i].getAttribute("data-key"));
            nodes[i].setAttribute("opacity", any && e && !this.isSelected(e) ? "0.45" : "1");
        });
        const focusKey = focus ? (focus.kind === "entry" ? focus.e.key : focus.kind === "child" ? focus.c.key : focus.key) : null;
        for (const box of [this.tableEl, this.legendEl]) {
            if (!box) continue;
            box.querySelectorAll<HTMLElement>("[data-row]").forEach(c => {
                const key = c.getAttribute("data-row");
                const e = this.entryOf(key);
                const pr = e ? null : this.pairOf(key);
                const ch = e || pr ? null : this.catOf(key);
                const lv = e ? this.selLevel(e) : (pr ? (this.selKeys.has(key) || this.selKeys.has(pr.e.key)) : ch ? (this.selKeys.has(key) || this.selKeys.has(OTHER_KEY)) : false) ? "full" : "none";
                c.style.opacity = !any || lv === "full" ? "1" : lv === "part" ? "0.7" : "0.45";
                const isFocus = focusKey === key && c.getAttribute("data-col") !== "ann";
                c.classList.toggle("dn-focusrow", isFocus);
                c.style.outlineColor = this.focusColor;
                c.style.backgroundColor = hover === key ? (this.hc ? "transparent" : "rgba(127,127,127,0.12)") : (c.getAttribute("data-bg") || "");
            });
            box.style.setProperty("--dn-focus-w", Number(this.settings.accessibility.focusWidth) + "px");
        }
        // Anillo de foco sobre el sector (o sobre "Otros" si el foco está en uno de sus miembros), en cada panel.
        const gap = Number(this.settings.slices.gap) || 0;
        for (const p of this.panels) {
            if (!p.g || !p.geo) continue;
            const fg = p.g.select<SVGGElement>(".dn-focus");
            fg.selectAll("*").remove();
            if (focus) {
                let d: string | null = null;
                if (focus.kind === "seg") {
                    const sa = p.segArcs.find(x => x.key === focus.key);
                    if (sa && sa.a1 > sa.a0) d = d3.arc<any>().innerRadius(p.geo.Rin + 2).outerRadius(p.geo.R)({ startAngle: sa.a0, endAngle: sa.a1 });
                } else {
                    const a = p.arcs.find(x => x.e.key === focus.e.key);
                    if (a && a.a1 > a.a0) d = d3.arc<any>().innerRadius(p.geo.ri).outerRadius(p.geo.Rin).padRadius(p.geo.Rin).padAngle(p.arcs.length > 1 ? gap / Math.max(p.geo.Rin, 1) : 0)({ startAngle: a.a0, endAngle: a.a1 });
                }
                if (d) fg.append("path").attr("d", d).attr("fill", "none").attr("stroke", this.focusColor)
                    .attr("stroke-width", Number(this.settings.accessibility.focusWidth) + 1).style("pointer-events", "none");
            }
        }
        // Centro (Tino, 25-11): 1) el elemento bajo el puntero; 2) la selección (uno: ese elemento; varios: «N selected» con
        // la suma sin doble conteo y su %); 3) el total. El foco de teclado no cambia el centro (la región viva lo lee).
        for (const p of this.panels) {
            if (!p.g || !p.geo) continue;
            let info = hover ? this.infoIn(p, hover) : null;
            const ks = this.keysIn(p.fkey);
            if (!info && ks.size === 1) info = this.infoIn(p, Array.from(ks)[0]);
            else if (!info && ks.size > 1) info = this.selectionInfo(p, ks);
            this.drawCenter(p, info);
        }
    }

    // ── Teclado: una parada de Tab; flechas por sectores y filas; Enter selecciona ──

    private focusItems(): FocusItem[] {
        const out: FocusItem[] = [];
        for (const e of this.entries) {
            out.push({ kind: "entry", e });
            if (e.isOther && this.otherExpanded && this.tableEl && this.tableEl.getAttribute("data-expanded") === "true") {
                e.members.forEach((c, i) => out.push({ kind: "child", e, c, i }));
            }
            if (this.segOn && this.pv(e.key)) this.segListOf(e).forEach((it, si) => out.push({ kind: "seg", e, sd: it.sd, si, key: Visual.pairKey(e.key, it.sd.key) }));
        }
        return out;
    }

    /** Lo que la región viva añade a una fila: cambio (Δ pp, Δ %, aviso de mezcla) y estado frente al objetivo. */
    private announcePro(value: number, ch: Change | undefined, tgt: number | null): string {
        let txt = "";
        if (this.cmpOn && ch) {
            if (ch.isNew) txt += ". " + this.tf("UI_NewTip", "New: no value in {0}", this.cmpName);
            else txt += ". " + this.tf("UI_AnnChange", "Share {0} points, value {1} vs {2}", this.fmtPP(ch.dpp10), ch.dval === null ? "—" : this.fmtSignedPct(ch.dval), this.cmpName);
            if (ch.mix) txt += ". " + this.mixText(ch);
        }
        if (this.tgtOn) {
            const st = this.tgtStatus(value, tgt);
            if (st) txt += ". " + this.tf("UI_AnnTarget", "{0} of target, {1}", this.fmtTgt(st.pct), st.word);
        }
        return txt;
    }

    private announce(): void {
        const items = this.focusItems();
        const it = items[this.focusIdx];
        if (!it) return;
        const pos = this.tf("UI_Pos", "{0} of {1}", String(this.focusIdx + 1), String(items.length));
        if (it.kind === "entry") {
            const e = it.e;
            let txt = e.name + ", " + this.fmtFull(e.value, e.members[0].fmt) + ", " + this.fmtPct(e.pct) + ", " + pos;
            if (this.pv(e.key)) {
                txt += this.announcePro(e.value, e.ch, e.tgt);
                if (this.annOn && !e.isOther && e.members[0].notes.length) txt += ". " + e.members[0].notes.join(". ");
            }
            if (e.isOther) txt += ". " + (this.otherExpanded ? this.t("UI_Collapse", "Left arrow collapses the list") : this.t("UI_Expand", "Right arrow expands the list"));
            if (this.isSelected(e)) txt += ". " + this.t("UI_Selected", "Selected");
            this.live.textContent = txt;
        } else if (it.kind === "child") {
            const ch = it.e.memberCh ? it.e.memberCh[it.i] : undefined;
            this.live.textContent = it.c.name + ", " + this.fmtFull(it.c.value, it.c.fmt) + ", " + this.fmtPct(it.e.memberPct[it.i]) + ", " + pos
                + (this.pv(it.e.key) ? this.announcePro(it.c.value, ch, it.c.tgt !== null && it.c.tgt > 0 ? it.c.tgt : null) + (this.annOn && it.c.notes.length ? ". " + it.c.notes.join(". ") : "") : "");
        } else {
            const x = this.segSplit(it.e, null, it.e.pct)[it.si];
            this.live.textContent = it.e.name + " · " + it.sd.name + ", " + this.fmtFull(x.v, it.e.members[0].fmt) + ", " + this.fmtPct(x.pct) + ", " + pos
                + (this.selKeys.has(it.key) ? ". " + this.t("UI_Selected", "Selected") : "");
        }
    }

    private onKey(e: KeyboardEvent): void {
        if (this.guideEl && this.guideEl.contains(e.target as Node)) return;
        // Botones de la tabla (ordenar por cabecera, desplegar "Otros"): su propio Enter/Espacio.
        const tgt = e.target as HTMLElement | null;
        if (tgt && tgt !== this.root && tgt.tagName === "BUTTON") return;
        const items = this.focusItems();
        if (!items.length) return;
        // Una tecla de navegación con el foco puesto por clic: se enseña el foco donde estaba (o en el primero), sin moverlo.
        const nav = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End", "Enter", " "].indexOf(e.key) >= 0;
        if (nav && (!this.kbMode || this.focusIdx < 0)) {
            const first = this.focusIdx < 0;
            this.kbMode = true;
            if (first) this.focusIdx = 0;
            if (first && e.key !== "Enter" && e.key !== " ") { e.preventDefault(); e.stopPropagation(); this.paintState(); this.announce(); return; }
        }
        let handled = true;
        const cur = items[this.focusIdx] ?? items[0];
        const curKey = cur.kind === "entry" ? cur.e.key : cur.kind === "child" ? cur.c.key : cur.key;
        switch (e.key) {
            case "ArrowRight":
                if (cur.kind === "entry" && cur.e.isOther && !this.otherExpanded && !!this.tableEl) { this.setExpanded(true); break; }
                this.focusIdx = Math.min(items.length - 1, this.focusIdx + 1); break;
            case "ArrowDown": this.focusIdx = Math.min(items.length - 1, this.focusIdx + 1); break;
            case "ArrowLeft":
                if ((cur.kind === "child" || (cur.kind === "entry" && cur.e.isOther && this.otherExpanded))) {
                    this.focusIdx = this.entries.indexOf(cur.e);
                    this.setExpanded(false);
                    this.focusIdx = Math.max(0, this.focusItems().findIndex(x => x.kind === "entry" && x.e.key === cur.e.key));
                    break;
                }
                this.focusIdx = Math.max(0, this.focusIdx - 1); break;
            case "ArrowUp": this.focusIdx = Math.max(0, this.focusIdx - 1); break;
            case "Home": this.focusIdx = 0; break;
            case "End": this.focusIdx = this.focusItems().length - 1; break;
            case "Enter": case " ":
                if (this.canInteract) this.toggle(curKey, e.ctrlKey || e.metaKey);
                break;
            case "Escape":
                if (this.canInteract) { this.selKeys.clear(); this.pushSelection(); }
                break;
            case "ContextMenu": case "F10": {
                if (e.key === "F10" && !e.shiftKey) { handled = false; break; }
                if (!this.canInteract) break;
                const r = this.root.getBoundingClientRect();
                const g = this.geo;
                const a = this.arcs.find(x => x.e.key === cur.e.key);
                const z = this.zoom;
                let x = r.left + (g ? g.cx : 0) * z, y = r.top + (g ? g.cy : 0) * z;
                if (a && g) { const am = (a.a0 + a.a1) / 2; x += Math.sin(am) * g.R * 0.8 * z; y -= Math.cos(am) * g.R * 0.8 * z; }
                this.selectionManager.showContextMenu(this.contextId(curKey), { x, y });
                break;
            }
            default: handled = false;
        }
        if (handled) {
            e.preventDefault(); e.stopPropagation();
            this.focusIdx = Math.max(0, Math.min(this.focusIdx, this.focusItems().length - 1));
            this.paintState();
            this.announce();
        }
    }

    // ── Landing, asistente ───────────────────────────────────────────────────

    private landingIcon(size: number): SVGSVGElement {
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg") as SVGSVGElement;
        svg.setAttribute("width", String(size)); svg.setAttribute("height", String(size)); svg.setAttribute("viewBox", "0 0 44 44");
        svg.setAttribute("aria-hidden", "true"); svg.setAttribute("class", "dn-l-icon");
        const hc = this.hc;
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("width", "44"); rect.setAttribute("height", "44"); rect.setAttribute("rx", "9");
        rect.setAttribute("fill", hc ? this.hcBg : "#1F4E8C");
        if (hc) { rect.setAttribute("stroke", this.hcFg); rect.setAttribute("stroke-width", "1.5"); }
        svg.appendChild(rect);
        const arc = d3.arc<any>().innerRadius(8).outerRadius(15);
        const parts: [number, number, string][] = [[0, 0.42, "#3FBF7F"], [0.42, 0.7, "#BFD7F2"], [0.7, 0.9, "#8FB8E8"], [0.9, 1, "#C8C6C4"]];
        for (const [a, b, c] of parts) {
            const p = document.createElementNS(NS, "path");
            p.setAttribute("d", arc({ startAngle: a * 2 * Math.PI + 0.03, endAngle: b * 2 * Math.PI - 0.03 }) || "");
            p.setAttribute("transform", "translate(22,22)");
            p.setAttribute("fill", hc ? "none" : c);
            if (hc) { p.setAttribute("stroke", this.hcFg); p.setAttribute("stroke-width", "1.2"); }
            svg.appendChild(p);
        }
        return svg;
    }

    /** Pantalla de inicio de la serie: tres pasos con el nombre de cada pozo, en tres tamaños y sin enlaces. */
    private renderLanding(W: number, H: number): void {
        const size = (W >= 600 && H >= 340) ? "l" : (W >= 360 && H >= 220) ? "m" : "s";
        const hc = this.hc;
        const fg = hc ? this.hcFg : "";
        const el = document.createElement("div");
        el.className = "dn-landing dn-landing-" + size;
        if (hc) el.style.background = this.hcBg;
        const mk = (tag: string, cls?: string, text?: string): HTMLElement => {
            const n = document.createElement(tag);
            if (cls) n.className = cls;
            if (text !== undefined) n.textContent = text;
            if (fg) n.style.color = fg;
            return n;
        };
        const cat = this.t("Role_Category", "Category"), val = this.t("Role_Values", "Values");
        const head = mk("div", "dn-l-head");
        head.appendChild(this.landingIcon(size === "l" ? 44 : size === "m" ? 34 : 26));
        const titles = mk("div");
        titles.appendChild(mk("div", "dn-l-title", "Donut & Pie Chart by TCViz"));
        if (size !== "s") titles.appendChild(mk("div", "dn-l-tag", size === "l"
            ? this.t("Landing_Tagline", "Shares that read at any size: a clear legend, a data table when you compare or set targets, labels that never truncate and percentages that add up to 100.")
            : this.t("Landing_TaglineShort", "Shares that read at any size.")));
        head.appendChild(titles);
        el.appendChild(head);
        if (size === "s") {
            el.appendChild(mk("p", "dn-l-do", this.tf("Landing_Small", "Add {0} and {1}.", cat, val)));
            this.root.appendChild(el);
            return;
        }
        const big = size === "l";
        const steps = mk("ol", "dn-l-steps");
        const step = (n: number, well: string, txt: string) => {
            const li = mk("li");
            const num = mk("b", "dn-l-n", String(n));
            if (hc) { num.style.background = fg; num.style.color = this.hcBg; }
            li.appendChild(num);
            const sp = mk("span");
            sp.appendChild(mk("strong", "dn-l-well", well));
            sp.appendChild(document.createTextNode(" · " + txt));
            li.appendChild(sp);
            steps.appendChild(li);
        };
        step(1, cat, big ? this.t("Landing_Drag1", "drag the field that names the slices: brand, region, channel") : this.t("Landing_Drag1Short", "drag a field"));
        step(2, val, big ? this.t("Landing_Drag2", "drag the measure the slices share") : this.t("Landing_Drag2Short", "drag a measure"));
        step(3, this.t("Role_Tooltips", "Tooltips"), big ? this.t("Landing_Drag3", "optional: more measures in the tooltip") : this.t("Landing_Drag3Short", "optional"));
        if (big) el.appendChild(mk("div", "dn-l-lbl", this.t("Landing_Start", "Start in 3 steps")));
        el.appendChild(steps);
        if (big) el.appendChild(mk("p", "dn-l-do", this.t("Landing_Rule", "3 to 8 categories read best as a donut; with more, or a hierarchy, a treemap reads better.")));
        this.root.appendChild(el);
    }

    /** Asistente, solo editando y con sitio: (1) los campos, (2) el estilo. persistProperties solo desde un clic. */
    private renderGuide(W: number, H: number): void {
        if (!this.guideEl) {
            this.guideEl = document.createElement("div");
            this.guideEl.className = "dn-guide";
            this.root.appendChild(this.guideEl);
        }
        const el = this.guideEl;
        while (el.firstChild) el.removeChild(el.firstChild);
        el.style.display = "none";
        const on = this.settings.style?.guide !== false;
        if (!this.editing || this.formatMode || !on || !this.canInteract || !this.model || W < 420 || H < 260) return;
        const hc = this.hc;
        const azul = hc ? this.hcSel : "#2B6CB0";
        const fg = hc ? this.hcFg : "#252423";
        const muted = hc ? fg : "#605E5C";
        el.style.display = "block";
        el.style.background = hc ? this.hcBg : "#FFFFFF";
        el.style.borderColor = azul;
        el.style.color = fg;
        el.setAttribute("role", "dialog");
        el.setAttribute("aria-label", this.t("Guide_Title", "Setup guide"));
        const mk = (tag: string, cls: string, text?: string): HTMLElement => {
            const n = document.createElement(tag); n.className = cls; if (text !== undefined) n.textContent = text; return n;
        };
        const boton = (texto: string, principal: boolean, accion: () => void): HTMLButtonElement => {
            const b = mk("button", "dn-g-btn", texto) as HTMLButtonElement;
            b.type = "button";
            b.style.borderColor = azul;
            b.style.background = principal ? azul : "transparent";
            b.style.color = principal ? (hc ? this.hcBg : "#FFFFFF") : azul;
            b.addEventListener("click", (e) => { e.stopPropagation(); accion(); });
            return b;
        };
        const terminar = () => { this.guideStep = 1; this.persistir("style", { guide: false }); };
        const cab = mk("div", "dn-g-head");
        const paso = mk("div", "", this.tf("Guide_Step2", "Setup · step {0} of 2", String(this.guideStep)));
        paso.style.color = azul;
        const cerrar = mk("button", "dn-g-close", "✕") as HTMLButtonElement;
        cerrar.type = "button";
        cerrar.title = this.t("Guide_Close", "Close the guide");
        cerrar.setAttribute("aria-label", cerrar.title);
        cerrar.style.color = muted;
        cerrar.addEventListener("click", (e) => { e.stopPropagation(); terminar(); });
        cab.appendChild(paso); cab.appendChild(cerrar);
        el.appendChild(cab);
        const titulo = mk("div", "dn-g-title");
        el.appendChild(titulo);
        const pie = mk("div", "dn-g-foot");
        const has = (role: string) => !!this.model?.hasRole(role);
        const fila = (hecho: boolean, nombre: string, porque: string) => {
            const f = mk("div", "dn-g-item");
            const marca = mk("span", "", hecho ? "✓" : "○");
            marca.setAttribute("aria-label", hecho ? this.t("Guide_Done", "added") : this.t("Guide_Todo", "not added"));
            marca.style.color = hecho ? (hc ? fg : "#107C10") : muted;
            const txt = mk("span", "");
            txt.appendChild(mk("b", "", nombre));
            txt.appendChild(document.createTextNode(" — " + porque));
            txt.style.color = hecho ? muted : fg;
            f.appendChild(marca); f.appendChild(txt);
            el.appendChild(f);
        };
        if (this.guideStep === 1) {
            titulo.textContent = this.t("Guide_Fields", "Your data");
            fila(true, this.t("Role_Category", "Category"), this.t("Guide_CategoryWhy", "one slice per value; small ones go to Other"));
            fila(has("values"), this.t("Role_Values", "Values"), this.t("Guide_ValuesWhy", "the measure the slices share; its total goes in the center"));
            fila(has("tooltips"), this.t("Role_Tooltips", "Tooltips"), this.t("Guide_TooltipsWhy", "more measures when you point at a slice"));
            const nota = mk("div", "dn-g-note", this.t("Guide_Wells", "Drag the fields into the field wells; this list updates by itself."));
            nota.style.color = muted;
            el.appendChild(nota);
            pie.appendChild(boton(this.t("Guide_Next", "Next"), true, () => { this.guideStep = 2; this.renderGuide(W, H); }));
        } else {
            titulo.textContent = this.t("Guide_Style", "Pick a style");
            const actual = String((this.dataView?.metadata?.objects as any)?.style?.template ?? "report");
            const rejilla = mk("div", "dn-g-grid");
            const nombres: [string, string, string][] = [["report", "Enum_template_report", "Report theme"], ["classic", "Enum_template_classic", "Classic"],
                ["boardroom", "Enum_template_boardroom", "Boardroom (Pro)"], ["ledger", "Enum_template_ledger", "Ledger (Pro)"],
                ["editorial", "Enum_template_editorial", "Editorial (Pro)"], ["signal", "Enum_template_signal", "Signal (Pro)"],
                ["aurora", "Enum_template_aurora", "Aurora (Pro)"], ["terrace", "Enum_template_terrace", "Terrace (Pro)"]];
            for (const [nombre, clave, def] of nombres) {
                const chip = mk("button", "dn-g-tpl") as HTMLButtonElement;
                chip.type = "button";
                chip.setAttribute("aria-pressed", String(nombre === actual));
                chip.style.borderColor = nombre === actual ? azul : "#C8C6C4";
                chip.style.borderWidth = nombre === actual ? "2px" : "1px";
                chip.appendChild(this.miniDonut(nombre, hc));
                chip.appendChild(mk("div", "", this.isPro ? this.t(clave, def).replace(/\s*\(Pro\)\s*$/, "") : this.t(clave, def)));
                chip.addEventListener("click", (e) => { e.stopPropagation(); this.persistir("style", { template: nombre }); });
                rejilla.appendChild(chip);
            }
            el.appendChild(rejilla);
            if (!this.isPro) {
                const nota = mk("div", "dn-g-note", this.t("Guide_TryNote", "Without a licence they show under a watermark while you edit; reading view shows the free chart."));
                nota.style.color = muted;
                el.appendChild(nota);
            }
            pie.appendChild(boton(this.t("Guide_Back", "Back"), false, () => { this.guideStep = 1; this.renderGuide(W, H); }));
            pie.appendChild(boton(this.t("Guide_Finish", "Finish"), true, terminar));
        }
        el.appendChild(pie);
    }

    private miniDonut(nombre: string, hc: boolean): SVGSVGElement {
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg") as SVGSVGElement;
        svg.setAttribute("width", "64"); svg.setAttribute("height", "36"); svg.setAttribute("aria-hidden", "true");
        const pal: any = this.host.colorPalette;
        const tok = STYLE_TOKENS[nombre];
        if (tok && !hc) svg.style.background = tok.grad ?? tok.bg;
        const cols = tok ? tok.series.slice(0, 3) : nombre === "classic" ? CLASSIC.slice(0, 3)
            : [0, 1, 2].map(i => pal?.getColor?.("tcviz-mini-" + i)?.value ?? CLASSIC[i]);
        const arc = d3.arc<any>().innerRadius(8).outerRadius(15);
        [[0, 0.5], [0.5, 0.8], [0.8, 1]].forEach(([a, b], i) => {
            const p = document.createElementNS(NS, "path");
            p.setAttribute("d", arc({ startAngle: a * 2 * Math.PI, endAngle: b * 2 * Math.PI }) || "");
            p.setAttribute("transform", "translate(32,18)");
            p.setAttribute("fill", hc ? "none" : cols[i]);
            if (hc) { p.setAttribute("stroke", "#FFFFFF"); }
            svg.appendChild(p);
        });
        return svg;
    }

    /**
     * Al cambiar de estilo editando, se quitan los colores guardados que el estilo nuevo define (si no, taparían su
     * paleta). Solo editando y solo cuando el estilo cambia (update() lo compara con tplVisto, que se actualiza en el
     * mismo update: el update que provoca el persist ve el mismo estilo y no repite). Solo las propiedades que de verdad
     * están guardadas: sin ninguna, no se llama a persistProperties y no hay update extra. Nunca en la selección.
     */
    private aplicarPlantilla(nombre: string): void {
        if (!this.editing) return;
        const t = TEMPLATES[nombre] ?? {};
        const saved: any = this.dataView?.metadata?.objects ?? {};
        const remove: any[] = [];
        for (const obj of Object.keys(t)) {
            const props = Object.keys(t[obj]).filter(p => saved?.[obj]?.[p] !== undefined);
            if (props.length) remove.push({ objectName: obj, selector: null, properties: props.reduce((acc: any, p) => { acc[p] = null; return acc; }, {}) });
        }
        if (remove.length) this.host.persistProperties({ remove });
    }

    private persistir(objectName: string, properties: any): void {
        this.host.persistProperties({ merge: [{ objectName, selector: null as any, properties }] });
    }

    private injectStyles(): void {
        const ID = "donut-chart-tcviz-styles";
        const doc = this.root.ownerDocument ?? document;
        if (doc.getElementById(ID)) return;
        const st = doc.createElement("style");
        st.id = ID;
        st.textContent = [
            ".dn-root:focus{outline:none}",
            ".dn-root:focus-visible{outline:2px solid #2B6CB0;outline-offset:-2px}",
            "@media (forced-colors: active){.dn-root:focus-visible{outline-color:Highlight}}",
        ].join("");
        (doc.head ?? this.root).appendChild(st);
    }

    // ── Panel de formato (desde la tabla de tools/formato.py) ───────────────

    private slice(obj: string, p: PropSpec): powerbi.visuals.FormattingSlice {
        const cur = this.settings?.[obj]?.[p.name];
        const value = cur === undefined ? p.def : cur;
        const descriptor = { objectName: obj, propertyName: p.name };
        const base = { uid: obj + "-" + p.name, displayName: this.t(p.key, p.label) };
        if (p.type === "bool") return { ...base, control: { type: "ToggleSwitch" as any, properties: { descriptor, value: !!value } } } as any;
        if (p.type === "num") return { ...base, control: { type: "NumUpDown" as any, properties: { descriptor, value: value === null || value === "" ? undefined : Number(value),
            options: { minValue: p.min !== undefined ? { type: 0, value: p.min } : undefined, maxValue: p.max !== undefined ? { type: 1, value: p.max } : undefined } } } } as any;
        if (p.type === "fill" && ((obj === "dataTable" && p.name === "headerBackground") || (obj === "slices" && p.name === "borderColor"))) {
            // Fondo de cabecera con fx (como "All slices"): comodín + ConstantOrRule; el color fijo se guarda a nivel general.
            const wild = dataViewWildcard.createDataViewWildcardSelector(dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals);
            return { ...base, control: { type: "ColorPicker" as any, properties: {
                descriptor: { ...descriptor, selector: wild, instanceKind: powerbi.VisualEnumerationInstanceKinds.ConstantOrRule, altConstantValueSelector: null },
                value: { value: String(value || "") } } } } as any;
        }
        if (p.type === "fill") return { ...base, control: { type: "ColorPicker" as any, properties: { descriptor, value: { value: String(value) } } } } as any;
        if (p.type === "enum") {
            const items = (p.items ?? []).map(([v, k, l]) => ({ value: v, displayName: this.t(k, l) }));
            const cur = items.find(it => it.value === value) ?? items[0];
            return { ...base, control: { type: "Dropdown" as any, properties: { descriptor, value: cur, items } } } as any;
        }
        return { ...base, control: { type: "TextInput" as any, properties: { descriptor, value: String(value), placeholder: "" } } } as any;
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        const cards: powerbi.visuals.FormattingCard[] = [];
        const has = (role: string) => !!this.model?.hasRole(role);
        for (const c of PANE) {
            // Las tarjetas Pro de un pozo aparecen con su campo puesto (como Small multiples en el nativo).
            if (c.uid === "compare" && !has("compare")) continue;
            if (c.uid === "target" && !has("target")) continue;
            if (c.uid === "annotations" && !has("annotation")) continue;
            if (c.uid === "smallMultiples" && !has("facet")) continue;
            const revert: powerbi.visuals.FormattingDescriptor[] = [];
            const groups: powerbi.visuals.FormattingGroup[] = [];
            let cardToggle: any;
            for (const g of c.groups) {
                const spec = OBJECTS[g.obj];
                const pie = this.settings.slices?.shape === "pie";
                const parts = this.objSlices(g.obj, p => p.name === g.toggle || (g.obj === "slices" && p.name === "innerRadius" && pie) || !this.propVisible(g.obj, p.name));
                spec.props.forEach(p => revert.push({ objectName: g.obj, propertyName: p.name }));
                const sinGrupo = parts.find(x => x.group === null);
                const grp: any = { uid: c.uid + "-" + g.obj + "-group", displayName: g.key ? this.t(g.key, g.label) : undefined, slices: sinGrupo ? sinGrupo.slices : [] };

                if (g.toggle) {
                    const tp = spec.props.find(p => p.name === g.toggle);
                    const ts: any = this.slice(g.obj, tp);
                    ts.suppressDisplayName = true;
                    if (c.groups.length === 1) cardToggle = ts; else grp.topLevelToggle = ts;
                }
                const named = parts.filter(x => x.group !== null);
                if (grp.slices.length || !named.length || grp.topLevelToggle) groups.push(grp);
                // Grupos con nombre (Center: Title / Value) a continuación del grupo principal.
                for (const x of named) {
                    const gl = GROUPS[x.group];
                    groups.push({ uid: c.uid + "-" + g.obj + "-" + x.group, displayName: gl ? this.t(gl[0], gl[1]) : x.group, slices: x.slices } as any);
                }
            }
            if (c.uid === "slices") {
                const colors = this.colorSlices();
                if (colors.length) {
                    groups.push({ uid: "slices-dataColors-group", displayName: this.t("Grp_dataColors", "Colors"), slices: colors } as any);
                    colors.forEach((sl: any) => revert.push(sl.control.properties.descriptor));
                }
            }
            const card: any = { uid: c.uid + "-card", displayName: this.t(c.key, c.label), groups, revertToDefaultDescriptors: revert };
            if (cardToggle) card.topLevelToggle = cardToggle;
            cards.push(card);
        }
        return { cards };
    }

    /**
     * Qué propiedades salen en el panel. Legend y Data table: con Position = Off solo la posición. Data table: cada
     * columna Pro solo con su pozo puesto, el formato de números solo con su columna visible, los colores de cabecera y
     * rejilla solo con cabecera y rejilla.
     */
    private propVisible(obj: string, name: string): boolean {
        const has = (r: string) => !!this.model?.hasRole(r);
        if (obj === "labels" && name === "segment") return has("segment");
        if (obj === "summary") return name === "show" || this.summaryOn;
        if (obj === "footnotes") return name === "show" || this.settings.footnotes?.show !== "off";
        if (obj === "slices" && (name === "borderWidth" || name === "borderColor")) return !!this.settings.slices?.border;
        if (obj === "legend") return name === "position" || this.settings.legend?.position !== "off";
        if (obj !== "dataTable") return true;
        const l = this.settings.dataTable ?? {};
        if (name === "position") return true;
        if (l.position === "off") return false;
        if ((name === "headerColor" || name === "headerBackground") && l.header === false) return false;
        if ((name === "gridColor" || name === "gridWidth") && l.gridlines === "none") return false;
        switch (name) {
            case "colChange": return has("compare");
            case "colTarget": return has("target");
            case "colNote": return has("annotation");
            case "segRows": return has("segment");
            case "displayUnits": case "valueDecimals": return l.colValue !== false;
            case "percentDecimals": return l.colShare !== false;
        }
        return true;
    }

    /**
     * Las tarjetas de un objeto: cada FontControl nativo (familia + tamaño + negrita/cursiva/subrayado) en el sitio de
     * su familia, y los grupos (Center: Title / Value) si el objeto los declara.
     */
    private objSlices(obj: string, skip: (p: PropSpec) => boolean): { group: string | null; slices: powerbi.visuals.FormattingSlice[] }[] {
        const spec = OBJECTS[obj];
        const fonts = FONTS[obj] ?? [];
        const used = new Set<string>();
        fonts.forEach(f => [f.family, f.size, f.bold, f.italic, f.underline].forEach(n => { if (n) used.add(n); }));
        const out: { group: string | null; slices: powerbi.visuals.FormattingSlice[] }[] = [];
        const push = (group: string | null, sl: powerbi.visuals.FormattingSlice) => {
            let g = out.find(x => x.group === group);
            if (!g) { g = { group, slices: [] }; out.push(g); }
            g.slices.push(sl);
        };
        for (const p of spec.props) {
            if (skip(p)) continue;
            const f = fonts.find(x => x.family === p.name);
            if (f) { push(p.group ?? null, this.fontSlice(obj, f)); continue; }
            if (used.has(p.name)) continue;
            push(p.group ?? null, this.slice(obj, p));
        }
        return out;
    }

    private fontSlice(obj: string, f: FontSpec): powerbi.visuals.FormattingSlice {
        const cur = this.settings?.[obj] ?? {};
        const d = (name: string) => ({ objectName: obj, propertyName: name });
        const sizeSpec = OBJECTS[obj].props.find(p => p.name === f.size);
        const props: any = {
            // Vacío = la fuente del estilo activo: el desplegable la enseña sin guardarla.
            fontFamily: { descriptor: d(f.family), value: String(cur[f.family] || this.font) },
            fontSize: { descriptor: d(f.size), value: Number(cur[f.size] ?? sizeSpec?.def ?? 10) },
        };
        if (f.bold) props.bold = { descriptor: d(f.bold), value: !!cur[f.bold] };
        if (f.italic) props.italic = { descriptor: d(f.italic), value: !!cur[f.italic] };
        if (f.underline) props.underline = { descriptor: d(f.underline), value: !!cur[f.underline] };
        return { uid: obj + "-" + f.uid, displayName: this.t(f.key, f.label), control: { type: "FontControl", properties: props } } as any;
    }

    /**
     * Colores (gratis): "All slices (fx)" con selector comodín (F04: createDataViewWildcardSelector; la regla se evalúa
     * por categoría; altConstantValueSelector null para que el color fijo se guarde a nivel general y el panel lo
     * recuerde) y un color por categoría con su selector (gana sobre la regla), como el nativo.
     */
    private colorSlices(): powerbi.visuals.FormattingSlice[] {
        if (this.hc || !this.model) return [];
        const out: any[] = [];
        const wild = dataViewWildcard.createDataViewWildcardSelector(dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals);
        out.push({ uid: "dataColors-rule", displayName: this.t("Prop_dataColors_rule", "All slices (fx)"), control: { type: "ColorPicker", properties: {
            descriptor: { objectName: "dataColors", propertyName: "rule", selector: wild, instanceKind: powerbi.VisualEnumerationInstanceKinds.ConstantOrRule,
                altConstantValueSelector: null },
            value: { value: String(this.settings.dataColors.rule || this.entries[0]?.color || "#118DFF") } } } });
        const cats = this.model.cats.slice().sort((a, b) => b.value - a.value).slice(0, 40);
        cats.forEach((c, i) => {
            const selector = (this.catId(c) as any).getSelector?.();
            const e = this.entries.find(x => !x.isOther && x.members[0] === c);
            out.push({ uid: "dataColors-cat-" + i, displayName: c.name, control: { type: "ColorPicker", properties: {
                descriptor: { objectName: "dataColors", propertyName: "fill", selector }, value: { value: e?.color ?? c.fill ?? "#A19F9D" } } } });
        });
        return out;
    }

    // ── Formato desde el lienzo (on-object) ──────────────────────────────────

    private cardLabel(obj: string): string {
        const spec = OBJECTS[obj];
        return spec ? this.t(spec.key, spec.label) : obj;
    }

    private propLabel(obj: string, prop: string): string {
        const p = OBJECTS[obj]?.props.find(x => x.name === prop);
        return p ? this.t(p.key, p.label) : prop;
    }

    private markSubSelectables(): void {
        const marcar = (sel: string, objeto: string, tipo: number) => {
            this.root.querySelectorAll(sel).forEach(el => {
                if (!this.formatMode) { el.classList.remove(HtmlSubSelectableClass); return; }
                el.classList.add(HtmlSubSelectableClass);
                el.setAttribute(SubSelectableObjectNameAttribute, objeto);
                el.setAttribute(SubSelectableDisplayNameAttribute, this.cardLabel(objeto));
                el.setAttribute(SubSelectableTypeAttribute, String(tipo));
            });
        };
        marcar(".dn-slices", "slices", 3);
        marcar(".dn-label", "labels", 1);
        marcar(".dn-center-text", "center", 1);
        marcar(".dn-legend", "legend", 1);
        marcar(".dn-table", "dataTable", 1);
        marcar(".dn-ring", "scaleRing", 3);
        marcar(".dn-sm-title", "smallMultiples", 1);
    }

    private getSubSelectionStyles(subs: powerbi.visuals.CustomVisualSubSelection[]): powerbi.visuals.SubSelectionStyles | undefined {
        const name = subs[0]?.customVisualObjects[0]?.objectName;
        const ref = (o: string, p: string) => ({ reference: { objectName: o, propertyName: p }, label: this.propLabel(o, p) });
        switch (name) {
            case "slices": return { type: 3, fill: ref("slices", "otherColor") } as any;
            case "labels": return { type: 1, fontFamily: ref("labels", "fontFamily"), fontSize: ref("labels", "fontSize"), fontColor: ref("labels", "color"),
                bold: ref("labels", "bold"), italic: ref("labels", "italic"), underline: ref("labels", "underline") } as any;
            case "center": return { type: 1, fontFamily: ref("center", "valueFontFamily"), fontSize: ref("center", "fontSize"), fontColor: ref("center", "color"), bold: ref("center", "valueBold") } as any;
            case "legend": case "dataTable": return { type: 1, fontFamily: ref(name, "fontFamily"), fontSize: ref(name, "fontSize"), fontColor: ref(name, "color"),
                bold: ref(name, "bold"), italic: ref(name, "italic"), underline: ref(name, "underline") } as any;
            case "scaleRing": return { type: 3, stroke: ref("scaleRing", "color") } as any;
            case "smallMultiples": return { type: 1, fontSize: ref("smallMultiples", "titleFontSize"), fontColor: ref("smallMultiples", "titleColor") } as any;
        }
        return undefined;
    }

    private getSubSelectionShortcuts(subs: powerbi.visuals.CustomVisualSubSelection[]): powerbi.visuals.VisualSubSelectionShortcuts | undefined {
        const name = subs[0]?.customVisualObjects[0]?.objectName;
        if (!name || !OBJECTS[name]) return undefined;
        const id = (o: string, p: string) => ({ objectName: o, propertyName: p });
        const toggle = (o: string, p: string) => ({ type: 2, ...id(o, p), relatedToggledFormattingIds: [id(o, p)],
            disabledLabel: this.propLabel(o, p), enabledLabel: this.propLabel(o, p) });
        const pick = (o: string, p: string) => ({ type: 3, ...id(o, p), label: this.propLabel(o, p) });
        const reset = (o: string) => ({ type: 0, relatedResetFormattingIds: OBJECTS[o].props.map(p => id(o, p.name)) });
        const nav = (o: string) => ({ type: 1, destinationInfo: { cardUid: "Visual-" + o + "-card" }, label: this.cardLabel(o) });
        const div = { type: 7 };
        switch (name) {
            case "slices": return [pick("slices", "shape"), pick("slices", "sort"), div, reset("slices"), nav("slices")] as any;
            case "labels": return [toggle("labels", "show"), pick("labels", "content"), pick("labels", "position"), div, reset("labels"), nav("labels")] as any;
            case "center": return [toggle("center", "show"), div, reset("center"), nav("center")] as any;
            case "legend": return [pick("legend", "position"), div, reset("legend"), nav("legend")] as any;
            case "dataTable": return [pick("dataTable", "position"), toggle("dataTable", "header"), pick("dataTable", "totalRow"), pick("dataTable", "gridlines"), div, reset("dataTable"), nav("dataTable")] as any;
            case "scaleRing": return [pick("scaleRing", "mode"), div, reset("scaleRing"), nav("scaleRing")] as any;
            case "smallMultiples": return [toggle("smallMultiples", "titleBold"), toggle("smallMultiples", "border"), toggle("smallMultiples", "sizeByTotal"), div, reset("smallMultiples"), nav("smallMultiples")] as any;
        }
        return undefined;
    }

    public destroy(): void {
        this.cancelLicenseIcon();
        this.hideTip();
        this.root.remove();
    }
}

function luminance(hex: string): number {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return 0.5;
    const n = parseInt(m[1], 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Color con transparencia (rgba) a partir de #RRGGBB; otros formatos, tal cual. */
function alpha(color: string, a: number): string {
    if (!/^#?[0-9a-f]{6}$/i.test(String(color).trim())) return color;
    const [r, g, b] = rgbOf(color);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
}

/** Familia del panel (p. ej. "Arial Black" o la pila de Segoe UI) como font-family de CSS válido y con reserva. */
function cssFamily(v: string): string {
    if (/[,'"]/.test(v)) return v;
    return "'" + v + "', " + FONT_DEFAULT;
}

function rgbOf(hex: string): [number, number, number] {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return [128, 128, 128];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toLab(hex: string): [number, number, number] {
    const lin = rgbOf(hex).map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    const x = (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047;
    const y = lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722;
    const z = (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIEDE2000. */
function deltaE2000(a: [number, number, number], b: [number, number, number]): number {
    const [L1, a1, b1] = a, [L2, a2, b2] = b;
    const rad = Math.PI / 180;
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Math.pow(Cm, 7) / (Math.pow(Cm, 7) + Math.pow(25, 7))));
    const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
    const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const h = (x: number, y: number) => { if (x === 0 && y === 0) return 0; const v = Math.atan2(y, x) / rad; return v < 0 ? v + 360 : v; };
    const h1p = h(a1p, b1), h2p = h(a2p, b2);
    const dL = L2 - L1, dC = C2p - C1p;
    let dh = 0;
    if (C1p * C2p !== 0) { dh = h2p - h1p; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
    const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh * rad / 2);
    const Lm = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2;
    let hm = h1p + h2p;
    if (C1p * C2p !== 0) { if (Math.abs(h1p - h2p) > 180) hm += h1p + h2p < 360 ? 360 : -360; hm /= 2; }
    const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
    const dTheta = 30 * Math.exp(-Math.pow((hm - 275) / 25, 2));
    const Rc = 2 * Math.sqrt(Math.pow(Cmp, 7) / (Math.pow(Cmp, 7) + Math.pow(25, 7)));
    const Sl = 1 + 0.015 * Math.pow(Lm - 50, 2) / Math.sqrt(20 + Math.pow(Lm - 50, 2));
    const Sc = 1 + 0.045 * Cmp, Sh = 1 + 0.015 * Cmp * T;
    const Rt = -Math.sin(2 * dTheta * rad) * Rc;
    return Math.sqrt(Math.pow(dL / Sl, 2) + Math.pow(dC / Sc, 2) + Math.pow(dH / Sh, 2) + Rt * (dC / Sc) * (dH / Sh));
}

function toHsl(hex: string): [number, number, number] {
    const [r, g, b] = rgbOf(hex).map(v => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min, sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const hh = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [hh * 60, sat, l];
}

function fromHsl(hh: number, sat: number, l: number): string {
    hh = ((hh % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * sat, x = c * (1 - Math.abs(((hh / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
    return "#" + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Croma (LCh): por debajo de ~15 el color se lee como gris. */
function chroma(hex: string): number { const [, a, b] = toLab(hex); return Math.hypot(a, b); }

/**
 * Candidatos para un color automático, del cambio más pequeño al mayor: el propio, luego luminosidad, luego tono.
 * Un gris de la paleta (croma < 15) se sustituye por tonos con color a su misma luminosidad.
 */
function colorCandidates(base: string): string[] {
    const [h0, s0, l0] = toHsl(base);
    const gray = chroma(base) < 15;
    const out: { c: string; cost: number }[] = [];
    if (!gray) out.push({ c: base.toUpperCase(), cost: 0 });
    const sats = gray ? [0.55, 0.75] : [Math.max(s0, 0.45), Math.max(0.75, s0)];
    const hues: number[] = [0];
    for (let d = 20; d <= 180; d += 20) { hues.push(d); if (d < 180) hues.push(-d); }
    for (const dh of gray ? hues.filter(x => x >= 0).concat(hues.filter(x => x < 0).map(x => x + 360)) : hues) {
        for (const dl of [0, 0.12, -0.12, 0.24, -0.24, 0.36, -0.36]) {
            for (let si = 0; si < sats.length; si++) {
                if (!gray && dh === 0 && dl === 0 && si === 0) continue;
                const l = Math.max(0.2, Math.min(0.85, (gray ? Math.max(0.35, Math.min(0.7, l0)) : l0) + dl));
                const c = fromHsl((gray ? 0 : h0) + dh, sats[si], l);
                if (chroma(c) < 15) continue;
                out.push({ c, cost: (gray ? 1 : Math.abs(dh) / 30) + Math.abs(dl) / 0.12 + si * 0.5 });
            }
        }
    }
    return out.sort((a, b) => a.cost - b.cost).map(x => x.c);
}

function contrast(a: string, b: string): number {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
