/**
 * Tabla del panel de formato. Generado por tools/formato.py: no editar a mano.
 * Los nombres internos (objeto.propiedad) no se renombran nunca: los informes guardados dejarían de leerlos.
 */
export type PropType = "bool" | "num" | "fill" | "enum" | "text";
export interface PropSpec { name: string; type: PropType; def: string | number | boolean | null; key: string; label: string;
    items?: [string, string, string][]; min?: number; max?: number; }
export interface ObjSpec { name: string; key: string; label: string; props: PropSpec[]; }
export interface GroupSpec { obj: string; toggle: string | null; key?: string; label?: string; }
export interface CardSpec { uid: string; key: string; label: string; groups: GroupSpec[]; }
export const OBJECTS: Record<string, ObjSpec> = {
    "style": {
        "name": "style",
        "key": "Obj_style",
        "label": "Style template",
        "props": [
            {
                "name": "template",
                "type": "enum",
                "def": "report",
                "key": "Prop_style_template",
                "label": "Template",
                "items": [
                    [
                        "report",
                        "Enum_template_report",
                        "Report theme"
                    ],
                    [
                        "classic",
                        "Enum_template_classic",
                        "Classic"
                    ],
                    [
                        "boardroom",
                        "Enum_template_boardroom",
                        "Boardroom (Pro)"
                    ],
                    [
                        "ledger",
                        "Enum_template_ledger",
                        "Ledger (Pro)"
                    ],
                    [
                        "editorial",
                        "Enum_template_editorial",
                        "Editorial (Pro)"
                    ],
                    [
                        "signal",
                        "Enum_template_signal",
                        "Signal (Pro)"
                    ],
                    [
                        "aurora",
                        "Enum_template_aurora",
                        "Aurora (Pro)"
                    ],
                    [
                        "terrace",
                        "Enum_template_terrace",
                        "Terrace (Pro)"
                    ]
                ]
            },
            {
                "name": "guide",
                "type": "bool",
                "def": true,
                "key": "Prop_style_guide",
                "label": "Setup guide"
            }
        ]
    },
    "slices": {
        "name": "slices",
        "key": "Obj_slices",
        "label": "Slices",
        "props": [
            {
                "name": "shape",
                "type": "enum",
                "def": "donut",
                "key": "Prop_slices_shape",
                "label": "Shape",
                "items": [
                    [
                        "donut",
                        "Enum_shape_donut",
                        "Donut"
                    ],
                    [
                        "pie",
                        "Enum_shape_pie",
                        "Pie"
                    ]
                ]
            },
            {
                "name": "innerRadius",
                "type": "num",
                "def": 58,
                "key": "Prop_slices_innerRadius",
                "label": "Inner radius (%)",
                "min": 20,
                "max": 85
            },
            {
                "name": "startAngle",
                "type": "num",
                "def": 0,
                "key": "Prop_slices_startAngle",
                "label": "Start angle (°)",
                "min": 0,
                "max": 359
            },
            {
                "name": "gap",
                "type": "num",
                "def": 1,
                "key": "Prop_slices_gap",
                "label": "Space between slices",
                "min": 0,
                "max": 8
            },
            {
                "name": "sort",
                "type": "enum",
                "def": "valueDesc",
                "key": "Prop_slices_sort",
                "label": "Order",
                "items": [
                    [
                        "valueDesc",
                        "Enum_sort_valueDesc",
                        "By value"
                    ],
                    [
                        "data",
                        "Enum_sort_data",
                        "Data order"
                    ]
                ]
            },
            {
                "name": "maxSlices",
                "type": "num",
                "def": 6,
                "key": "Prop_slices_maxSlices",
                "label": "Show at most",
                "min": 2,
                "max": 20
            },
            {
                "name": "groupBelow",
                "type": "num",
                "def": 3,
                "key": "Prop_slices_groupBelow",
                "label": "Group below (%)",
                "min": 0,
                "max": 20
            },
            {
                "name": "otherColor",
                "type": "fill",
                "def": "#A19F9D",
                "key": "Prop_slices_otherColor",
                "label": "Other color"
            }
        ]
    },
    "dataColors": {
        "name": "dataColors",
        "key": "Obj_dataColors",
        "label": "Slice colors",
        "props": [
            {
                "name": "fill",
                "type": "fill",
                "def": "",
                "key": "Prop_dataColors_fill",
                "label": "Color"
            },
            {
                "name": "rule",
                "type": "fill",
                "def": "",
                "key": "Prop_dataColors_rule",
                "label": "All slices (fx)"
            }
        ]
    },
    "labels": {
        "name": "labels",
        "key": "Obj_labels",
        "label": "Data labels",
        "props": [
            {
                "name": "show",
                "type": "bool",
                "def": true,
                "key": "Prop_labels_show",
                "label": "Show data labels"
            },
            {
                "name": "content",
                "type": "enum",
                "def": "auto",
                "key": "Prop_labels_content",
                "label": "Content",
                "items": [
                    [
                        "auto",
                        "Enum_content_auto",
                        "Automatic"
                    ],
                    [
                        "percent",
                        "Enum_content_percent",
                        "Percent"
                    ],
                    [
                        "value",
                        "Enum_content_value",
                        "Value"
                    ],
                    [
                        "name",
                        "Enum_content_name",
                        "Name"
                    ],
                    [
                        "namePercent",
                        "Enum_content_namePercent",
                        "Name and percent"
                    ],
                    [
                        "valuePercent",
                        "Enum_content_valuePercent",
                        "Value and percent"
                    ],
                    [
                        "all",
                        "Enum_content_all",
                        "All"
                    ]
                ]
            },
            {
                "name": "position",
                "type": "enum",
                "def": "auto",
                "key": "Prop_labels_position",
                "label": "Position",
                "items": [
                    [
                        "auto",
                        "Enum_position_auto",
                        "Inside, then outside"
                    ],
                    [
                        "inside",
                        "Enum_position_inside",
                        "Inside only"
                    ],
                    [
                        "outside",
                        "Enum_position_outside",
                        "Outside"
                    ]
                ]
            },
            {
                "name": "fontSize",
                "type": "num",
                "def": 10,
                "key": "Prop_labels_fontSize",
                "label": "Text size",
                "min": 6,
                "max": 24
            },
            {
                "name": "color",
                "type": "fill",
                "def": "#252423",
                "key": "Prop_labels_color",
                "label": "Text color (outside)"
            },
            {
                "name": "displayUnits",
                "type": "enum",
                "def": "auto",
                "key": "Prop_labels_displayUnits",
                "label": "Display units",
                "items": [
                    [
                        "auto",
                        "Enum_displayUnits_auto",
                        "Auto"
                    ],
                    [
                        "none",
                        "Enum_displayUnits_none",
                        "None"
                    ],
                    [
                        "thousands",
                        "Enum_displayUnits_thousands",
                        "Thousands"
                    ],
                    [
                        "millions",
                        "Enum_displayUnits_millions",
                        "Millions"
                    ],
                    [
                        "billions",
                        "Enum_displayUnits_billions",
                        "Billions"
                    ],
                    [
                        "trillions",
                        "Enum_displayUnits_trillions",
                        "Trillions"
                    ]
                ]
            },
            {
                "name": "valueDecimals",
                "type": "num",
                "def": null,
                "key": "Prop_labels_valueDecimals",
                "label": "Value decimal places",
                "min": 0,
                "max": 9
            },
            {
                "name": "percentDecimals",
                "type": "num",
                "def": 0,
                "key": "Prop_labels_percentDecimals",
                "label": "Percentage decimal places",
                "min": 0,
                "max": 4
            }
        ]
    },
    "center": {
        "name": "center",
        "key": "Obj_center",
        "label": "Center",
        "props": [
            {
                "name": "show",
                "type": "bool",
                "def": true,
                "key": "Prop_center_show",
                "label": "Show total in the center"
            },
            {
                "name": "title",
                "type": "text",
                "def": "",
                "key": "Prop_center_title",
                "label": "Title (blank = measure name)"
            },
            {
                "name": "fontSize",
                "type": "num",
                "def": 20,
                "key": "Prop_center_fontSize",
                "label": "Value size",
                "min": 8,
                "max": 48
            },
            {
                "name": "color",
                "type": "fill",
                "def": "#252423",
                "key": "Prop_center_color",
                "label": "Text color"
            },
            {
                "name": "displayUnits",
                "type": "enum",
                "def": "auto",
                "key": "Prop_center_displayUnits",
                "label": "Display units",
                "items": [
                    [
                        "auto",
                        "Enum_displayUnits_auto",
                        "Auto"
                    ],
                    [
                        "none",
                        "Enum_displayUnits_none",
                        "None"
                    ],
                    [
                        "thousands",
                        "Enum_displayUnits_thousands",
                        "Thousands"
                    ],
                    [
                        "millions",
                        "Enum_displayUnits_millions",
                        "Millions"
                    ],
                    [
                        "billions",
                        "Enum_displayUnits_billions",
                        "Billions"
                    ],
                    [
                        "trillions",
                        "Enum_displayUnits_trillions",
                        "Trillions"
                    ]
                ]
            },
            {
                "name": "valueDecimals",
                "type": "num",
                "def": null,
                "key": "Prop_center_valueDecimals",
                "label": "Value decimal places",
                "min": 0,
                "max": 9
            }
        ]
    },
    "scaleRing": {
        "name": "scaleRing",
        "key": "Obj_scaleRing",
        "label": "Scale ring",
        "props": [
            {
                "name": "mode",
                "type": "enum",
                "def": "quarters",
                "key": "Prop_scaleRing_mode",
                "label": "Marks",
                "items": [
                    [
                        "off",
                        "Enum_mode_off",
                        "Off"
                    ],
                    [
                        "quarters",
                        "Enum_mode_quarters",
                        "Quarters (25 %)"
                    ],
                    [
                        "tens",
                        "Enum_mode_tens",
                        "Every 10 %"
                    ]
                ]
            },
            {
                "name": "color",
                "type": "fill",
                "def": "#605E5C",
                "key": "Prop_scaleRing_color",
                "label": "Color"
            }
        ]
    },
    "legend": {
        "name": "legend",
        "key": "Obj_legend",
        "label": "Legend",
        "props": [
            {
                "name": "position",
                "type": "enum",
                "def": "auto",
                "key": "Prop_legend_position",
                "label": "Position",
                "items": [
                    [
                        "auto",
                        "Enum_position_auto",
                        "Automatic"
                    ],
                    [
                        "right",
                        "Enum_position_right",
                        "Right"
                    ],
                    [
                        "left",
                        "Enum_position_left",
                        "Left"
                    ],
                    [
                        "top",
                        "Enum_position_top",
                        "Top"
                    ],
                    [
                        "bottom",
                        "Enum_position_bottom",
                        "Bottom"
                    ],
                    [
                        "off",
                        "Enum_position_off",
                        "Off"
                    ]
                ]
            },
            {
                "name": "content",
                "type": "enum",
                "def": "auto",
                "key": "Prop_legend_content",
                "label": "Content",
                "items": [
                    [
                        "auto",
                        "Enum_content_auto",
                        "Automatic"
                    ],
                    [
                        "legend",
                        "Enum_content_legend",
                        "Legend"
                    ],
                    [
                        "table",
                        "Enum_content_table",
                        "Table"
                    ]
                ]
            },
            {
                "name": "header",
                "type": "bool",
                "def": true,
                "key": "Prop_legend_header",
                "label": "Show header"
            },
            {
                "name": "headerColor",
                "type": "fill",
                "def": "",
                "key": "Prop_legend_headerColor",
                "label": "Header text color"
            },
            {
                "name": "headerBackground",
                "type": "fill",
                "def": "",
                "key": "Prop_legend_headerBackground",
                "label": "Header background"
            },
            {
                "name": "totalRow",
                "type": "enum",
                "def": "auto",
                "key": "Prop_legend_totalRow",
                "label": "Show total row",
                "items": [
                    [
                        "auto",
                        "Enum_totalRow_auto",
                        "Automatic (pie)"
                    ],
                    [
                        "on",
                        "Enum_totalRow_on",
                        "On"
                    ],
                    [
                        "off",
                        "Enum_totalRow_off",
                        "Off"
                    ]
                ]
            },
            {
                "name": "colValue",
                "type": "bool",
                "def": true,
                "key": "Prop_legend_colValue",
                "label": "Value column"
            },
            {
                "name": "colShare",
                "type": "bool",
                "def": true,
                "key": "Prop_legend_colShare",
                "label": "Share % column"
            },
            {
                "name": "colChange",
                "type": "bool",
                "def": true,
                "key": "Prop_legend_colChange",
                "label": "Change column"
            },
            {
                "name": "colTarget",
                "type": "bool",
                "def": true,
                "key": "Prop_legend_colTarget",
                "label": "% of target column"
            },
            {
                "name": "colNote",
                "type": "bool",
                "def": true,
                "key": "Prop_legend_colNote",
                "label": "Notes"
            },
            {
                "name": "segRows",
                "type": "bool",
                "def": false,
                "key": "Prop_legend_segRows",
                "label": "Segment rows"
            },
            {
                "name": "gridlines",
                "type": "enum",
                "def": "horizontal",
                "key": "Prop_legend_gridlines",
                "label": "Gridlines",
                "items": [
                    [
                        "none",
                        "Enum_gridlines_none",
                        "None"
                    ],
                    [
                        "horizontal",
                        "Enum_gridlines_horizontal",
                        "Horizontal"
                    ],
                    [
                        "all",
                        "Enum_gridlines_all",
                        "All"
                    ]
                ]
            },
            {
                "name": "gridColor",
                "type": "fill",
                "def": "",
                "key": "Prop_legend_gridColor",
                "label": "Gridline color"
            },
            {
                "name": "gridWidth",
                "type": "num",
                "def": 1,
                "key": "Prop_legend_gridWidth",
                "label": "Gridline width",
                "min": 1,
                "max": 4
            },
            {
                "name": "banding",
                "type": "bool",
                "def": false,
                "key": "Prop_legend_banding",
                "label": "Row banding"
            },
            {
                "name": "fontSize",
                "type": "num",
                "def": 10,
                "key": "Prop_legend_fontSize",
                "label": "Text size",
                "min": 6,
                "max": 24
            },
            {
                "name": "color",
                "type": "fill",
                "def": "#252423",
                "key": "Prop_legend_color",
                "label": "Text color"
            },
            {
                "name": "displayUnits",
                "type": "enum",
                "def": "auto",
                "key": "Prop_legend_displayUnits",
                "label": "Display units",
                "items": [
                    [
                        "auto",
                        "Enum_displayUnits_auto",
                        "Auto"
                    ],
                    [
                        "none",
                        "Enum_displayUnits_none",
                        "None"
                    ],
                    [
                        "thousands",
                        "Enum_displayUnits_thousands",
                        "Thousands"
                    ],
                    [
                        "millions",
                        "Enum_displayUnits_millions",
                        "Millions"
                    ],
                    [
                        "billions",
                        "Enum_displayUnits_billions",
                        "Billions"
                    ],
                    [
                        "trillions",
                        "Enum_displayUnits_trillions",
                        "Trillions"
                    ]
                ]
            },
            {
                "name": "valueDecimals",
                "type": "num",
                "def": null,
                "key": "Prop_legend_valueDecimals",
                "label": "Value decimal places",
                "min": 0,
                "max": 9
            },
            {
                "name": "percentDecimals",
                "type": "num",
                "def": 0,
                "key": "Prop_legend_percentDecimals",
                "label": "Percentage decimal places",
                "min": 0,
                "max": 4
            }
        ]
    },
    "compare": {
        "name": "compare",
        "key": "Obj_compare",
        "label": "Compare with (Pro)",
        "props": [
            {
                "name": "changeShown",
                "type": "enum",
                "def": "both",
                "key": "Prop_compare_changeShown",
                "label": "Change shown",
                "items": [
                    [
                        "pp",
                        "Enum_changeShown_pp",
                        "Share points"
                    ],
                    [
                        "value",
                        "Enum_changeShown_value",
                        "Value"
                    ],
                    [
                        "both",
                        "Enum_changeShown_both",
                        "Both"
                    ]
                ]
            },
            {
                "name": "sortByChange",
                "type": "bool",
                "def": false,
                "key": "Prop_compare_sortByChange",
                "label": "Sort by change"
            }
        ]
    },
    "target": {
        "name": "target",
        "key": "Obj_target",
        "label": "Target (Pro)",
        "props": [
            {
                "name": "metAt",
                "type": "num",
                "def": 100,
                "key": "Prop_target_metAt",
                "label": "Met at (%)",
                "min": 1,
                "max": 1000
            },
            {
                "name": "closeAt",
                "type": "num",
                "def": 90,
                "key": "Prop_target_closeAt",
                "label": "Close at (%)",
                "min": 1,
                "max": 1000
            },
            {
                "name": "statusOnSlices",
                "type": "enum",
                "def": "misses",
                "key": "Prop_target_statusOnSlices",
                "label": "Status on slices",
                "items": [
                    [
                        "misses",
                        "Enum_statusOnSlices_misses",
                        "Misses only"
                    ],
                    [
                        "all",
                        "Enum_statusOnSlices_all",
                        "All"
                    ],
                    [
                        "off",
                        "Enum_statusOnSlices_off",
                        "Off"
                    ]
                ]
            }
        ]
    },
    "annotations": {
        "name": "annotations",
        "key": "Obj_annotations",
        "label": "Annotations (Pro)",
        "props": [
            {
                "name": "show",
                "type": "bool",
                "def": true,
                "key": "Prop_annotations_show",
                "label": "Show annotations"
            }
        ]
    },
    "smallMultiples": {
        "name": "smallMultiples",
        "key": "Obj_smallMultiples",
        "label": "Small multiples (Pro)",
        "props": [
            {
                "name": "columns",
                "type": "num",
                "def": 0,
                "key": "Prop_smallMultiples_columns",
                "label": "Columns (0 = automatic)",
                "min": 0,
                "max": 12
            },
            {
                "name": "gap",
                "type": "num",
                "def": 8,
                "key": "Prop_smallMultiples_gap",
                "label": "Space between panels",
                "min": 0,
                "max": 40
            },
            {
                "name": "titleFontSize",
                "type": "num",
                "def": 12,
                "key": "Prop_smallMultiples_titleFontSize",
                "label": "Title size",
                "min": 7,
                "max": 24
            },
            {
                "name": "titleColor",
                "type": "fill",
                "def": "#252423",
                "key": "Prop_smallMultiples_titleColor",
                "label": "Title color"
            },
            {
                "name": "titleBold",
                "type": "bool",
                "def": true,
                "key": "Prop_smallMultiples_titleBold",
                "label": "Bold title"
            },
            {
                "name": "titleAlign",
                "type": "enum",
                "def": "left",
                "key": "Prop_smallMultiples_titleAlign",
                "label": "Title alignment",
                "items": [
                    [
                        "left",
                        "Enum_titleAlign_left",
                        "Left"
                    ],
                    [
                        "center",
                        "Enum_titleAlign_center",
                        "Center"
                    ]
                ]
            },
            {
                "name": "background",
                "type": "fill",
                "def": "",
                "key": "Prop_smallMultiples_background",
                "label": "Panel background"
            },
            {
                "name": "border",
                "type": "bool",
                "def": false,
                "key": "Prop_smallMultiples_border",
                "label": "Panel border"
            },
            {
                "name": "borderColor",
                "type": "fill",
                "def": "#E1DFDD",
                "key": "Prop_smallMultiples_borderColor",
                "label": "Panel border color"
            },
            {
                "name": "sizeByTotal",
                "type": "bool",
                "def": false,
                "key": "Prop_smallMultiples_sizeByTotal",
                "label": "Size by total"
            }
        ]
    },
    "accessibility": {
        "name": "accessibility",
        "key": "Obj_accessibility",
        "label": "Accessibility",
        "props": [
            {
                "name": "highContrast",
                "type": "enum",
                "def": "auto",
                "key": "Prop_accessibility_highContrast",
                "label": "High contrast",
                "items": [
                    [
                        "auto",
                        "Enum_highContrast_auto",
                        "Automatic"
                    ],
                    [
                        "on",
                        "Enum_highContrast_on",
                        "On"
                    ]
                ]
            },
            {
                "name": "patterns",
                "type": "bool",
                "def": false,
                "key": "Prop_accessibility_patterns",
                "label": "Patterns"
            },
            {
                "name": "focusColor",
                "type": "fill",
                "def": "",
                "key": "Prop_accessibility_focusColor",
                "label": "Focus color"
            },
            {
                "name": "focusWidth",
                "type": "num",
                "def": 2,
                "key": "Prop_accessibility_focusWidth",
                "label": "Focus width",
                "min": 1,
                "max": 6
            },
            {
                "name": "minFontSize",
                "type": "num",
                "def": 8,
                "key": "Prop_accessibility_minFontSize",
                "label": "Minimum text size",
                "min": 8,
                "max": 16
            },
            {
                "name": "reduceMotion",
                "type": "bool",
                "def": false,
                "key": "Prop_accessibility_reduceMotion",
                "label": "Reduce motion"
            }
        ]
    }
};
export const PANE: CardSpec[] = [
    {
        "uid": "style",
        "key": "Obj_style",
        "label": "Style template",
        "groups": [
            {
                "obj": "style",
                "toggle": null
            }
        ]
    },
    {
        "uid": "slices",
        "key": "Obj_slices",
        "label": "Slices",
        "groups": [
            {
                "obj": "slices",
                "toggle": null
            }
        ]
    },
    {
        "uid": "labels",
        "key": "Obj_labels",
        "label": "Data labels",
        "groups": [
            {
                "obj": "labels",
                "toggle": "show"
            }
        ]
    },
    {
        "uid": "center",
        "key": "Obj_center",
        "label": "Center",
        "groups": [
            {
                "obj": "center",
                "toggle": "show"
            }
        ]
    },
    {
        "uid": "scaleRing",
        "key": "Obj_scaleRing",
        "label": "Scale ring",
        "groups": [
            {
                "obj": "scaleRing",
                "toggle": null
            }
        ]
    },
    {
        "uid": "legend",
        "key": "Obj_legend",
        "label": "Legend",
        "groups": [
            {
                "obj": "legend",
                "toggle": null
            }
        ]
    },
    {
        "uid": "compare",
        "key": "Obj_compare",
        "label": "Compare with (Pro)",
        "groups": [
            {
                "obj": "compare",
                "toggle": null
            }
        ]
    },
    {
        "uid": "target",
        "key": "Obj_target",
        "label": "Target (Pro)",
        "groups": [
            {
                "obj": "target",
                "toggle": null
            }
        ]
    },
    {
        "uid": "annotations",
        "key": "Obj_annotations",
        "label": "Annotations (Pro)",
        "groups": [
            {
                "obj": "annotations",
                "toggle": "show"
            }
        ]
    },
    {
        "uid": "smallMultiples",
        "key": "Obj_smallMultiples",
        "label": "Small multiples (Pro)",
        "groups": [
            {
                "obj": "smallMultiples",
                "toggle": null
            }
        ]
    },
    {
        "uid": "accessibility",
        "key": "Obj_accessibility",
        "label": "Accessibility",
        "groups": [
            {
                "obj": "accessibility",
                "toggle": null
            }
        ]
    }
];
