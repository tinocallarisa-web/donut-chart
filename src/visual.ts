/*
 * Donut & Pie Chart by TCViz — bloque 1 (motor gratuito).
 *
 * Gratis: donut y queso (radio interior, ángulo de inicio, separación), "Otros" honesto (Show at most / Group below %,
 * conjunto y orden globales, todas sus identidades al seleccionarlo), % por resto mayor que suman 100, negativos y
 * blancos fuera y contados en una nota, leyenda-tabla siempre visible con "Other (n) ▸" desplegable, etiquetas dentro →
 * fuera con guía en dos columnas → retiradas enteras (nunca "…"), centro con el total de Values, anillo de escala desde
 * el ángulo de inicio real, texto que escala con el visual, resaltado parcial, tooltips y tooltips de página, menú
 * contextual, teclado, tarjeta Accessibility, Report theme y Classic, landing y asistente, formato desde el lienzo.
 *
 * Pro (bloque 2, aún sin dibujar): Compare with, Target, Segment, Small multiples, Annotation. Los seis estilos de la
 * colección ya funcionan con vista previa bajo la marca común.
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
import { OBJECTS, PANE, PropSpec } from "./formatSpec";
import { buildModel, groupEntries, largestRemainder, Model, Entry, Cat, OTHER_KEY } from "./model";
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
    classic: { labels: { color: "#252423" }, center: { color: "#252423" }, legend: { color: "#252423" },
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
    TEMPLATES[k] = { labels: { color: t.text }, center: { color: t.text }, legend: { color: t.text },
        scaleRing: { color: t.axis }, slices: { otherColor: luminance(t.bg) < 0.2 ? "#8C8C8C" : "#A19F9D" } };
}
const FONT_DEFAULT = "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif";

/** "Report theme" (por defecto): los colores del tema del informe, como un visual nativo. */
function reportTemplate(host: IVisualHost): Settings {
    const pal: any = host.colorPalette;
    const fg: string = pal?.foreground?.value ?? "#252423";
    const soft: string = pal?.foregroundNeutralSecondary?.value ?? "#605E5C";
    const ter: string = pal?.foregroundNeutralTertiary?.value ?? "#A19F9D";
    return { labels: { color: fg }, center: { color: fg }, legend: { color: fg }, scaleRing: { color: soft }, slices: { otherColor: ter } };
}

let instanceCounter = 0;

/** Una parte de una etiqueta: se retiran en el orden valor → nombre → % (Tino, 24-11: el % es lo último). */
interface LabelPart { kind: "pct" | "val" | "name"; text: string; }
interface PlacedLabel { e: Entry; text: string; x: number; y: number; anchor: "middle" | "start" | "end"; inside: boolean; w: number; fs: number; leader?: [number, number][]; }
interface Geo { cx: number; cy: number; R: number; ri: number; ringR: number; ax: number; ay: number; aw: number; ah: number; }
interface Arc { e: Entry; a0: number; a1: number; idx: number; }
type FocusItem = { kind: "entry"; e: Entry } | { kind: "child"; e: Entry; c: Cat; i: number };

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
    private arcs: Arc[] = [];
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
    private canvasCtx: CanvasRenderingContext2D | null = null;
    private fmtCache = new Map<string, valueFormatter.IValueFormatter>();
    private idCache = new Map<string, ISelectionId>();

    // Estado de interacción (no se guarda: no va en marcadores salvo la selección)
    private otherExpanded = false;
    private hoverKey: string | null = null;
    private focusIdx = -1;
    private hasFocus = false;
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

        this.root.addEventListener("keydown", (e: KeyboardEvent) => this.onKey(e));
        this.root.addEventListener("focus", () => { this.hasFocus = true; if (this.focusIdx < 0) this.focusIdx = 0; this.paintState(); this.announce(); });
        this.root.addEventListener("blur", () => { this.hasFocus = false; this.hideTip(); this.paintState(); });
        this.root.addEventListener("click", (e: MouseEvent) => this.onClick(e));
        this.root.addEventListener("contextmenu", (e: MouseEvent) => this.onContext(e));
        this.root.addEventListener("mousemove", (e: MouseEvent) => this.onMove(e));
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
        const d = this.pctDec("legend");
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

    private measure(text: string, size: number, bold = false): number {
        if (!this.canvasCtx) {
            try { this.canvasCtx = document.createElement("canvas").getContext("2d"); } catch { this.canvasCtx = null; }
        }
        if (!this.canvasCtx) return text.length * size * 0.56;
        this.canvasCtx.font = (bold ? "600 " : "") + size + "px " + this.font;
        return this.canvasCtx.measureText(text).width;
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
                const saved = o?.[obj]?.[p.name];
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
     * Qué funciones Pro pide el informe. Bloque 1: solo los estilos de la colección (los pozos Pro existen pero aún no
     * dibujan nada: sin licencia, el donut es el gratis exacto y no se avisa de una función que no se ve).
     */
    private attemptedProFeatures(): { labels: string[]; signature: string; touched: Set<string> } {
        const objs: any = this.dataView?.metadata?.objects ?? {};
        const tpl = String(objs.style?.template ?? "");
        const groups: [string, boolean, string][] = [
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
            default: return id;
        }
    }

    /** La marca común, solo con una función Pro puesta y solo editando, en la franja baja del área del donut. */
    private updateWatermark(): void {
        const { labels } = this.attemptedProFeatures();
        const g = this.geo;
        if (!this.proPreview || !labels.length || !this.model || !g) { renderProWatermark(this.wm, null); this.wmZone.style.display = "none"; return; }
        const top = Math.max(g.cy + g.ri * 0.55, g.ay + g.ah * 0.62);
        const h = Math.max(40, g.ay + g.ah - top);
        Object.assign(this.wmZone.style, { display: "block", left: g.ax + "px", top: (g.ay + g.ah - h) + "px", width: g.aw + "px", height: h + "px" });
        renderProWatermark(this.wm, {
            width: g.aw, height: h * 2.2, title: this.t("UI_ProPreview", "Pro preview"), features: labels.map(l => this.featName(l)),
            highContrast: this.hc ? { foreground: this.hcFg, background: this.hcBg } : null,
        });
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
            this.events.renderingFailed(options, String(e));
            console.error("[DonutChart]", e);
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
        d3.select(this.root).selectAll(".dn-landing, .dn-msg, .dn-table, .dn-notes").remove();
        this.tableEl = null;
        this.geo = null;
        this.arcs = [];
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
        this.assignColors();
        if (this.pendingRestore) this.restoreSelection(this.pendingRestore);
        else if (!this.selKeys.size) {
            const ids = this.selectionManager.getSelectionIds?.() as ISelectionId[] | undefined;
            if (ids && ids.length) this.restoreSelection(ids);
        }
        this.pruneSelection();
        this.root.setAttribute("aria-label", this.tf("UI_Aria", "{0} chart: {1} by {2}, {3} categories, total {4}",
            s.slices.shape === "pie" ? this.t("Enum_shape_pie", "Pie") : this.t("Enum_shape_donut", "Donut"),
            m.measureName, m.categoryName, String(m.cats.length), this.fmtFull(m.total, m.format)));
        if (!this.entries.length) {
            this.message(W, H, this.t("UI_NoPositive", "No positive values to draw."), this.notesList());
            this.renderGuide(W, H);
            this.updateWatermark();
            return;
        }
        this.layoutAndDraw(W, H);
        if (TEST_STAMP && W >= 200) {
            this.svg.append("text").attr("x", 4).attr("y", 10).style("font-size", "9px")
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
     * Color por clave: lo guardado para la categoría > regla fx de su fila > "All slices" fijo > paleta. Los colores
     * automáticos no se repiten entre sectores visibles: si la paleta del tema (o del estilo) se queda corta, se
     * generan tonos más claros u oscuros del mismo color hasta que se distingan. "Otros" va siempre en un gris neutro,
     * fuera de la paleta y distinto de cualquier sector.
     */
    private assignColors(): void {
        const s = this.settings;
        const pal: any = this.host.colorPalette;
        const look = this.look;
        const styleCols = look ? Array.from(new Set(look.series.concat([look.plan, look.up, look.down]))) : null;
        const all = this.model.cats.slice().sort((a, b) => b.value - a.value);
        const fixedAll = String(s.dataColors.rule || "");
        const used: string[] = [];
        const auto: Entry[] = [];
        for (const e of this.entries) {
            if (e.isOther) continue;
            const c = e.members[0];
            const i = all.indexOf(c);
            if (this.hc) { e.color = this.hcBg; continue; }
            if (c.fill) e.color = c.fill;
            else if (c.rule) e.color = c.rule;
            else if (fixedAll) e.color = fixedAll;
            else {
                if (styleCols) e.color = styleCols[i % styleCols.length];
                else if (this.tplEfectiva === "classic") e.color = CLASSIC[i % CLASSIC.length];
                else e.color = pal?.getColor?.(c.name)?.value ?? CLASSIC[i % CLASSIC.length];
                auto.push(e);
                continue;
            }
            used.push(e.color);
        }
        // Otros: gris neutro (el del ajuste, o el del tema), distinto de los sectores.
        const other = this.entries.find(e => e.isOther);
        const grays = [String(s.slices.otherColor || "#A19F9D"), "#A19F9D", "#8A8886", "#C8C6C4", "#6E6E6E", "#D9D9D9", "#5A5A5A"];
        const otherColor = this.hc ? this.hcBg : grays.find(g => !used.some(u => deltaE2000(toLab(u), toLab(g)) < 12)) ?? grays[0];
        if (other) other.color = otherColor;
        if (this.hc) return;
        // Tonos automáticos perceptiblemente distintos: ΔE2000 ≥ 12 con cualquier sector visible y ≥ 20 con sus vecinos;
        // si variar la luminosidad no basta, se rota el tono. Ningún automático en gris (el gris es solo de "Otros").
        const fixed = this.entries.filter(e => !e.isOther && auto.indexOf(e) < 0).map(e => e.color).concat(other ? [otherColor] : []);
        const chosen = new Map<Entry, string>();
        const order = this.entries;
        for (const e of auto) {
            const idx = order.indexOf(e);
            const prev = idx > 0 ? order[idx - 1] : null;
            const next = idx === order.length - 1 ? order[0] : order[idx + 1];
            const neigh = [prev, next].filter(x => x && (x.isOther || auto.indexOf(x) < 0 || chosen.has(x))).map(x => chosen.get(x) ?? x.color);
            const others = fixed.concat(Array.from(chosen.values()));
            let bestC = e.color, bestScore = -Infinity;
            for (const c of colorCandidates(e.color)) {
                const lab = toLab(c);
                const minAll = others.length ? Math.min(...others.map(o => deltaE2000(lab, toLab(o)))) : 99;
                const minNb = neigh.length ? Math.min(...neigh.map(o => deltaE2000(lab, toLab(o)))) : 99;
                if (minAll >= 12 && minNb >= 20) { bestC = c; bestScore = Infinity; break; }
                const score = Math.min(minAll / 12, minNb / 20);
                if (score > bestScore) { bestScore = score; bestC = c; }
            }
            chosen.set(e, bestC);
            e.color = bestC;
        }
    }

    // ── Notas bajo la tabla ──────────────────────────────────────────────────

    private notesList(withRounded = true): string[] {
        const m = this.model;
        if (!m) return [];
        const out: string[] = [];
        const ex = m.excluded;
        const parts: string[] = [];
        if (ex.negative) parts.push(this.tf("UI_ExNeg", "{0} negative ({1})", this.int(ex.negative), this.fmtCompact(ex.negativeSum, m.format)));
        if (ex.blank) parts.push(this.tf("UI_ExBlank", "{0} blank", this.int(ex.blank)));
        if (ex.zero) parts.push(this.tf("UI_ExZero", "{0} zero", this.int(ex.zero)));
        if (parts.length) out.push(this.tf("UI_Excluded", "Excluded: {0}", parts.join(", ")));
        if (this.moreState === "incomplete") out.push(this.tf("UI_Incomplete", "Showing {0} rows; Other is incomplete", this.int(m.rowCount)));
        else if (this.moreState === "loading") out.push(this.tf("UI_Loading", "Loading more rows: {0} so far", this.int(m.rowCount)));
        if (withRounded && this.roundedNote) out.push(this.t("UI_Rounded", "Percentages rounded to add up to 100%"));
        return out;
    }

    // ── Disposición ──────────────────────────────────────────────────────────

    private layoutAndDraw(W: number, H: number): void {
        const s = this.settings;
        const pad = Math.max(2, Math.round(4 * this.k));
        let pos = String(s.legend.position);
        if (pos === "auto") pos = W / Math.max(1, H) >= 1.3 ? "right" : "bottom";
        let ax = pad, ay = pad, aw = W - 2 * pad, ah = H - 2 * pad;
        if (pos !== "off") {
            const t = this.fitTable(pos, W, H, pad);
            if (t) {
                this.tableEl = t.el;
                if (pos === "right") {
                    t.el.style.left = (W - pad - t.w) + "px";
                    t.el.style.top = Math.max(pad, Math.round((H - t.h) / 2)) + "px";
                    aw = W - 3 * pad - t.w;
                } else {
                    t.el.style.top = (H - pad - t.h) + "px";
                    t.el.style.left = Math.max(pad, Math.round((W - t.w) / 2)) + "px";
                    ah = H - 3 * pad - t.h;
                }
            }
        } else {
            const notes = this.notesList();
            if (notes.length) {
                const n = document.createElement("div");
                n.className = "dn-notes";
                Object.assign(n.style, { left: pad + "px", width: (W - 2 * pad) + "px", fontSize: this.fz(8.5) + "px", color: this.mutedInk });
                for (const t of notes) { const d = document.createElement("div"); d.textContent = t; n.appendChild(d); }
                this.root.appendChild(n);
                const h = n.offsetHeight;
                n.style.top = (H - pad - h) + "px";
                ah -= h + pad;
            }
        }
        this.drawDonut(Math.max(0, ax), Math.max(0, ay), Math.max(0, aw), Math.max(0, ah));
    }

    private get mutedInk(): string {
        if (this.hc) return this.hcFg;
        if (this.look) return this.look.axis;
        return (this.host.colorPalette as any)?.foregroundNeutralSecondary?.value ?? "#605E5C";
    }

    /**
     * La leyenda-tabla en su sitio y con todo su texto: baja la letra hasta el mínimo, quita la nota de redondeo, pliega
     * "Otros", pasa las cifras a compacto, quita cabecera y total y, solo si aun así no caben, pliega las últimas filas en
     * "+N more · x %" (suma 100, sin "…").
     */
    private fitTable(pos: string, W: number, H: number, pad: number): { el: HTMLDivElement; w: number; h: number } | null {
        const s = this.settings;
        const mini = W < 200 || H < 140;
        const maxW = pos === "right" ? Math.floor(W * (mini ? 0.55 : 0.5)) : W - 2 * pad;
        const maxH = pos === "right" ? H - 2 * pad : Math.floor(H * (mini ? 0.6 : 0.5));
        if (maxW < 40 || maxH < 12) return null;
        const o = {
            fs: this.fz(Number(s.legend.fontSize)), expanded: this.otherExpanded, fold: 0, compact: false,
            header: !!s.legend.header, total: s.legend.totalRow === "on" || (s.legend.totalRow === "auto" && s.slices.shape === "pie"),
            rounded: true,
        };
        let el: HTMLDivElement | null = null;
        for (let iter = 0; iter < 80; iter++) {
            el = this.buildTable(o);
            el.style.visibility = "hidden";
            el.style.left = "0px"; el.style.top = "0px";
            el.style.width = "max-content";
            this.root.appendChild(el);
            let w = Math.ceil(el.getBoundingClientRect().width);
            if (w > maxW) { el.style.width = maxW + "px"; w = maxW; }
            const h = Math.ceil(el.getBoundingClientRect().height);
            const fitsW = el.scrollWidth <= w + 1;
            if (h <= maxH && fitsW) {
                el.style.visibility = "";
                el.style.width = w + "px";
                return { el, w, h };
            }
            el.remove();
            if (o.fs > this.minFs) { o.fs = Math.max(this.minFs, o.fs - 0.5); continue; }
            if (o.rounded && this.roundedNote) { o.rounded = false; continue; }
            if (o.expanded) { o.expanded = false; continue; }
            if (!o.compact) { o.compact = true; continue; }
            if (mini && o.header) { o.header = false; continue; }
            if (o.total) { o.total = false; continue; }
            if (o.header) { o.header = false; continue; }
            if (o.fold < this.entries.length - 1) { o.fold = o.fold === 0 ? 2 : o.fold + 1; continue; }
            break;
        }
        return null;
    }

    private buildTable(o: { fs: number; expanded: boolean; fold: number; compact: boolean; header: boolean; total: boolean; rounded: boolean }): HTMLDivElement {
        const m = this.model;
        const s = this.settings;
        const el = document.createElement("div");
        el.className = "dn-table";
        el.setAttribute("role", "table");
        el.setAttribute("aria-label", this.t("Obj_legend", "Legend table"));
        const color = this.hc ? this.hcFg : String(s.legend.color || this.ink);
        Object.assign(el.style, { fontSize: o.fs + "px", color });
        const grid = document.createElement("div");
        grid.className = "dn-grid";
        el.appendChild(grid);
        const units = String(s.legend.displayUnits), dec = this.numOpt("legend");
        // Auto = cifra completa; en tamaño mini (o si no cabe) la tabla pasa a unidades automáticas.
        const val = (v: number, fmt: string | undefined) => this.fmtValue(v, fmt ?? m.format, o.compact && units === "auto" ? "auto" : units, dec, "full");
        const tp = this.tablePct();
        const dT = this.pctDec("legend");
        const pctOf = (key: string) => this.fmtPct(tp.pct.get(key) ?? 0, dT);
        const cell = (row: HTMLElement[], cls: string, text: string, key?: string): HTMLDivElement => {
            const c = document.createElement("div");
            c.className = "dn-c " + cls;
            c.textContent = text;
            if (key !== undefined) c.setAttribute("data-key", key);
            grid.appendChild(c);
            row.push(c);
            return c;
        };
        if (o.header) {
            const r: HTMLElement[] = [];
            cell(r, "dn-h dn-sw", "");
            cell(r, "dn-h dn-name", m.categoryName);
            cell(r, "dn-h dn-num", m.measureName);
            cell(r, "dn-h dn-num", "%");
            r.forEach(c => { c.style.color = this.mutedInk; c.style.borderBottomColor = this.hc ? this.hcFg : this.gridLine; });
        }
        const n = this.entries.length;
        const fold = o.fold >= 2 ? Math.min(o.fold, n - 1) : 0;
        const visible = this.entries.slice(0, n - fold);
        visible.forEach((e, idx) => {
            const r: HTMLElement[] = [];
            const sw = cell(r, "dn-sw", "", e.key);
            sw.appendChild(this.swatch(e, this.arcIndexOf(e, idx), o.fs));
            const nm = cell(r, "dn-name", e.isOther ? "" : e.name, e.key);
            if (e.isOther) {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "dn-toggle";
                b.setAttribute("data-toggle", "1");
                b.setAttribute("aria-expanded", String(o.expanded));
                b.textContent = e.name + " " + (o.expanded ? "▾" : "▸");
                b.style.color = color;
                nm.appendChild(b);
            }
            cell(r, "dn-num", val(e.value, e.members[0].fmt), e.key);
            cell(r, "dn-num", pctOf(e.key), e.key);
            r.forEach(c => c.setAttribute("data-row", e.key));
            if (e.isOther && o.expanded) {
                e.members.forEach((c, i) => {
                    const rr: HTMLElement[] = [];
                    cell(rr, "dn-sw", "", c.key);
                    const cn = cell(rr, "dn-name dn-child", c.name, c.key);
                    cn.style.color = this.mutedInk;
                    cell(rr, "dn-num dn-child", val(c.value, c.fmt), c.key);
                    cell(rr, "dn-num dn-child", pctOf(c.key), c.key);
                    rr.forEach(x => { x.setAttribute("data-row", c.key); x.setAttribute("data-child", "1"); });
                });
            }
        });
        if (fold) {
            const rest = this.entries.slice(n - fold);
            const r: HTMLElement[] = [];
            cell(r, "dn-sw", "");
            cell(r, "dn-name", this.tf("UI_More", "+{0} more", String(rest.reduce((a, e) => a + (e.isOther ? e.members.length : 1), 0))));
            cell(r, "dn-num", val(rest.reduce((a, e) => a + e.value, 0), m.format));
            cell(r, "dn-num", this.fmtPct(rest.reduce((a, e) => a + (tp.pct.get(e.key) ?? 0), 0), dT));
            r.forEach(c => { c.style.color = this.mutedInk; });
        }
        if (o.total) {
            const r: HTMLElement[] = [];
            cell(r, "dn-t dn-sw", "");
            cell(r, "dn-t dn-name", this.t("UI_Total", "Total"));
            cell(r, "dn-t dn-num", val(m.total, m.format));
            cell(r, "dn-t dn-num", this.fmtPct(100 * Math.pow(10, dT), dT));
            r.forEach(c => { c.style.borderTopColor = this.hc ? this.hcFg : this.gridLine; });
        }
        const notes = this.notesList(o.rounded);
        if (notes.length) {
            const nd = document.createElement("div");
            nd.className = "dn-note";
            nd.style.fontSize = Math.max(this.minFs, o.fs * 0.85) + "px";
            nd.style.color = this.mutedInk;
            for (const t of notes) { const d = document.createElement("div"); d.textContent = t; nd.appendChild(d); }
            el.appendChild(nd);
        }
        el.setAttribute("data-fold", String(fold));
        el.setAttribute("data-expanded", String(o.expanded));
        return el;
    }

    private get gridLine(): string {
        if (this.look) return this.look.grid;
        return (this.host.colorPalette as any)?.backgroundNeutral?.value ?? "#E1DFDD";
    }

    private arcIndexOf(e: Entry, fallback: number): number {
        const i = this.entries.indexOf(e);
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
        r.setAttribute("fill", e.color);
        if (this.hc) { r.setAttribute("stroke", this.hcFg); r.setAttribute("stroke-width", "1"); }
        svg.appendChild(r);
        if (this.patternsOn && idx > 0) {
            const p = document.createElementNS(NS, "rect");
            p.setAttribute("x", "0.5"); p.setAttribute("y", "0.5"); p.setAttribute("width", String(sz - 1)); p.setAttribute("height", String(sz - 1));
            p.setAttribute("fill", "url(#" + this.patternId(idx, e) + ")");
            svg.appendChild(p);
        }
        return svg;
    }

    // ── Donut ────────────────────────────────────────────────────────────────

    private get patternsOn(): boolean { return this.hc || !!this.settings.accessibility?.patterns; }

    private patternId(idx: number, e: Entry): string {
        return "dn-pat-" + this.instance + "-" + idx + (this.hc ? "h" : (luminance(e.color) > 0.45 ? "d" : "l"));
    }

    /** Tramas (Accessibility → Patterns, y siempre en alto contraste): una por posición, la primera lisa. */
    private ensurePatterns(defs: Sel<SVGDefsElement>): void {
        if (!this.patternsOn) return;
        const kinds = ["", "d45", "h", "d135", "v", "dots", "cross", "grid"];
        this.entries.forEach((e, i) => {
            if (i === 0) return;
            const id = this.patternId(i, e);
            const stroke = this.hc ? this.hcFg : (luminance(e.color) > 0.45 ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.75)");
            const kind = kinds[1 + ((i - 1) % (kinds.length - 1))];
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
        });
    }

    private drawDonut(ax: number, ay: number, aw: number, ah: number): void {
        const s = this.settings;
        const pie = s.slices.shape === "pie";
        const defs = this.svg.append("defs") as unknown as Sel<SVGDefsElement>;
        this.ensurePatterns(defs);
        const ringOn = s.scaleRing.mode !== "off";
        const R0full = Math.max(0, Math.min(aw, ah) / 2 - 2);
        if (R0full < 8) return;
        const ringSpace = ringOn ? Math.max(4, Math.round(R0full * 0.06)) + 2 : 0;
        const R0 = R0full - ringSpace;
        const cx = ax + aw / 2, cy = ay + ah / 2;
        const sa = (Number(s.slices.startAngle) || 0) * Math.PI / 180;
        // Ángulos: d3.pie con el orden ya decidido (el de la tabla), en sentido horario desde el ángulo de inicio.
        const pieGen = d3.pie<Entry>().sort(null).value(e => e.value).startAngle(sa).endAngle(sa + 2 * Math.PI);
        this.arcs = pieGen(this.entries).map((p, i) => ({ e: p.data, a0: p.startAngle, a1: p.endAngle, idx: i }));
        const labelsOn = !!s.labels.show;
        const fsL = this.fz(Number(s.labels.fontSize));
        const riOf = (r: number) => (pie ? 0 : r * Number(s.slices.innerRadius) / 100);
        let R = R0;
        let labels: PlacedLabel[] = [];
        if (labelsOn && this.arcs.length) {
            // Todas las etiquetas con el mismo contenido y la misma letra (Tino, 24-11). Con la tabla visible, siempre
            // dentro: se encoge la letra de todas a la vez hasta el mínimo y luego se recorta el contenido de todas
            // (valor → nombre → %); el sector que no admite ni la mínima se queda sin etiqueta (el dato está en la tabla).
            // Fuera con guía solo con la tabla en Off, donde la etiqueta es lo único que nombra el sector.
            const tableOn = !!this.tableEl;
            const pmode = String(s.labels.position);
            const mode: "inside" | "auto" | "outside" = tableOn || pmode === "inside" ? "inside" : pmode === "outside" ? "outside" : "auto";
            const levels = Math.max(...this.arcs.map(a => this.variants(this.labelParts(a.e)).length));
            const sizes: number[] = [];
            for (let f = fsL; f > this.minFs; f -= 0.5) sizes.push(f);
            sizes.push(this.minFs);
            const planAt = (level: number, f: number) => {
                let p = this.planLabels(R0, riOf(R0), cx, cy, ax, ay, aw, ah, f, ringSpace, level, mode);
                let r = R0;
                if (mode !== "inside" && p.needW > 0) {
                    const e = Math.max(6, f * 0.8);
                    const nr = Math.min(R0, aw / 2 - ringSpace - e - 6 - p.needW - 2);
                    if (nr < R0 && nr >= Math.max(R0 * 0.6, 24)) {
                        r = Math.floor(nr);
                        p = this.planLabels(r, riOf(r), cx, cy, ax, ay, aw, ah, f, ringSpace, level, mode);
                    }
                }
                return { p, r };
            };
            // La letra común la deciden los sectores legibles (los que admiten su etiqueta mínima a ≥ 0,75 × la letra base),
            // no el más pequeño: con esa letra, la etiqueta que no cabe en su sector se oculta (el dato está en la tabla).
            const fsLeg = Math.max(this.minFs, fsL * 0.75);
            const legible = new Set(planAt(levels - 1, fsLeg).p.placed.map(l => l.e));
            const floor = planAt(levels - 1, this.minFs);
            let best = floor;
            const fitsAll = (c: { p: { placed: PlacedLabel[] } }) => {
                if (!legible.size) return c.p.placed.length >= floor.p.placed.length;
                const got = new Set(c.p.placed.map(l => l.e));
                for (const e of legible) if (!got.has(e)) return false;
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
        const ri = pie ? 0 : R * Number(s.slices.innerRadius) / 100;
        const ringR = R + (ringOn ? 2 : 0);
        this.geo = { cx, cy, R, ri, ringR, ax, ay, aw, ah };

        const gap = Number(s.slices.gap) || 0;
        const arcGen = d3.arc<any>().innerRadius(ri).outerRadius(R).padRadius(R).padAngle(this.arcs.length > 1 ? gap / Math.max(R, 1) : 0)
            .cornerRadius(0);
        const g = this.svg.append("g").attr("class", "dn-slices");
        const hasHl = !!this.model.hasHighlights;
        for (const a of this.arcs) {
            const e = a.e;
            const sg = g.append("g").attr("class", "dn-sg").attr("data-key", e.key);
            const d = arcGen({ startAngle: a.a0, endAngle: a.a1 });
            const base = sg.append("path").attr("class", "dn-slice").attr("data-key", e.key).attr("d", d).attr("fill", e.color);
            if (this.hc) base.attr("stroke", this.hcFg).attr("stroke-width", 1.5);
            if (this.patternsOn && a.idx > 0) sg.append("path").attr("class", "dn-pat").attr("d", d).attr("fill", "url(#" + this.patternId(a.idx, e) + ")").style("pointer-events", "none");
            if (hasHl) {
                // Resaltado parcial: la parte resaltada con área proporcional (radio en √), el resto atenuado.
                const ratio = e.value > 0 ? Math.max(0, Math.min(1, (e.hl || 0) / e.value)) : 0;
                base.attr("fill-opacity", 0.35);
                if (ratio > 0) {
                    const rh = Math.sqrt(ri * ri + ratio * (R * R - ri * ri));
                    const hd = d3.arc<any>().innerRadius(ri).outerRadius(rh).padRadius(R).padAngle(this.arcs.length > 1 ? gap / Math.max(R, 1) : 0)({ startAngle: a.a0, endAngle: a.a1 });
                    sg.append("path").attr("class", "dn-hl").attr("d", hd).attr("fill", e.color).style("pointer-events", "none");
                }
            }
            sg.attr("transform", "translate(" + cx + "," + cy + ")");
        }
        if (ringOn) this.drawScaleRing(cx, cy, ringR, sa);
        this.svg.append("g").attr("class", "dn-focus").attr("transform", "translate(" + cx + "," + cy + ")");
        if (labelsOn) this.drawLabels(labels);
        this.svg.append("g").attr("class", "dn-center");
        this.drawCenter(null);
    }

    /** Anillo de escala: marcas a 25/50/75 % (o cada 10 %) desde el ángulo de inicio real, contraste ≥ 3:1. */
    private drawScaleRing(cx: number, cy: number, r: number, sa: number): void {
        const s = this.settings;
        let color = this.hc ? this.hcFg : String(s.scaleRing.color || this.mutedInk);
        if (!this.hc && contrast(color, this.bgColor) < 3) color = this.ink;
        const g = this.svg.append("g").attr("class", "dn-ring").attr("transform", "translate(" + cx + "," + cy + ")").style("pointer-events", "none");
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
        if (c === "auto") c = s.legend.position === "off" ? "namePercent" : "percent";
        const pct: LabelPart = { kind: "pct", text: this.fmtPct(e.pct) };
        const val: LabelPart = { kind: "val", text: this.fmtValue(e.value, e.members[0].fmt ?? this.model.format, String(s.labels.displayUnits), this.numOpt("labels"), "compact") };
        const name: LabelPart = { kind: "name", text: e.name };
        switch (c) {
            case "value": return [val];
            case "name": return [name];
            case "namePercent": return [name, pct];
            case "valuePercent": return [val, pct];
            case "all": return [name, val, pct];
            default: return [pct];
        }
    }

    /** Variantes de una etiqueta, de la completa a la mínima: se retira valor → nombre → % (el % es lo último que se quita). */
    private variants(parts: LabelPart[]): string[] {
        const out: string[] = [];
        let cur = parts.slice();
        out.push(cur.map(p => p.text).join(" · "));
        for (const kind of ["val", "name", "pct"] as const) {
            if (cur.length <= 1) break;
            if (cur.some(p => p.kind === kind)) { cur = cur.filter(p => p.kind !== kind); out.push(cur.map(p => p.text).join(" · ")); }
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
     * sector si cabe; si no, y se permite (tabla en Off), fuera con guía en dos columnas sin solapes; si no, retirada
     * entera. Nunca se recorta un texto. needW = ancho que pedirían las de fuera (para encoger el radio).
     */
    private planLabels(R: number, ri: number, cx: number, cy: number, ax: number, ay: number, aw: number, ah: number, fs: number, ringSpace: number,
        level: number, mode: "inside" | "auto" | "outside"): { placed: PlacedLabel[]; retired: number; needW: number } {
        const h = fs * 1.2;
        const gap = Number(this.settings.slices.gap) || 0;
        const placed: PlacedLabel[] = [];
        const outside: { a: Arc; text: string; am: number }[] = [];
        let retired = 0;
        const tryInside = (a: Arc, text: string): boolean => {
            const am = (a.a0 + a.a1) / 2;
            const radii = ri > 0 ? [(ri + R) / 2] : [R * 0.62, R * 0.72, R * 0.5];
            if (a.a1 - a.a0 >= 2 * Math.PI - 1e-6) radii.unshift(ri > 0 ? (ri + R) / 2 : 0);
            const w = this.measure(text, fs) + 2;
            for (const rm of radii) {
                const x = rm * Math.sin(am), y = -rm * Math.cos(am);
                if (this.fitsInSlice(x, y, w, h, a.a0, a.a1, ri, R, gap / 2 + 1)) {
                    placed.push({ e: a.e, text, x: cx + x, y: cy + y, anchor: "middle", inside: true, w, fs });
                    return true;
                }
            }
            return false;
        };
        for (const a of this.arcs) {
            const vars = this.variants(this.labelParts(a.e));
            const text = vars[Math.min(level, vars.length - 1)];
            if (mode !== "outside" && tryInside(a, text)) continue;
            if (mode === "inside") retired++;
            else outside.push({ a, text, am: (a.a0 + a.a1) / 2 });
        }
        if (!outside.length) return { placed, retired, needW: 0 };
        const e = Math.max(6, fs * 0.8);
        const needW = Math.max(...outside.map(o => this.measure(o.text, fs))) + 4;
        const rOut = R + ringSpace;
        const hOut = fs * 1.4;
        for (const side of [1, -1]) {
            const colX = cx + side * (rOut + e + 4);
            const avail = side > 0 ? ax + aw - (colX + 3) - 1 : colX - 3 - ax - 1;
            const mine = outside.filter(o => (Math.sin(o.am) >= 0 ? 1 : -1) === side);
            const items = mine.filter(o => this.measure(o.text, fs) + 2 <= avail).map(o => ({ o, ideal: cy - (rOut + e) * Math.cos(o.am) }));
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
                    w: this.measure(it.o.text, fs) + 2, fs, leader: [p0, p1, p2] });
            });
        }
        return { placed, retired, needW };
    }

    private drawLabels(labels: PlacedLabel[]): void {
        const s = this.settings;
        const g = this.svg.append("g").attr("class", "dn-labels").style("pointer-events", "none");
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
                .attr("text-anchor", l.anchor).attr("font-size", l.fs).attr("fill", fill).style("font-family", this.font).text(l.text);
            if (l.inside && this.patternsOn && !this.hc) {
                t.attr("paint-order", "stroke").attr("stroke", fill === "#FFFFFF" ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.8)").attr("stroke-width", 2.5);
            }
            if (l.inside && this.hc) t.attr("paint-order", "stroke").attr("stroke", this.hcBg).attr("stroke-width", 3);
        }
    }

    /**
     * Centro del donut: título + total de Values. Al pasar, seleccionar o enfocar: "Nombre · valor · %". Se ajusta al
     * hueco bajando la letra; si no cabe, se retira el título y luego todo (nunca "…"). En el queso no hay centro.
     */
    private drawCenter(focus: { name: string; value: number; pct: number; fmt?: string } | null): void {
        const g0 = this.geo;
        const m = this.model;
        const s = this.settings;
        const gc = this.svg.select<SVGGElement>(".dn-center");
        gc.selectAll("*").remove();
        if (!g0 || !m || s.slices.shape === "pie" || !s.center.show || g0.ri < 12) return;
        const color = this.hc ? this.hcFg : String(s.center.color || this.ink);
        const rr = g0.ri * 0.9;
        const custom = String(s.center.title || "").trim();
        const title = focus ? focus.name : (custom || m.measureName);
        const cu = String(s.center.displayUnits), cd = this.numOpt("center");
        const v0 = focus ? focus.value : m.total, f0 = focus ? (focus.fmt ?? m.format) : m.format;
        // Auto = unidades automáticas; con unidades elegidas, solo esas.
        const values = [this.fmtValue(v0, f0, cu, cd, "compact")];
        const sub = focus ? this.fmtPct(focus.pct) : "";
        const fits = (lines: { text: string; fs: number; bold: boolean }[]) => {
            const lh = lines.map(l => l.fs * 1.15);
            const total = lh.reduce((a, b) => a + b, 0);
            let y = -total / 2;
            for (let i = 0; i < lines.length; i++) {
                const w = this.measure(lines[i].text, lines[i].fs, lines[i].bold);
                const yt = y, yb = y + lh[i];
                const worst = Math.max(Math.abs(yt), Math.abs(yb));
                if (Math.hypot(w / 2, worst) > rr) return false;
                y = yb;
            }
            return true;
        };
        let chosen: { text: string; fs: number; bold: boolean }[] | null = null;
        for (let fv = this.fz(Number(s.center.fontSize)); fv >= this.minFs && !chosen; fv -= 1) {
            const ft = Math.max(this.minFs, fv * 0.45);
            for (const v of values) {
                const withAll = [{ text: title, fs: ft, bold: false }, { text: v, fs: fv, bold: true }];
                if (sub) withAll.push({ text: sub, fs: ft, bold: false });
                const noTitle = sub ? [{ text: v, fs: fv, bold: true }, { text: sub, fs: ft, bold: false }] : [{ text: v, fs: fv, bold: true }];
                if (title && fits(withAll)) { chosen = withAll; break; }
                if (fits(noTitle)) { chosen = noTitle; break; }
            }
        }
        if (!chosen) return;
        const lh = chosen.map(l => l.fs * 1.15);
        let y = g0.cy - lh.reduce((a, b) => a + b, 0) / 2;
        chosen.forEach((l, i) => {
            gc.append("text").attr("class", "dn-center-text").attr("x", g0.cx).attr("y", y + lh[i] / 2).attr("dy", "0.35em").attr("text-anchor", "middle")
                .attr("font-size", l.fs).attr("font-weight", l.bold ? 600 : 400).attr("fill", color).style("font-family", this.font).style("pointer-events", "none")
                .attr("opacity", l.bold ? 1 : 0.85).text(l.text);
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

    private keyAt(e: Event): { key: string | null; toggle: boolean } {
        const t = e.target as Element | null;
        if (!t || !(t as any).closest) return { key: null, toggle: false };
        if (t.closest("[data-toggle]")) return { key: OTHER_KEY, toggle: true };
        const el = t.closest("[data-key]");
        return { key: el ? el.getAttribute("data-key") : null, toggle: false };
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

    private onMove(e: MouseEvent): void {
        if (!this.model || !this.entries.length) return;
        const { key } = this.keyAt(e);
        const hk = key && (this.entryOf(key) || this.catOf(key)) ? key : null;
        if (hk !== this.hoverKey) { this.hoverKey = hk; this.paintState(); }
        if (hk) this.showTip(hk, e.clientX, e.clientY); else this.hideTip();
    }

    private onClick(e: MouseEvent): void {
        if (this.guideEl && this.guideEl.contains(e.target as Node)) return;
        if (!this.model || !this.entries.length) return;
        const { key, toggle } = this.keyAt(e);
        if (toggle) { e.stopPropagation(); this.setExpanded(!this.otherExpanded); return; }
        if (!this.canInteract) return;
        if (key && (this.entryOf(key) || this.catOf(key))) {
            this.toggle(key, e.ctrlKey || e.metaKey);
        } else {
            this.selKeys.clear();
            this.selectionManager.clear();
            this.paintState();
        }
    }

    private onContext(e: MouseEvent): void {
        e.preventDefault();
        if (!this.canInteract) return;
        const { key } = this.keyAt(e);
        const ids = key ? this.idsOf(key) : [];
        this.selectionManager.showContextMenu(ids[0] ?? ({} as ISelectionId), { x: e.clientX, y: e.clientY });
    }

    private setExpanded(on: boolean): void {
        if (this.otherExpanded === on) return;
        this.otherExpanded = on;
        // Desplegar cambia el alto de la tabla: repintado completo, sin rendering events.
        this.paint();
        if (this.hasFocus) this.root.focus();
    }

    private tipItems(key: string): VisualTooltipDataItem[] {
        const m = this.model;
        const items: VisualTooltipDataItem[] = [];
        const e = this.entryOf(key);
        const ch = e ? null : this.catOf(key);
        const name = e ? e.name : ch ? ch.c.name : "";
        const value = e ? e.value : ch ? ch.c.value : 0;
        const pct = e ? e.pct : ch ? ch.e.memberPct[ch.i] : 0;
        const fmt = e ? e.members[0].fmt : ch ? ch.c.fmt : m.format;
        const color = e ? e.color : ch ? ch.e.color : undefined;
        items.push({ displayName: m.categoryName, value: name, color: this.hc ? this.hcFg : color });
        items.push({ displayName: m.measureName, value: this.fmtFull(value, fmt) });
        items.push({ displayName: this.t("UI_Share", "Share"), value: this.fmtPct(pct) });
        const hl = e ? e.hl : ch ? ch.c.hl : null;
        if (m.hasHighlights && hl !== null) items.push({ displayName: this.t("UI_Highlighted", "Highlighted"), value: this.fmtFull(hl, fmt) });
        if (e && e.isOther) {
            e.members.slice(0, 10).forEach((c, i) => items.push({ displayName: c.name, value: this.fmtFull(c.value, c.fmt) + " · " + this.fmtPct(e.memberPct[i]) }));
            if (e.members.length > 10) items.push({ displayName: this.tf("UI_More", "+{0} more", String(e.members.length - 10)), value: "" });
        }
        // Medidas de Tooltips: solo si la categoría es una fila (sumar una media o un % entre filas daría un dato falso).
        const cat = e && !e.isOther ? e.members[0] : ch ? ch.c : null;
        if (cat && cat.rows.length === 1) {
            for (const c of m.tooltipCols) {
                const v = c.values[cat.rows[0]];
                items.push({ displayName: c.name, value: typeof v === "number" ? this.fmtFull(v, c.format) : String(v ?? "") });
            }
        }
        return items;
    }

    private showTip(key: string, clientX: number, clientY: number): void {
        const ts: any = this.host.tooltipService;
        if (!ts || (ts.enabled && !ts.enabled())) return;
        const r = this.root.getBoundingClientRect();
        ts.show({ dataItems: this.tipItems(key), identities: this.idsOf(key), coordinates: [clientX - r.left, clientY - r.top], isTouchEvent: false });
    }

    private hideTip(): void {
        try { this.host.tooltipService?.hide({ immediately: true, isTouchEvent: false }); } catch { /* nada */ }
    }

    // ── Selección ────────────────────────────────────────────────────────────

    /** Identidad de una categoría: todas las columnas de Category de su primera fila (cubre todas sus filas). */
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

    /** "Otros" pasa TODAS sus identidades (regla filtros-todas-las-filas). */
    private idsOf(key: string): ISelectionId[] {
        const e = this.entryOf(key);
        if (e) return e.members.map(c => this.catId(c));
        const ch = this.catOf(key);
        return ch ? [this.catId(ch.c)] : [];
    }

    /** select(lista) no alterna: la selección se calcula aquí y se pasa entera (o clear si queda vacía). */
    private toggle(key: string, multi: boolean): void {
        if (multi) { if (this.selKeys.has(key)) this.selKeys.delete(key); else this.selKeys.add(key); }
        else if (this.selKeys.size === 1 && this.selKeys.has(key)) this.selKeys.clear();
        else { this.selKeys.clear(); this.selKeys.add(key); }
        const ids: ISelectionId[] = [];
        for (const k of this.selKeys) ids.push(...this.idsOf(k));
        if (ids.length) this.selectionManager.select(ids, false);
        else this.selectionManager.clear();
        this.paintState();
    }

    /** Marcadores / selección externa: se casa por equals (getKey no coincide entre clic y marcador). Solo deriva. */
    private restoreSelection(ids: ISelectionId[]): void {
        if (!this.model || !this.entries.length) { this.pendingRestore = ids; return; }
        this.pendingRestore = null;
        this.selKeys.clear();
        if (!ids.length) return;
        const eq = (a: ISelectionId, b: ISelectionId) => { try { return a.equals(b) || b.equals(a); } catch { return false; } };
        const hit = (c: Cat) => { const id = this.catId(c); return ids.some(x => eq(x, id)); };
        for (const e of this.entries) {
            if (e.isOther) {
                const sel = e.members.filter(hit);
                if (sel.length === e.members.length) this.selKeys.add(e.key);
                else for (const c of sel) this.selKeys.add(c.key);
            } else if (hit(e.members[0])) this.selKeys.add(e.key);
        }
    }

    private pruneSelection(): void {
        if (!this.selKeys.size) return;
        const valid = new Set<string>();
        for (const e of this.entries) { valid.add(e.key); for (const c of e.members) valid.add(c.key); }
        for (const k of Array.from(this.selKeys)) if (!valid.has(k)) this.selKeys.delete(k);
    }

    private isSelected(e: Entry): boolean {
        if (this.selKeys.has(e.key)) return true;
        return e.isOther && e.members.some(c => this.selKeys.has(c.key));
    }

    /** Opacidades, foco y centro: sin redibujar ni emitir rendering events. */
    private paintState(): void {
        if (!this.geo || !this.entries.length) return;
        const any = this.selKeys.size > 0;
        const hover = this.hoverKey;
        const focus = this.hasFocus ? this.focusItems()[this.focusIdx] : undefined;
        const hoverEntry = hover ? (this.entryOf(hover) ?? this.catOf(hover)?.e ?? null) : null;
        this.svg.selectAll<SVGGElement, unknown>(".dn-sg").each((_d, i, nodes) => {
            const el = nodes[i];
            const e = this.entryOf(el.getAttribute("data-key"));
            if (!e) return;
            let op = any && !this.isSelected(e) ? 0.35 : 1;
            if (hoverEntry && hoverEntry !== e) op = Math.min(op, 0.6);
            el.setAttribute("opacity", String(op));
        });
        this.svg.selectAll<SVGTextElement, unknown>(".dn-label").each((_d, i, nodes) => {
            const e = this.entryOf(nodes[i].getAttribute("data-key"));
            nodes[i].setAttribute("opacity", any && e && !this.isSelected(e) ? "0.45" : "1");
        });
        if (this.tableEl) {
            this.tableEl.querySelectorAll<HTMLElement>("[data-row]").forEach(c => {
                const key = c.getAttribute("data-row");
                const e = this.entryOf(key);
                const ch = e ? null : this.catOf(key);
                const sel = e ? this.isSelected(e) : ch ? (this.selKeys.has(key) || this.selKeys.has(OTHER_KEY)) : false;
                c.style.opacity = any && !sel ? "0.45" : "1";
                const isFocus = !!focus && ((focus.kind === "entry" && focus.e.key === key) || (focus.kind === "child" && focus.c.key === key));
                c.classList.toggle("dn-focusrow", isFocus);
                c.style.outlineColor = this.focusColor;
                c.style.backgroundColor = hover === key ? (this.hc ? "transparent" : "rgba(127,127,127,0.12)") : "";
            });
            this.tableEl.style.setProperty("--dn-focus-w", Number(this.settings.accessibility.focusWidth) + "px");
        }
        // Anillo de foco sobre el sector (o sobre "Otros" si el foco está en uno de sus miembros).
        const fg = this.svg.select<SVGGElement>(".dn-focus");
        fg.selectAll("*").remove();
        if (focus && this.geo) {
            const a = this.arcs.find(x => x.e === focus.e);
            if (a) {
                const gap = Number(this.settings.slices.gap) || 0;
                const d = d3.arc<any>().innerRadius(this.geo.ri).outerRadius(this.geo.R).padRadius(this.geo.R).padAngle(this.arcs.length > 1 ? gap / Math.max(this.geo.R, 1) : 0)({ startAngle: a.a0, endAngle: a.a1 });
                fg.append("path").attr("d", d).attr("fill", "none").attr("stroke", this.focusColor)
                    .attr("stroke-width", Number(this.settings.accessibility.focusWidth) + 1).style("pointer-events", "none");
            }
        }
        // Centro: el elemento enfocado, el del puntero o una única selección; si no, el total.
        let show: { name: string; value: number; pct: number; fmt?: string } | null = null;
        const pick = (key: string | null) => {
            if (!key) return null;
            const e = this.entryOf(key);
            if (e) return { name: e.name, value: e.value, pct: e.pct, fmt: e.members[0].fmt };
            const ch = this.catOf(key);
            return ch ? { name: ch.c.name, value: ch.c.value, pct: ch.e.memberPct[ch.i], fmt: ch.c.fmt } : null;
        };
        if (focus) show = pick(focus.kind === "entry" ? focus.e.key : focus.c.key);
        else if (hover) show = pick(hover);
        else if (this.selKeys.size === 1) show = pick(Array.from(this.selKeys)[0]);
        this.drawCenter(show);
    }

    // ── Teclado: una parada de Tab; flechas por sectores y filas; Enter selecciona ──

    private focusItems(): FocusItem[] {
        const out: FocusItem[] = [];
        for (const e of this.entries) {
            out.push({ kind: "entry", e });
            if (e.isOther && this.otherExpanded && this.tableEl && this.tableEl.getAttribute("data-expanded") === "true") {
                e.members.forEach((c, i) => out.push({ kind: "child", e, c, i }));
            }
        }
        return out;
    }

    private announce(): void {
        const items = this.focusItems();
        const it = items[this.focusIdx];
        if (!it) return;
        const pos = this.tf("UI_Pos", "{0} of {1}", String(this.focusIdx + 1), String(items.length));
        if (it.kind === "entry") {
            const e = it.e;
            let txt = e.name + ", " + this.fmtFull(e.value, e.members[0].fmt) + ", " + this.fmtPct(e.pct) + ", " + pos;
            if (e.isOther) txt += ". " + (this.otherExpanded ? this.t("UI_Collapse", "Left arrow collapses the list") : this.t("UI_Expand", "Right arrow expands the list"));
            if (this.isSelected(e)) txt += ". " + this.t("UI_Selected", "Selected");
            this.live.textContent = txt;
        } else {
            this.live.textContent = it.c.name + ", " + this.fmtFull(it.c.value, it.c.fmt) + ", " + this.fmtPct(it.e.memberPct[it.i]) + ", " + pos;
        }
    }

    private onKey(e: KeyboardEvent): void {
        if (this.guideEl && this.guideEl.contains(e.target as Node)) return;
        const items = this.focusItems();
        if (!items.length) return;
        let handled = true;
        const cur = items[this.focusIdx] ?? items[0];
        switch (e.key) {
            case "ArrowRight":
                if (cur.kind === "entry" && cur.e.isOther && !this.otherExpanded) { this.setExpanded(true); break; }
                this.focusIdx = Math.min(items.length - 1, this.focusIdx + 1); break;
            case "ArrowDown": this.focusIdx = Math.min(items.length - 1, this.focusIdx + 1); break;
            case "ArrowLeft":
                if ((cur.kind === "child" || (cur.e.isOther && this.otherExpanded))) {
                    this.focusIdx = this.entries.indexOf(cur.e);
                    this.setExpanded(false);
                    break;
                }
                this.focusIdx = Math.max(0, this.focusIdx - 1); break;
            case "ArrowUp": this.focusIdx = Math.max(0, this.focusIdx - 1); break;
            case "Home": this.focusIdx = 0; break;
            case "End": this.focusIdx = this.focusItems().length - 1; break;
            case "Enter": case " ":
                if (this.canInteract) this.toggle(cur.kind === "entry" ? cur.e.key : cur.c.key, e.ctrlKey || e.metaKey);
                break;
            case "Escape":
                if (this.canInteract) { this.selKeys.clear(); this.selectionManager.clear(); }
                break;
            case "ContextMenu": case "F10": {
                if (e.key === "F10" && !e.shiftKey) { handled = false; break; }
                if (!this.canInteract) break;
                const r = this.root.getBoundingClientRect();
                const g = this.geo;
                const a = this.arcs.find(x => x.e === cur.e);
                let x = r.left + (g ? g.cx : 0), y = r.top + (g ? g.cy : 0);
                if (a && g) { const am = (a.a0 + a.a1) / 2; x += Math.sin(am) * g.R * 0.8; y -= Math.cos(am) * g.R * 0.8; }
                this.selectionManager.showContextMenu(this.idsOf(cur.kind === "entry" ? cur.e.key : cur.c.key)[0] ?? ({} as ISelectionId), { x, y });
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
            ? this.t("Landing_Tagline", "Shares that read at any size: a legend table always visible, labels that never truncate and percentages that add up to 100.")
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

    private aplicarPlantilla(nombre: string): void {
        const t = TEMPLATES[nombre] ?? {};
        const remove: any[] = Object.keys(t).map(obj => ({
            objectName: obj, selector: null,
            properties: Object.keys(t[obj]).reduce((acc: any, p) => { acc[p] = null; return acc; }, {}),
        }));
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
                const slices = spec.props.filter(p => p.name !== g.toggle && !(g.obj === "slices" && p.name === "innerRadius" && pie))
                    .map(p => this.slice(g.obj, p));
                spec.props.forEach(p => revert.push({ objectName: g.obj, propertyName: p.name }));
                const grp: any = { uid: c.uid + "-" + g.obj + "-group", displayName: g.key ? this.t(g.key, g.label) : undefined, slices };
                if (g.toggle) {
                    const tp = spec.props.find(p => p.name === g.toggle);
                    const ts: any = this.slice(g.obj, tp);
                    ts.suppressDisplayName = true;
                    if (c.groups.length === 1) cardToggle = ts; else grp.topLevelToggle = ts;
                }
                groups.push(grp);
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
        marcar(".dn-table", "legend", 1);
        marcar(".dn-ring", "scaleRing", 3);
    }

    private getSubSelectionStyles(subs: powerbi.visuals.CustomVisualSubSelection[]): powerbi.visuals.SubSelectionStyles | undefined {
        const name = subs[0]?.customVisualObjects[0]?.objectName;
        const ref = (o: string, p: string) => ({ reference: { objectName: o, propertyName: p }, label: this.propLabel(o, p) });
        switch (name) {
            case "slices": return { type: 3, fill: ref("slices", "otherColor") } as any;
            case "labels": return { type: 1, fontSize: ref("labels", "fontSize"), fontColor: ref("labels", "color") } as any;
            case "center": return { type: 1, fontSize: ref("center", "fontSize"), fontColor: ref("center", "color") } as any;
            case "legend": return { type: 1, fontSize: ref("legend", "fontSize"), fontColor: ref("legend", "color") } as any;
            case "scaleRing": return { type: 3, stroke: ref("scaleRing", "color") } as any;
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
            case "legend": return [pick("legend", "position"), toggle("legend", "header"), pick("legend", "totalRow"), div, reset("legend"), nav("legend")] as any;
            case "scaleRing": return [pick("scaleRing", "mode"), div, reset("scaleRing"), nav("scaleRing")] as any;
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
    const sat = Math.max(gray ? 0.55 : s0, 0.45);
    const hues = gray ? [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(x => [x, 1]) : [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180].map(x => [x, Math.abs(x) / 30]);
    for (const [dh, hc] of hues) {
        for (const dl of [0, 0.15, -0.15, 0.28, -0.28]) {
            if (!gray && dh === 0 && dl === 0) continue;
            const l = Math.max(0.25, Math.min(0.8, (gray ? Math.max(0.35, Math.min(0.7, l0)) : l0) + dl));
            const c = fromHsl((gray ? 0 : h0) + dh, sat, l);
            if (chroma(c) < 15) continue;
            out.push({ c, cost: hc + Math.abs(dl) / 0.15 });
        }
    }
    return out.sort((a, b) => a.cost - b.cost).map(x => x.c);
}

function contrast(a: string, b: string): number {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
