/*
 * Modelo de datos de Donut & Pie Chart by TCViz (bloque 1).
 *
 * Lo validado en Desktop el 24-11-2026 (PRUEBA-MAPEO.md):
 *  - mapeo categórico categories [category, facet, segment] + values sin agrupar;
 *  - las medidas se leen de categorical.values[i].values, NUNCA de values.grouped(): tras fetchMoreData (Append)
 *    grouped() se queda con el primer segmento y el total pierde filas en silencio;
 *  - las filas llegan ordenadas por valor y mezclando paneles y segmentos: se agrega por clave, sin fiarse del orden;
 *  - una columna sumada sin formato llega con format = undefined: el visual pone uno propio.
 *
 * Las categorías con total negativo, cero o en blanco no entran en el donut: se cuentan para la nota bajo la tabla.
 */
import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import DataViewValueColumn = powerbi.DataViewValueColumn;
import PrimitiveValue = powerbi.PrimitiveValue;

export interface TipCol { name: string; format?: string; values: PrimitiveValue[]; }

export interface Cat {
    key: string;
    name: string;
    value: number;
    /** Parte resaltada (filtro cruzado de otro visual); null si no llegan highlights. */
    hl: number | null;
    /** Filas del dataView que suma (todas: paneles y segmentos incluidos). */
    rows: number[];
    /** Formato de la primera fila (formato dinámico por fila) o el de la medida. */
    fmt?: string;
    /** Posición de llegada (orden de los datos). */
    order: number;
    /** Color guardado para esta categoría (selector de categoría) y regla fx evaluada en su fila. */
    fill?: string;
    rule?: string;
}

export interface Entry {
    key: string;
    name: string;
    value: number;
    hl: number | null;
    isOther: boolean;
    /** La propia categoría, o las que agrupa "Otros". */
    members: Cat[];
    /** % redondeado por resto mayor (en unidades de 10^-decimales). */
    pct: number;
    color: string;
    /** Porcentajes de los miembros de "Otros", repartiendo los suyos por resto mayor (suman lo de "Otros"). */
    memberPct: number[];
}

export interface Excluded { negative: number; negativeSum: number; blank: number; zero: number; }

export interface Model {
    catCols: DataViewCategoryColumn[];
    facetCol: DataViewCategoryColumn | null;
    segmentCol: DataViewCategoryColumn | null;
    valuesCol: DataViewValueColumn;
    measureName: string;
    categoryName: string;
    format?: string;
    cats: Cat[];
    total: number;
    hlTotal: number | null;
    hasHighlights: boolean;
    excluded: Excluded;
    rowCount: number;
    tooltipCols: TipCol[];
    hasRole: (role: string) => boolean;
}

function roleOf(src: powerbi.DataViewMetadataColumn | undefined, role: string): boolean {
    return !!(src && src.roles && src.roles[role]);
}

function keyOf(v: PrimitiveValue): string {
    if (v === null || v === undefined) return "∅";
    if (v instanceof Date) return "d" + v.getTime();
    return typeof v + ":" + String(v);
}

function colorOf(o: unknown, prop: string): string | undefined {
    const obj = o as Record<string, Record<string, { solid?: { color?: string } }>> | undefined;
    const c = obj && obj.dataColors && obj.dataColors[prop] && obj.dataColors[prop].solid && obj.dataColors[prop].solid.color;
    return c ? String(c) : undefined;
}

/** Texto de un valor de categoría con el formato de su columna (fecha, número o texto). */
export type LabelFn = (v: PrimitiveValue, col: DataViewCategoryColumn) => string;

export function buildModel(dv: DataView | null, blank: string, label: LabelFn): Model | null {
    const cat = dv && dv.categorical;
    if (!cat || !cat.categories || !cat.values) return null;
    const catCols = cat.categories.filter(c => roleOf(c.source, "category"));
    const valuesCol = (cat.values as DataViewValueColumn[]).find(c => roleOf(c.source, "values"));
    if (!catCols.length || !valuesCol) return null;
    const facetCol = cat.categories.find(c => roleOf(c.source, "facet")) || null;
    const segmentCol = cat.categories.find(c => roleOf(c.source, "segment")) || null;
    const N = catCols[0].values.length;
    const vals = valuesCol.values;
    const hls = valuesCol.highlights;
    const hasHighlights = !!(hls && hls.length);
    const byKey = new Map<string, Cat>();
    const cats: Cat[] = [];
    for (let r = 0; r < N; r++) {
        const key = catCols.map(c => keyOf(c.values[r])).join("␟");
        let c = byKey.get(key);
        if (!c) {
            const name = catCols.map(col => {
                const v = col.values[r];
                return v === null || v === undefined || v === "" ? blank : label(v, col);
            }).join(" ");
            const o = valuesCol.objects && valuesCol.objects[r];
            const dyn = o && o.general && (o.general as Record<string, unknown>).formatString;
            c = { key, name, value: NaN, hl: hasHighlights ? 0 : null, rows: [], order: cats.length,
                fmt: typeof dyn === "string" && dyn ? dyn : valuesCol.source.format };
            byKey.set(key, c);
            cats.push(c);
        }
        c.rows.push(r);
        const v = vals[r];
        if (typeof v === "number" && isFinite(v)) c.value = (isNaN(c.value) ? 0 : c.value) + v;
        if (hasHighlights) {
            const h = hls[r];
            if (typeof h === "number" && isFinite(h)) c.hl = (c.hl || 0) + h;
        }
        // Colores guardados con el selector de la categoría (primera columna) y regla fx por fila.
        const co = catCols[catCols.length - 1].objects && catCols[catCols.length - 1].objects[r];
        if (co) {
            const f = colorOf(co, "fill"), ru = colorOf(co, "rule");
            if (f && !c.fill) c.fill = f;
            if (ru && !c.rule) c.rule = ru;
        }
    }
    const excluded: Excluded = { negative: 0, negativeSum: 0, blank: 0, zero: 0 };
    const kept: Cat[] = [];
    for (const c of cats) {
        if (isNaN(c.value)) excluded.blank++;
        else if (c.value < 0) { excluded.negative++; excluded.negativeSum += c.value; }
        else if (c.value === 0) excluded.zero++;
        else kept.push(c);
    }
    const total = kept.reduce((s, c) => s + c.value, 0);
    const hlTotal = hasHighlights ? kept.reduce((s, c) => s + Math.max(0, c.hl || 0), 0) : null;
    const tooltipCols: TipCol[] = (cat.values as DataViewValueColumn[]).filter(c => roleOf(c.source, "tooltips"))
        .map(c => ({ name: c.source.displayName, format: c.source.format, values: c.values }));
    const cols = dv.metadata && dv.metadata.columns || [];
    return {
        catCols, facetCol, segmentCol, valuesCol,
        measureName: valuesCol.source.displayName,
        categoryName: catCols.map(c => c.source.displayName).join(" · "),
        format: valuesCol.source.format,
        cats: kept, total, hlTotal, hasHighlights, excluded, rowCount: N, tooltipCols,
        hasRole: (role: string) => cols.some(c => roleOf(c, role)),
    };
}

/**
 * Resto mayor: reparte `units` unidades enteras en proporción a `values`, de modo que sumen exactamente `units`.
 * Devuelve también si algún valor quedó distinto de su redondeo normal (para la nota al pie).
 */
export function largestRemainder(values: number[], units: number): { out: number[]; adjusted: boolean } {
    const sum = values.reduce((s, v) => s + v, 0);
    if (!(sum > 0) || !values.length) return { out: values.map(() => 0), adjusted: false };
    const raw = values.map(v => (v / sum) * units);
    const out = raw.map(Math.floor);
    let left = units - out.reduce((s, v) => s + v, 0);
    const order = raw.map((v, i) => ({ i, rem: v - Math.floor(v) })).sort((a, b) => b.rem - a.rem || values[b.i] - values[a.i]);
    for (let j = 0; left > 0 && j < order.length; j++, left--) out[order[j].i]++;
    const adjusted = raw.some((v, i) => Math.round(v) !== out[i]);
    return { out, adjusted };
}

export interface GroupOptions { maxSlices: number; groupBelow: number; sort: string; decimals: number; otherName: string; }

/**
 * Orden global y "Otros": se ordena por valor (o por llegada) y van a "Otros" las categorías que pasan de Show at most
 * y las que quedan por debajo de Group below %. "Otros" solo existe si agrupa al menos dos categorías (una sola se ve
 * mejor con su nombre) y siempre va el último. Los % salen por resto mayor y suman 100.
 */
export function groupEntries(m: Model, o: GroupOptions): { entries: Entry[]; adjusted: boolean } {
    const list = m.cats.slice();
    if (o.sort === "data") list.sort((a, b) => a.order - b.order);
    else list.sort((a, b) => b.value - a.value || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const total = m.total;
    const max = Math.max(2, Math.round(o.maxSlices));
    const share = (c: Cat) => (total > 0 ? (c.value / total) * 100 : 0);
    // Si todas caben en Show at most, solo cuenta el umbral; si no, se guardan max − 1 y el último hueco es "Otros".
    const limit = list.length <= max ? list.length : max - 1;
    const keep = new Set<Cat>();
    list.slice().sort((a, b) => b.value - a.value).forEach((c, i) => { if (i < limit && share(c) >= o.groupBelow) keep.add(c); });
    let shown = list.filter(c => keep.has(c));
    let rest = list.filter(c => !keep.has(c));
    // Con una sola categoría sobrante no hay "Otros": se ve mejor con su nombre.
    if (rest.length < 2) { shown = list; rest = []; }
    const entries: Entry[] = shown.map(c => ({ key: c.key, name: c.name, value: c.value, hl: c.hl, isOther: false, members: [c], pct: 0, color: "", memberPct: [] }));
    if (rest.length) {
        rest.sort((a, b) => b.value - a.value);
        const v = rest.reduce((s, c) => s + c.value, 0);
        const hl = m.hasHighlights ? rest.reduce((s, c) => s + Math.max(0, c.hl || 0), 0) : null;
        entries.push({ key: OTHER_KEY, name: o.otherName + " (" + rest.length + ")", value: v, hl, isOther: true, members: rest, pct: 0, color: "", memberPct: [] });
    }
    const units = 100 * Math.pow(10, o.decimals);
    const lr = largestRemainder(entries.map(e => e.value), units);
    entries.forEach((e, i) => { e.pct = lr.out[i]; });
    let adjusted = lr.adjusted;
    for (const e of entries) if (e.isOther) {
        const sub = largestRemainder(e.members.map(c => c.value), e.pct);
        e.memberPct = sub.out;
        adjusted = adjusted || sub.adjusted;
    }
    return { entries, adjusted };
}

export const OTHER_KEY = "␟other";
