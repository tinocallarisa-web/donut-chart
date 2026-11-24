# Donut & Pie Chart — prueba del mapeo de datos en Desktop (día 1)

Esto **no es el visual**: es un diagnóstico que escribe en pantalla lo que Power BI le entrega.
Sirve para decidir antes de dibujar nada si el mapeo `categories [category, facet, segment]` + `values`
(sin agrupar por leyenda) aguanta, y si `fetchMoreData` trae el resto cuando Power BI recorta.

## Preparar

1. En el `.pbix` de esta carpeta (o uno en blanco): Obtener datos → Excel → `C:\tcviz\dev\DonutChart\DonutChart_Dataset.xlsx`,
   hojas **Ventas** y **Detalle** (sin relacionarlas).
   - **Ventas** (580 filas, Begudes Nord, enero-septiembre): Marca, Familia, Zona, Canal, Subcanal, Litros (2026),
     Ventas netas, Litros AA (2025), Ventas netas AA, Plan litros (plan 2026 repartido por marca), Nota (texto en 2 filas).
     Café Nord es nueva en 2026 (Litros AA = 0): sirve para el caso "new".
   - **Detalle** (54.662 filas): PDV × SKU con Litros 2026, para pasar del tope de 30.000.
2. Importa `C:\tcviz\dev\DonutChart\dist\donutChartTCViz5449856DE5A343AFB84B575BC5FDB5E8_test.1.0.0.1.pbiviz`
   (o el de número más alto en `dist\`).
3. Página nueva, visual "Donut & Pie Chart by TCViz (test)" a tamaño grande. En la primera línea sale la marca
   `[test AAAA-MM-DD HH:MM v1.0.0.N]`: si no coincide con el paquete importado, Desktop sirve uno anterior
   (quita el visual del panel, cierra Desktop y reimporta).
4. Para cada caso: **captura** del diagnóstico (el texto se desplaza si no cabe).

## Casos

| | Campos (tabla Ventas salvo f) | Qué mirar |
|---|---|---|
| a | Category = `Marca` · Values = `Litros` | CATEGORÍAS 1, FILAS 10; SECTORES con su % (Aigua Serena ~24 %); `segment` no llega |
| b | + Small multiples = `Zona` | CATEGORÍAS 2; FILAS = marcas × zonas (~90); `paneles=9`; columna `panel=` |
| c | + Segment = `Canal` | CATEGORÍAS 3; columna `seg=`; ¿acepta los tres a la vez? |
| d | Quita b y c. Category = `Marca` · Values = `Litros` · Compare with = `Litros AA` · Target = `Plan litros` · Center value = `Ventas netas` | Cada medida con su `rol=` y `format`; Café Nord con compare = 0 o ∅ |
| e | Caso a + un gráfico nativo de barras por `Zona`; clic en una barra | `HIGHLIGHTS: SÍ llegan` y `highlights=N/M` (resaltado parcial) |
| f | Tabla **Detalle**: Category = `PDV` · Small multiples = `SKU` · Values = `Litros` | 54.662 combinaciones > 30.000: `metadata.segment` en **rojo**, `fetchMoreData: rondas=` subiendo con `pedido`; FILAS al final (¿llega a 54.662?) |
| g | Jerarquía `Familia → Marca` (clic derecho en `Familia` → Crear jerarquía) en Category; "Explorar en profundidad" | `jerarquía=SÍ nivel=…`; al bajar, ¿llega la categoría nueva con rol category? |
| h | Annotation = `Nota` (como "Primero") | `rol=annotation`, `tipo=text`; texto en Aigua Serena y en la marca más pequeña |

Para cada caso apunta: CATEGORÍAS, FILAS, SECTORES, roles por medida, si sale `segment` (rojo), las rondas de
fetchMoreData y si hubo algún error o el visual se quedó en blanco. Con eso basta.

## Si algo no encaja

- Desktop rechaza un campo en un pozo: anota cuál y el mensaje.
- En f el número de filas no sube o sale `RECHAZADO`: es el dato clave; "Otros" no podría llevar el resto real.

## Resultados (Tino, 24-11)

- **a OK:** 1 categoría (rol category, texto), 10 filas, 1 medida rol=values, sin segment. Sectores = datos (Aigua Serena 24,0 %, Café Nord 1,9 %). Llegan ya ordenados de mayor a menor. `format=-` (columna sumada sin formato: el visual necesita formato por defecto propio).
- **b OK:** 2 categorías (category + facet), 90 filas = 10 marcas × 9 zonas, paneles=9; total igual que en a. Filas ordenadas por panel y, dentro, por valor.
- **c OK:** acepta los 3 a la vez; 180 filas = 10 × 9 × 2; total igual. Las filas llegan ordenadas por valor, mezclando segmentos: el visual agrega por clave (no depende del orden de llegada).
- **d parcial:** llegan values, compare y centerValue con su rol; **falta Target** (no se puso Plan litros). Café Nord: compare llega 0 (suma de ceros), no ∅ → el visual debe tratar compare = 0 con valor > 0 como "new". **Ojo:** centerValue llega **por fila (por marca)**, no como total: el centro solo puede sumar filas, correcto para medidas aditivas y falso para   (continuación) **Ojo:** centerValue llega **por fila (por marca)**, no como total: el centro solo puede sumar filas, correcto para medidas aditivas y falso para porcentajes o medias. Decidir: centro = total de Values, y Center value solo si es aditivo (avisarlo) o quitar el pozo.
