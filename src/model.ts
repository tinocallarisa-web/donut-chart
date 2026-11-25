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
 *
 * Bloque 2 (Pro): Compare with, Target y Annotation se leen igual (categorical.values por rol, fila a fila) y se suman
 * por categoría; cada categoría guarda además sus partes por panel (Small multiples) y por segmento (Segment), para que
 * los paneles y el anillo exterior salgan de las mismas filas que el donut total. Una categoría sin valor actual pero
 * con valor de comparación "sale" (gone): va a la tabla, no al donut, y no cuenta como excluida.
 */
import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import DataViewValueColumn = powerbi.DataViewValueColumn;
import PrimitiveValue = powerbi.PrimitiveValue;

export interface TipCol { name: string; format?: string; values: PrimitiveValue[]; }

/** Suma de filas (valor, comparación, objetivo, resaltado) con cuántas traían número. */
export interface Agg { value: number; cmp: number; tgt: number; hl: number; rows: number[]; nv: number; nc: number; nt: number; }

/** Un valor de Small multiples o de Segment, en orden de llegada. */
export interface Dim { key: string; name: string; }

export function emptyAgg(): Agg { return { value: 0, cmp: 0, tgt: 0, hl: 0, rows: [], nv: 0, nc: 0, nt: 0 }; }

export function addAgg(a: Agg, b: Agg): void {
    a.value += b.value; a.cmp += b.cmp; a.tgt += b.tgt; a.hl += b.hl; a.nv += b.nv; a.nc += b.nc; a.nt += b.nt;
    for (const r of b.rows) a.rows.push(r);
}

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
    /** Compare with / Target sumados (null si ninguna fila trae número). */
    cmp: number | null;
    tgt: number | null;
    /** Textos de Annotation (distintos, en orden). */
    notes: string[];
    /** Partes por panel y por segmento ("panel␟segmento"; "" si no hay campo), por panel y por segmento. */
    parts: Map<string, Agg>;
    byFacet: Map<string, Agg>;
    bySeg: Map<string, Agg>;
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
    /** "Otros" lleva una trama ligera cuando su gris queda cerca de un color de la paleta. */
    otherPattern?: boolean;
    /** Porcentajes de los miembros de "Otros", repartiendo los suyos por resto mayor (suman lo de "Otros"). */
    memberPct: number[];
    /** Compare with sumado (null si ningún miembro trae comparación) y objetivo (null si algún miembro no lo tiene). */
    cmp: number | null;
    tgt: number | null;
    /** Comparación ya calculada (Pro): ver computeChange. */
    ch?: Change;
    /** Cambio de cada miembro de "Otros" (suman el de "Otros"). */
    memberCh?: Change[];
}

/**
 * Cambio frente a Compare with. Las cuotas se reparten por resto mayor con 1 decimal (1000 unidades = 100 %), las
 * actuales y las anteriores por separado: así los Δ pp de todas las filas (nuevas y salientes incluidas) suman 0.
 */
export interface Change {
    cur10: number;
    prev10: number;
    /** Δ pp en décimas de punto. */
    dpp10: number;
    /** Variación relativa del valor (0,076 = +7,6 %); null si no hay comparación. */
    dval: number | null;
    isNew: boolean;
    isGone: boolean;
    /** Cuota y valor se mueven en sentidos opuestos (paradoja de mezcla). */
    mix: boolean;
}

export interface Excluded { negative: number; negativeSum: number; blank: number; zero: number; }

export interface Model {
    catCols: DataViewCategoryColumn[];
    facetCol: DataViewCategoryColumn | null;
    segmentCol: DataViewCategoryColumn | null;
    valuesCol: DataViewValueColumn;
    compareCol: DataViewValueColumn | null;
    targetCol: DataViewValueColumn | null;
    annotationCol: DataViewValueColumn | null;
    /** Annotation con valores que no son texto (Count en vez de First): aviso al autor. */
    annotationNotText: number;
    facets: Dim[];
    segments: Dim[];
    /** Categorías sin valor actual pero con comparación: "gone". */
    gone: Cat[];
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
    const vcols = cat.values as DataViewValueColumn[];
    const compareCol = vcols.find(c => roleOf(c.source, "compare")) || null;
    const targetCol = vcols.find(c => roleOf(c.source, "target")) || null;
    const annotationCol = vcols.find(c => roleOf(c.source, "annotation")) || null;
    const N = catCols[0].values.length;
    const vals = valuesCol.values;
    const cvals = compareCol ? compareCol.values : null;
    const tvals = targetCol ? targetCol.values : null;
    const avals = annotationCol ? annotationCol.values : null;
    const hls = valuesCol.highlights;
    const hasHighlights = !!(hls && hls.length);
    const byKey = new Map<string, Cat>();
    const cats: Cat[] = [];
    const facets: Dim[] = [], segments: Dim[] = [];
    const facetSeen = new Set<string>(), segSeen = new Set<string>();
    const dimName = (col: DataViewCategoryColumn, r: number) => {
        const v = col.values[r];
        return v === null || v === undefined || v === "" ? blank : label(v, col);
    };
    let annotationNotText = 0;
    const num = (v: PrimitiveValue) => (typeof v === "number" && isFinite(v) ? v : null);
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
                fmt: typeof dyn === "string" && dyn ? dyn : valuesCol.source.format,
                cmp: null, tgt: null, notes: [], parts: new Map(), byFacet: new Map(), bySeg: new Map() };
            byKey.set(key, c);
            cats.push(c);
        }
        c.rows.push(r);
        const v = vals[r];
        if (typeof v === "number" && isFinite(v)) c.value = (isNaN(c.value) ? 0 : c.value) + v;
        let hv = 0;
        if (hasHighlights) {
            const h = hls[r];
            if (typeof h === "number" && isFinite(h)) { c.hl = (c.hl || 0) + h; hv = h; }
        }
        const nv = num(v), nc = cvals ? num(cvals[r]) : null, nt = tvals ? num(tvals[r]) : null;
        if (nc !== null) c.cmp = (c.cmp || 0) + nc;
        if (nt !== null) c.tgt = (c.tgt || 0) + nt;
        if (avals) {
            const a = avals[r];
            if (typeof a === "string") { const t = a.trim(); if (t && c.notes.indexOf(t) < 0) c.notes.push(t); }
            else if (a !== null && a !== undefined) annotationNotText++;
        }
        // Partes por panel y segmento (solo si hay campo: sin ellos, una única parte).
        if (facetCol || segmentCol) {
            const fk = facetCol ? keyOf(facetCol.values[r]) : "";
            const sk = segmentCol ? keyOf(segmentCol.values[r]) : "";
            if (facetCol && !facetSeen.has(fk)) { facetSeen.add(fk); facets.push({ key: fk, name: dimName(facetCol, r) }); }
            if (segmentCol && !segSeen.has(sk)) { segSeen.add(sk); segments.push({ key: sk, name: dimName(segmentCol, r) }); }
            const one: Agg = { value: nv ?? 0, cmp: nc ?? 0, tgt: nt ?? 0, hl: hv, rows: [r], nv: nv === null ? 0 : 1, nc: nc === null ? 0 : 1, nt: nt === null ? 0 : 1 };
            for (const [map, k] of [[c.parts, fk + "␟" + sk], [c.byFacet, fk], [c.bySeg, sk]] as [Map<string, Agg>, string][]) {
                let a = map.get(k);
                if (!a) { a = emptyAgg(); map.set(k, a); }
                addAgg(a, one);
            }
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
    const gone: Cat[] = [];
    for (const c of cats) {
        // Sin valor actual y con comparación: sale (gone). Se ve en la tabla con su cuota anterior, no en el donut.
        if (compareCol && (isNaN(c.value) || c.value === 0) && c.cmp !== null && c.cmp > 0) gone.push(c);
        else if (isNaN(c.value)) excluded.blank++;
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
        catCols, facetCol, segmentCol, valuesCol, compareCol, targetCol, annotationCol, annotationNotText, facets, segments, gone,
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
    // Nunca un donut sin nombres (Tino, 25-11: 1.746 PDV acababan todos en «Otros (1746)» al 100 %): los K mayores se ven
    // siempre, aunque queden bajo «Group below», con K = min(5, huecos antes de Otros). Cinco es lo que se distingue de un
    // vistazo en un donut y lo que cabe con nombre a tamaño de tarjeta; el resto va a Otros, que sigue contando y se despliega.
    const K = Math.min(MIN_NAMED, limit);
    const keep = new Set<Cat>();
    list.slice().sort((a, b) => b.value - a.value).forEach((c, i) => { if (i < limit && (i < K || share(c) >= o.groupBelow)) keep.add(c); });
    let shown = list.filter(c => keep.has(c));
    let rest = list.filter(c => !keep.has(c));
    // Con una sola categoría sobrante no hay "Otros": se ve mejor con su nombre.
    if (rest.length < 2) { shown = list; rest = []; }
    const entries: Entry[] = shown.map(c => ({ key: c.key, name: c.name, value: c.value, hl: c.hl, isOther: false, members: [c], pct: 0, color: "", memberPct: [],
        cmp: c.cmp, tgt: c.tgt !== null && c.tgt > 0 ? c.tgt : null }));
    if (rest.length) {
        rest.sort((a, b) => b.value - a.value);
        const v = rest.reduce((s, c) => s + c.value, 0);
        const hl = m.hasHighlights ? rest.reduce((s, c) => s + Math.max(0, c.hl || 0), 0) : null;
        entries.push({ key: OTHER_KEY, name: o.otherName + " (" + rest.length + ")", value: v, hl, isOther: true, members: rest, pct: 0, color: "", memberPct: [],
            ...sumCmpTgt(rest) });
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
/** Sectores con nombre que siempre quedan visibles (los mayores), aunque estén bajo «Group below». */
export const MIN_NAMED = 5;

/** Compare with sumado (null si ningún miembro lo trae) y objetivo (null si algún miembro no lo tiene: nunca un % falso). */
export function sumCmpTgt(members: Cat[]): { cmp: number | null; tgt: number | null } {
    const anyCmp = members.some(c => c.cmp !== null);
    const allTgt = members.every(c => c.tgt !== null && c.tgt > 0);
    return {
        cmp: anyCmp ? members.reduce((s, c) => s + (c.cmp || 0), 0) : null,
        tgt: allTgt ? members.reduce((s, c) => s + (c.tgt || 0), 0) : null,
    };
}

/**
 * Cambio frente a Compare with de una lista de filas (las del donut + las que salen). Cuota anterior = c_i / Σc con el
 * mismo conjunto (Otros incluido). Una fila con valor y comparación 0 o vacía es "new"; con comparación y sin valor,
 * "gone": nunca un Δ % inventado. Las cuotas, por resto mayor a 1 decimal: los Δ pp suman exactamente 0.
 */
export function computeChange(values: number[], cmps: (number | null)[]): Change[] {
    const cur = largestRemainder(values.map(v => Math.max(0, v)), 1000).out;
    const cpos = cmps.map(c => (c !== null && c > 0 ? c : 0));
    const prevOk = cpos.some(c => c > 0);
    const prev = prevOk ? largestRemainder(cpos, 1000).out : cpos.map(() => 0);
    return values.map((v, i) => changeOf(v, cmps[i], cur[i], prev[i]));
}

export function changeOf(v: number, c: number | null, cur10: number, prev10: number): Change {
    const isNew = v > 0 && !(c !== null && c > 0);
    const isGone = !(v > 0) && c !== null && c > 0;
    const dval = !isNew && !isGone && c !== null && c > 0 ? v / c - 1 : null;
    const dpp10 = cur10 - prev10;
    // Paradoja de mezcla: solo con cambios visibles (±0,1 pp y ±0,1 %), no por ruido de redondeo.
    const dvr = dval === null ? 0 : Math.round(dval * 1000);
    const mix = !isNew && !isGone && dpp10 !== 0 && dvr !== 0 && (dpp10 > 0) !== (dvr > 0);
    return { cur10, prev10, dpp10, dval, isNew, isGone, mix };
}

/** Reparte el cambio de "Otros" entre sus miembros (resto mayor dentro de sus unidades: suman lo de "Otros"). */
export function splitChange(parent: Change, values: number[], cmps: (number | null)[]): Change[] {
    const cur = largestRemainder(values.map(v => Math.max(0, v)), parent.cur10).out;
    const cpos = cmps.map(c => (c !== null && c > 0 ? c : 0));
    const prev = cpos.some(c => c > 0) ? largestRemainder(cpos, parent.prev10).out : cpos.map(() => 0);
    return values.map((v, i) => changeOf(v, cmps[i], cur[i], prev[i]));
}
