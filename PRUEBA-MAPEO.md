# Donut & Pie Chart — prueba del mapeo de datos en Desktop (día 1)

Esto **no es el visual**: es un diagnóstico que escribe en pantalla lo que Power BI le entrega.
Sirve para decidir antes de dibujar nada si el mapeo `categories [category, facet, segment]` + `values`
(sin agrupar por leyenda) aguanta, y si `fetchMoreData` trae el resto cuando Power BI recorta.

## Preparar

1. **Copia** la carpeta `C:\tcviz\datos\demo_rtm\DemoRTM\` entera (p. ej. a `DemoRTM_DonutDiag\`) y abre el
   `.pbip` de la copia. **Nunca el original**: lleva incrustados los visuales de la organización.
2. Importa `C:\tcviz\dev\DonutChart\dist\donutChartTCViz5449856DE5A343AFB84B575BC5FDB5E8_test.1.0.0.1.pbiviz`
   (o el de número más alto en `dist\`).
3. Página nueva, visual "Donut & Pie Chart by TCViz (test)" a tamaño grande. En la primera línea sale la marca
   `[test AAAA-MM-DD HH:MM v1.0.0.N]`: si no coincide con el paquete importado, Desktop sirve uno anterior
   (quita el visual del panel, cierra Desktop y reimporta).
4. Para cada caso: **captura** del diagnóstico (el texto se desplaza si no cabe).

## Casos

| | Campos | Qué mirar |
|---|---|---|
| a | Category = `dim_sku[marca]` · Values = `Ventas netas` | CATEGORÍAS 1, FILAS = nº de marcas (10); SECTORES con su % (suman ~100); `segment` no llega |
| b | + Small multiples = `dim_zona[zona]` | CATEGORÍAS 2 (category + facet); FILAS = marcas × zonas; `paneles=` nº de zonas; columna `panel=` en las filas |
| c | + Segment = `dim_pdv[canal]` | CATEGORÍAS 3; FILAS = marcas × zonas × canales; columna `seg=`; ¿Desktop acepta las tres a la vez? |
| d | Quita b y c. Category = `dim_familia[familia]` · Values = `Ventas netas` · Compare with = `Ventas netas AA` · Target = `Plan ventas netas` · Center value = `Ventas netas` | Cada medida con su `rol=` (values, compare, target, centerValue) y su `format`; `nulos` en Compare/Target. Pon un filtro de año 2026 en la página (sin él, AA sale todo a cero o +100 %) |
| e | Caso a + en la página un gráfico nativo de barras por zona; haz clic en una barra | `HIGHLIGHTS: SÍ llegan` y `highlights=N/M` en la medida (resaltado parcial: lo que necesita "Otros") |
| f | Category = `dim_pdv[id_pdv]` (1.800) · Small multiples = `dim_sku[sku]` (57) · Values = `Ventas netas` | Más de 30.000 combinaciones: `metadata.segment` en **rojo** y `fetchMoreData: rondas=` subiendo con `pedido`. Apunta FILAS al final, rondas, y si alguna sale `RECHAZADO` |
| g | En la copia, jerarquía `familia → marca` en `dim_sku` (clic derecho en `familia` → Crear jerarquía). Ponla en Category y usa "Explorar en profundidad" | ¿Acepta la jerarquía? `jerarquía=SÍ nivel=…`; al bajar de nivel, ¿llega la categoría nueva con rol category? |
| h | Opcional: Annotation = cualquier medida de texto (p. ej. una medida nueva `Nota = SELECTEDVALUE(dim_sku[marca]) & " ok"`) | `rol=annotation` con `tipo=text` |

Para cada caso apunta: CATEGORÍAS, FILAS, SECTORES, roles por medida, si sale `segment` (rojo), las rondas de
fetchMoreData y si hubo algún error o el visual se quedó en blanco. Con eso basta.

## Si algo no encaja

- Desktop rechaza un campo en un pozo: anota cuál y el mensaje.
- En f el número de filas no sube o sale `RECHAZADO`: es el dato clave; "Otros" no podría llevar el resto real.
