"use client";

import { useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface SheetColumn {
  key: string;
  header: string;
  editable?: boolean;
  type?: "text" | "number";
  width?: number;
}

export interface SheetRow {
  id: string;
  values: Record<string, string | number>;
}

export interface NestedHeader {
  title: string;
  colspan?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  columns: SheetColumn[];
  rows: SheetRow[];
  onCellChange: (rowId: string, colKey: string, value: string | number) => void;
  mergeCells?: Record<string, [number, number]>;
  nestedHeaders?: NestedHeader[][];
  /** 상단 데이터 행 고정 개수 (스크롤 시 thead 아래에 sticky) */
  freezeRows?: number;
  /** 행 추가 허용 여부 (기본 true) */
  allowInsertRow?: boolean;
  /** 열 추가 허용 여부 (기본 false) */
  allowInsertColumn?: boolean;
}

export function SpreadsheetModal({
  open,
  onOpenChange,
  title,
  columns,
  rows,
  onCellChange,
  mergeCells,
  nestedHeaders,
  freezeRows,
  allowInsertRow: allowInsertRowProp = true,
  allowInsertColumn: allowInsertColumnProp = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jssRef = useRef<any>(null);
  const rowsRef = useRef(rows);
  const columnsRef = useRef(columns);
  rowsRef.current = rows;
  columnsRef.current = columns;

  const onCellChangeRef = useRef(onCellChange);
  onCellChangeRef.current = onCellChange;
  const mergeCellsRef = useRef(mergeCells);
  mergeCellsRef.current = mergeCells;
  const nestedHeadersRef = useRef(nestedHeaders);
  nestedHeadersRef.current = nestedHeaders;
  const freezeRowsRef = useRef(freezeRows);
  freezeRowsRef.current = freezeRows;
  const closingRef = useRef(false);
  const readyRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!open) {
      document.getElementById("jsuites-css")?.remove();
      document.getElementById("jss-css")?.remove();
      document.getElementById("jss-freeze-fix")?.remove();
      return;
    }

    const addCSS = (id: string, href: string) => {
      if (document.getElementById(id)) return;
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    };

    addCSS("jsuites-css", "https://cdn.jsdelivr.net/npm/jsuites@4/dist/jsuites.min.css");
    addCSS("jss-css", "https://cdn.jsdelivr.net/npm/jspreadsheet-ce@4/dist/jspreadsheet.min.css");

    if (!document.getElementById("jss-freeze-fix")) {
      const style = document.createElement("style");
      style.id = "jss-freeze-fix";
      style.textContent = `
        .jss-modal .jexcel_content {
          overflow: auto !important;
        }

        .jss-modal .jexcel td {
          background-color: #fff;
        }

        /* === 열 고정: 1열(행번호) + 2열(제품명) — 좌우 스크롤 고정 === */
        .jss-modal .jexcel td:nth-child(1) {
          position: sticky !important;
          left: 0 !important;
          z-index: 2 !important;
          background-color: #fff !important;
        }
        .jss-modal .jexcel td:nth-child(2) {
          position: sticky !important;
          left: 50px !important;
          z-index: 2 !important;
          background-color: #fff !important;
        }

        /* === thead 고정 (상하 스크롤) === */
        .jss-modal .jexcel thead tr td {
          position: sticky !important;
          z-index: 3 !important;
          background-color: #f0f0f0 !important;
        }
        .jss-modal .jexcel thead tr:first-child td {
          top: 0 !important;
        }
        .jss-modal .jexcel thead tr:last-child td {
          top: var(--jss-nested-header-height, 0px) !important;
        }

        /* === 교차점: thead + 고정 열 === */
        .jss-modal .jexcel thead tr td:nth-child(1) {
          left: 0 !important;
          z-index: 5 !important;
        }
        .jss-modal .jexcel thead tr td:nth-child(2) {
          left: 50px !important;
          z-index: 5 !important;
        }
      `;
      document.head.appendChild(style);
    }

    return () => {
      document.getElementById("jsuites-css")?.remove();
      document.getElementById("jss-css")?.remove();
      document.getElementById("jss-freeze-fix")?.remove();
    };
  }, [open]);

  const initSpreadsheet = useCallback(async () => {
    if (!containerRef.current || jssRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import("jspreadsheet-ce") as any;
    const jspreadsheet = mod.default || mod;

    const cols = columnsRef.current;
    const currentRows = rowsRef.current;

    const jssColumns = cols.map((col) => ({
      title: col.header,
      width: col.width || 120,
      type: "text" as const,
      readOnly: !col.editable,
    }));

    const data = currentRows.map((row) =>
      cols.map((col) => {
        const val = row.values[col.key];
        return val !== undefined && val !== null ? val : "";
      })
    );

    if (!containerRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = {
      data: data.length > 0 ? data : [cols.map(() => "")],
      columns: jssColumns,
      minDimensions: allowInsertRowProp
        ? [cols.length, Math.max(currentRows.length + 100, 100)]
        : [cols.length, currentRows.length],
      tableOverflow: true,
      tableWidth: wrapperRef.current
        ? `${wrapperRef.current.clientWidth - 48}px`
        : "100%",
      tableHeight: wrapperRef.current
        ? `${wrapperRef.current.clientHeight - 16}px`
        : "100%",
      allowInsertRow: allowInsertRowProp,
      allowInsertColumn: allowInsertColumnProp,
      allowDeleteRow: false,
      allowDeleteColumn: false,
      allowRenameColumn: false,
      columnSorting: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onchange: (_el: any, _cell: any, colIdx: any, rowIdx: any, newValue: any) => {
        if (closingRef.current || !readyRef.current) return;
        const rIdx = Number(rowIdx);
        const cIdx = Number(colIdx);
        const currentCols = columnsRef.current;
        const currentRowsNow = rowsRef.current;
        if (cIdx >= currentCols.length) return;

        const col = currentCols[cIdx];
        if (!col.editable) return;

        const rowId = rIdx < currentRowsNow.length
          ? currentRowsNow[rIdx].id
          : `__new__${rIdx}`;
        let value: string | number;
        if (col.type === "number") {
          const num = Number(newValue);
          value = (newValue === "" || newValue === null || newValue === undefined) ? "" : isNaN(num) ? String(newValue) : num;
        } else {
          value = String(newValue ?? "");
        }
        onCellChangeRef.current(rowId, col.key, value);
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onblur: () => {
        try {
          jssRef.current?.closeEditor?.(true);
        } catch {
          // ignore
        }
      },
    };

    if (mergeCellsRef.current) {
      config.mergeCells = mergeCellsRef.current;
    }

    if (nestedHeadersRef.current && nestedHeadersRef.current.length > 0) {
      config.nestedHeaders = nestedHeadersRef.current;
    }

    jssRef.current = jspreadsheet(containerRef.current, config);

    // nestedHeaders가 있으면 CSS 변수로 높이 설정 (thead 행 sticky top 계산용)
    if (nestedHeadersRef.current && nestedHeadersRef.current.length > 0) {
      const nestedRowCount = nestedHeadersRef.current.length;
      const el = containerRef.current.querySelector('.jexcel_content') as HTMLElement;
      if (el) {
        el.style.setProperty('--jss-nested-header-height', `${nestedRowCount * 28}px`);
      }
    }

    // 데이터 행 고정 (freezeRows)
    if (freezeRowsRef.current && freezeRowsRef.current > 0 && containerRef.current) {
      const table = containerRef.current.querySelector('.jexcel') as HTMLElement;
      if (table) {
        const thead = table.querySelector('thead');
        const theadHeight = thead?.getBoundingClientRect().height || 28;
        const tbody = table.querySelector('tbody');
        if (tbody) {
          const trs = tbody.querySelectorAll('tr');
          let cumTop = theadHeight;
          for (let i = 0; i < freezeRowsRef.current && i < trs.length; i++) {
            const tr = trs[i] as HTMLElement;
            tr.style.position = 'sticky';
            tr.style.top = `${cumTop}px`;
            tr.style.zIndex = '2';
            const cells = tr.querySelectorAll('td');
            cells.forEach((td, cIdx) => {
              const el = td as HTMLElement;
              el.style.backgroundColor = '#f0f0f0';
              // 고정 열과 교차하는 셀은 z-index 높게
              if (cIdx < 2) {
                el.style.zIndex = '5';
              }
            });
            cumTop += tr.getBoundingClientRect().height;
          }
        }
      }
    }

    setTimeout(() => { readyRef.current = true; }, 50);
  }, []);

  useEffect(() => {
    if (!jssRef.current || !open) return;
    const jss = jssRef.current;
    const cols = columnsRef.current;
    const mc = mergeCellsRef.current;

    const mergedCells = new Set<string>();
    if (mc) {
      const letterToCol = (letter: string): number => {
        let col = 0;
        for (let i = 0; i < letter.length; i++) {
          col = col * 26 + (letter.charCodeAt(i) - 64);
        }
        return col - 1;
      };
      Object.entries(mc).forEach(([cellRef, [colspan, rowspan]]) => {
        const match = cellRef.match(/^([A-Z]+)(\d+)$/);
        if (!match) return;
        const startCol = letterToCol(match[1]);
        const startRow = Number(match[2]) - 1;
        for (let r = startRow; r < startRow + rowspan; r++) {
          for (let c = startCol; c < startCol + colspan; c++) {
            mergedCells.add(`${r},${c}`);
          }
        }
      });
    }

    rows.forEach((row, rIdx) => {
      cols.forEach((col, cIdx) => {
        if (mergedCells.has(`${rIdx},${cIdx}`)) return;
        const val = row.values[col.key] ?? "";
        try {
          const currentVal = jss.getValueFromCoords(cIdx, rIdx);
          if (String(val) !== String(currentVal)) {
            jss.setValueFromCoords(cIdx, rIdx, val, true);
          }
        } catch {
          // ignore
        }
      });
    });
  }, [rows, open]);

  useEffect(() => {
    if (open) {
      closingRef.current = false;
      const timer = setTimeout(() => {
        initSpreadsheet();
      }, 150);
      return () => clearTimeout(timer);
    } else {
      closingRef.current = true;
      readyRef.current = false;
      if (jssRef.current) {
        try { jssRef.current?.closeEditor?.(true); } catch { /* ignore */ }
        try { jspreadsheetDestroy(containerRef.current); } catch { /* ignore */ }
        jssRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    }
  }, [open, initSpreadsheet]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-0"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          try { jssRef.current?.closeEditor?.(true); } catch { /* ignore */ }
        }}
      >
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-2">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div ref={wrapperRef} className="flex-1 overflow-hidden px-6 pb-6">
          <div ref={containerRef} className="jss-modal" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function jspreadsheetDestroy(el: any) {
  if (el && el.jexcel) {
    el.jexcel.destroy();
  }
}
