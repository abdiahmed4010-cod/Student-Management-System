/**
 * AL-IMAAMA - UI Components & Helpers
 * Contains SVG icon renderer, Modal manager, Toast notifications, Confirmation dialogs, Official Logo helper, and Excel Export.
 */

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export const OFFICIAL_LOGO_SRC = '/assets/aistudio/image_6159b039.png';

// Embedded Lucide SVG paths for 100% offline reliability
const ICONS = {
  'layout-dashboard': '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  'graduation-cap': '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  'school': '<path d="m4 6 8-4 8 4"/><path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2"/><path d="M14 22v-4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v4"/><path d="M18 5v17"/><path d="M6 5v17"/><circle cx="12" cy="9" r="2"/>',
  'book-open': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'clipboard-check': '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  'file-spreadsheet': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
  'award': '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
  'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  'wallet': '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  'bar-chart-3': '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  'shield-check': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
  'settings': '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  'plus': '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'filter': '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  'printer': '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  'trash-2': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  'edit': '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  'eye': '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  'check': '<polyline points="20 6 9 17 4 12"/>',
  'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'alert-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  'menu': '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  'chevron-down': '<polyline points="6 9 12 15 18 9"/>',
  'chevron-right': '<polyline points="9 18 15 12 9 6"/>',
  'calendar': '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
  'phone': '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  'mail': '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  'lock': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'user': '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'check-square': '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  'info': '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/>',
  'panel-left-open': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/>',
  'panel-left-close': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/>',
  'globe': '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  'upload-cloud': '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/>',
  'file': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  'dollar-sign': '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  'key': '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  'sliders': '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
  'chevron-left': '<polyline points="15 18 9 12 15 6"/>',
  'trending-down': '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  'arrow-up-right': '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  'arrow-down-left': '<path d="M17 7 7 17"/><path d="M17 17H7V7"/>',
  'scroll-text': '<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>'
};

export const Components = {
  OFFICIAL_LOGO_SRC,

  // Renders exact unmodified official MADARASATUL AL-IMAAM logo
  getLogoHtml(sizeClass = 'w-12 h-12', extraClass = '') {
    return `<img src="${OFFICIAL_LOGO_SRC}" alt="MADARASATUL AL-IMAAM Official Logo" referrerPolicy="no-referrer" class="${sizeClass} official-logo-img rounded-full border border-amber-400/80 p-0.5 shadow-xs shrink-0 ${extraClass}" />`;
  },

  // Helper to strip HTML tags for clean Excel / PDF cell text
  stripHtml(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'number' || typeof val === 'boolean') return val;
    return String(val).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  },

  // Real Excel (.xlsx) Workbook Export via SheetJS (preserves numbers & includes report title/period)
  exportToExcel(filename, sheetName, headers, rows, totalsRow = null, meta = null) {
    const wb = XLSX.utils.book_new();
    const aoa = [];

    if (meta) {
      const inst = meta.institutionName || 'MADARASATUL AL-IMAAM';
      const sys = meta.systemName || 'AL-IMAAMA';
      aoa.push([`${inst} — ${sys}`]);
      if (meta.reportTitle) aoa.push([meta.reportTitle]);
      const detailParts = [];
      if (meta.academicPeriod) detailParts.push(`Academic Period: ${meta.academicPeriod}`);
      if (meta.filterDescription) detailParts.push(`Scope: ${meta.filterDescription}`);
      if (meta.generatedDate) detailParts.push(`Generated: ${meta.generatedDate}`);
      if (detailParts.length > 0) aoa.push([detailParts.join(' | ')]);
      aoa.push([]);
    }

    const cleanHeaders = headers.map(h => this.stripHtml(typeof h === 'object' ? h.label : h));
    aoa.push(cleanHeaders);

    const normalizeCell = (cell) => {
      if (cell === null || cell === undefined) return '—';
      if (typeof cell === 'number' && !isNaN(cell)) return cell;
      const cleaned = this.stripHtml(cell);
      return cleaned === '' ? '—' : cleaned;
    };

    rows.forEach(row => {
      aoa.push(row.map(normalizeCell));
    });

    if (totalsRow && totalsRow.length > 0) {
      aoa.push(totalsRow.map(normalizeCell));
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Calculate clean readable column widths
    ws['!cols'] = cleanHeaders.map((h, colIdx) => {
      let maxLen = String(h).length;
      rows.forEach(r => {
        const val = r[colIdx] !== undefined && r[colIdx] !== null ? String(this.stripHtml(r[colIdx])) : '';
        if (val.length > maxLen) maxLen = val.length;
      });
      if (totalsRow && totalsRow[colIdx] !== undefined && totalsRow[colIdx] !== null) {
        const tLen = String(this.stripHtml(totalsRow[colIdx])).length;
        if (tLen > maxLen) maxLen = tLen;
      }
      return { wch: Math.min(Math.max(maxLen + 3, 12), 45) };
    });

    const safeSheet = (sheetName || 'Report').replace(/[\\/?*[\]]/g, '').slice(0, 31) || 'Report';
    XLSX.utils.book_append_sheet(wb, ws, safeSheet);
    XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
  },

  async _loadLogoDataUrl() {
    try {
      const resp = await fetch(OFFICIAL_LOGO_SRC);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  },

  // Official PDF Export with Unmodified MADARASATUL AL-IMAAM Logo & Royal Navy/Gold Formatting
  async exportToPDF({
    filename,
    institutionName = 'MADARASATUL AL-IMAAM',
    systemName = 'AL-IMAAMA',
    address = 'Hargeisa, Somaliland',
    contactPhone = '063-4129440',
    reportTitle = 'Official School Report',
    academicPeriod = '',
    filterDescription = '',
    generatedDate = new Date().toLocaleDateString(),
    headers = [],
    rows = [],
    totalsRow = null,
    summaryItems = [],
    preparedBy = ''
  }) {
    const cleanHeaders = headers.map(h => (typeof h === 'object' ? h : { label: String(h), align: 'left' }));
    const orientation = cleanHeaders.length >= 7 ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;

    // Top Royal Navy accent strip & subtle Gold divider
    doc.setFillColor(10, 38, 102); // #0A2666
    doc.rect(0, 0, pageWidth, 4, 'F');

    const logoDataUrl = await this._loadLogoDataUrl();
    const textX = logoDataUrl ? margin + 21 : margin;
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', margin, 8, 17, 17);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(179, 131, 14); // Gold accent
    doc.text(`${systemName} · OFFICIAL MADRASAH REPORT`, textX, 11.5);

    doc.setFontSize(14);
    doc.setTextColor(10, 38, 102);
    doc.text(institutionName, textX, 17.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`${address} · Tel: ${contactPhone}`, textX, 22);

    // Right metadata block
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(10, 38, 102);
    doc.text(`Generated: ${generatedDate}`, pageWidth - margin, 12, { align: 'right' });
    if (academicPeriod) {
      doc.setFont('helvetica', 'normal');
      doc.text(`Period: ${academicPeriod}`, pageWidth - margin, 16.5, { align: 'right' });
    }
    doc.setFont('helvetica', 'normal');
    doc.text(`Records: ${rows.length}`, pageWidth - margin, 21, { align: 'right' });

    // Royal Navy & Gold horizontal rules
    doc.setDrawColor(10, 38, 102);
    doc.setLineWidth(0.7);
    doc.line(margin, 27, pageWidth - margin, 27);
    doc.setDrawColor(212, 160, 23);
    doc.setLineWidth(0.35);
    doc.line(margin, 28.2, pageWidth - margin, 28.2);

    // Report Title & Scope
    let cursorY = 34;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(11, 31, 75);
    doc.text(reportTitle, margin, cursorY);
    cursorY += 5;

    if (filterDescription) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Filter Scope: ${filterDescription}`, margin, cursorY);
      cursorY += 5;
    }

    if (summaryItems && summaryItems.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(10, 38, 102);
      const summaryLine = summaryItems.map(s => `${s.label}: ${this.stripHtml(s.value)}`).join('   |   ');
      doc.text(summaryLine, margin, cursorY);
      cursorY += 5.5;
    }

    const headRow = [cleanHeaders.map(h => this.stripHtml(h.label))];
    const bodyRows = rows.length > 0
      ? rows.map(r => r.map(c => {
          const val = this.stripHtml(c);
          return val === '' ? '—' : String(val);
        }))
      : [[{ content: 'No records found for the selected criteria.', colSpan: Math.max(1, cleanHeaders.length), styles: { halign: 'center', textColor: [100, 116, 139] } }]];

    const footRows = (totalsRow && totalsRow.length > 0 && rows.length > 0)
      ? [totalsRow.map(t => String(this.stripHtml(t)))]
      : undefined;

    const columnStyles = {};
    cleanHeaders.forEach((h, idx) => {
      columnStyles[idx] = { halign: h.align === 'right' ? 'right' : h.align === 'center' ? 'center' : 'left' };
    });

    autoTable(doc, {
      startY: cursorY,
      head: headRow,
      body: bodyRows,
      foot: footRows,
      showHead: 'everyPage',
      showFoot: 'lastPage',
      rowPageBreak: 'avoid',
      margin: { left: margin, right: margin, bottom: 18 },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: cleanHeaders.length >= 8 ? 7.5 : 8.5,
        cellPadding: 2.3,
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.2,
        overflow: 'linebreak'
      },
      headStyles: {
        fillColor: [10, 38, 102],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      footStyles: {
        fillColor: [238, 244, 255],
        textColor: [10, 38, 102],
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles,
      didDrawPage: (data) => {
        const pageNum = doc.internal.getNumberOfPages();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        const footerLeft = preparedBy ? `Prepared by: ${preparedBy} · ${institutionName}` : institutionName;
        doc.text(footerLeft, margin, pageHeight - 8);
        doc.text(`Page ${data.pageNumber} of ${pageNum}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
      }
    });

    doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
  },

  // Trigger clean native browser print with dynamic A4 orientation & logo image readiness
  async triggerPrint({ orientation = 'portrait', targetSelector = '.printable-area' } = {}) {
    const safeOrientation = orientation === 'landscape' ? 'landscape' : 'portrait';
    const marginSpec = safeOrientation === 'landscape' ? '10mm 10mm 14mm 10mm' : '12mm 12mm 16mm 12mm';

    let styleEl = document.getElementById('alimaama-print-page-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'alimaama-print-page-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `@media print { @page { size: A4 ${safeOrientation}; margin: ${marginSpec}; } }`;

    // Ensure official logo & printable images finish loading/decoding before print dialog opens
    const targetEl = document.querySelector(targetSelector) || document;
    const imgs = targetEl && typeof targetEl.querySelectorAll === 'function'
      ? Array.from(targetEl.querySelectorAll('img'))
      : [];

    if (imgs.length > 0) {
      let timeoutId = null;
      await Promise.race([
        Promise.all(imgs.map(img => {
          if (img.complete) {
            return typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve();
          }
          return new Promise(resolve => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          });
        })),
        new Promise(resolve => {
          timeoutId = setTimeout(resolve, 1200);
        })
      ]).finally(() => {
        if (timeoutId !== null) clearTimeout(timeoutId);
      });
    }

    // Allow browser to paint updated DOM & dynamic @page rule
    if (typeof requestAnimationFrame === 'function') {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }

    const cleanup = () => {
      const existing = document.getElementById('alimaama-print-page-style');
      if (existing) existing.remove();
    };
    window.addEventListener('afterprint', cleanup, { once: true });

    window.print();
  },

  // Generate and download real AL-IMAAMA-Complete-Project.zip from live workspace/bundle files
  async downloadProjectZip(triggerBtn = null) {
    const origHtml = triggerBtn ? triggerBtn.innerHTML : '';
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.classList.add('opacity-70', 'cursor-wait');
      triggerBtn.innerHTML = `${this.icon('refresh-cw', 'w-4 h-4 animate-spin')} Preparing Project ZIP...`;
    }

    try {
      let archiveData = null;

      // In dev server, read live workspace files on disk; fallback to virtual bundle in production build
      try {
        const resp = await fetch('/__api/project-archive-files.json', { cache: 'no-store' });
        const contentType = resp.headers.get('content-type') || '';
        if (resp.ok && contentType.includes('application/json')) {
          archiveData = await resp.json();
        }
      } catch {
        // Ignore and fallback to bundled virtual module
      }

      if (!archiveData) {
        const mod = await import('virtual:alimaama-project-files');
        archiveData = mod && mod.default ? mod.default : mod;
      }

      if (!archiveData || !archiveData.textFiles || Object.keys(archiveData.textFiles).length === 0) {
        throw new Error('No project source files could be collected.');
      }

      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();

      // Add all sanitized source & configuration files preserving exact directory structure
      const fileEntries = Object.entries(archiveData.textFiles);
      for (const [relPath, content] of fileEntries) {
        const cleanPath = String(relPath).replace(/^\/+/, '');
        const lower = cleanPath.toLowerCase();
        const baseName = cleanPath.split('/').pop() || '';
        // Defense-in-depth exclusion guard
        if (
          (baseName !== '.env.example' && (baseName === '.env' || baseName.startsWith('.env.'))) ||
          lower.includes('node_modules/') ||
          lower.startsWith('dist/') ||
          lower.includes('credentials') ||
          lower.includes('service-account')
        ) {
          continue;
        }
        zip.file(cleanPath, content);
      }

      // Add binary assets (including official MADARASATUL AL-IMAAM logo)
      const binaryAssets = Array.isArray(archiveData.binaryAssetUrls) && archiveData.binaryAssetUrls.length > 0
        ? archiveData.binaryAssetUrls
        : [{ archivePath: 'public/assets/aistudio/image_6159b039.png', fetchUrl: OFFICIAL_LOGO_SRC }];

      for (const asset of binaryAssets) {
        const binResp = await fetch(asset.fetchUrl);
        if (!binResp.ok) {
          throw new Error(`Failed to fetch asset ${asset.archivePath}`);
        }
        const buffer = await binResp.arrayBuffer();
        zip.file(asset.archivePath.replace(/^\/+/, ''), buffer);
      }

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      if (!zipBlob || zipBlob.size === 0) {
        throw new Error('Generated ZIP archive is empty.');
      }

      const filename = 'AL-IMAAMA-Complete-Project.zip';
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      this.showToast(`Downloaded ${filename} (${fileEntries.length + binaryAssets.length} project files).`, 'success', 4500);
      return { success: true, filename, fileCount: fileEntries.length + binaryAssets.length, size: zipBlob.size };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to create project ZIP archive.';
      this.showToast(`Project ZIP download failed: ${msg}`, 'error', 5000);
      return { success: false, error: msg };
    } finally {
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.classList.remove('opacity-70', 'cursor-wait');
        triggerBtn.innerHTML = origHtml;
      }
    }
  },

  // SVG Icon generator
  icon(name, className = 'w-4 h-4', size = 20) {
    const content = ICONS[name] || ICONS['info'];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}">${content}</svg>`;
  },

  // Toast Notification System
  showToast(message, type = 'success', duration = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none';
      document.body.appendChild(container);
    }

    const normalizedType = type === 'danger' ? 'error' : type;
    const toast = document.createElement('div');
    toast.className = `toast-enter pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border shadow-sm text-sm font-medium ${
      normalizedType === 'success' 
        ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
        : normalizedType === 'error'
        ? 'bg-rose-50 border-rose-200 text-rose-900'
        : normalizedType === 'warning'
        ? 'bg-amber-50 border-amber-200 text-amber-900'
        : 'bg-blue-50 border-blue-200 text-blue-900'
    }`;

    const iconType = normalizedType === 'success' ? 'check-circle' : normalizedType === 'error' ? 'alert-circle' : normalizedType === 'warning' ? 'alert-circle' : 'info';
    
    toast.innerHTML = `
      <div class="shrink-0">${this.icon(iconType, 'w-5 h-5')}</div>
      <div class="flex-1 leading-snug">${message}</div>
      <button class="shrink-0 text-slate-400 hover:text-slate-600 transition-colors p-1" onclick="this.parentElement.remove()">
        ${this.icon('x', 'w-4 h-4')}
      </button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.replace('toast-enter', 'toast-exit');
        setTimeout(() => toast.remove(), 200);
      }
    }, duration);
  },

  // Modal Dialog System
  openModal(htmlContent, title = '', options = {}) {
    this.closeModal(); // Close existing if any

    const modalBackdrop = document.createElement('div');
    modalBackdrop.id = 'active-modal-backdrop';
    modalBackdrop.className = 'modal-backdrop fixed inset-0 z-40 flex items-center justify-center p-4 overflow-y-auto';

    const maxWidth = options.maxWidth || 'max-w-2xl';

    modalBackdrop.innerHTML = `
      <div class="relative w-full ${maxWidth} bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden my-8" onclick="event.stopPropagation()">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50">
          <h3 class="text-base font-semibold text-slate-900">${title}</h3>
          <button id="modal-close-btn" class="text-slate-400 hover:text-slate-700 transition-colors p-1.5 rounded-lg hover:bg-slate-100">
            ${this.icon('x', 'w-5 h-5')}
          </button>
        </div>
        <!-- Body -->
        <div class="p-6 max-h-[calc(85vh-8rem)] overflow-y-auto custom-scrollbar">
          ${htmlContent}
        </div>
      </div>
    `;

    document.body.appendChild(modalBackdrop);
    document.body.style.overflow = 'hidden';

    // Event listeners
    document.getElementById('modal-close-btn').addEventListener('click', () => this.closeModal());
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) this.closeModal();
    });

    // Escape key
    const onKey = (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        window.removeEventListener('keydown', onKey);
      }
    };
    window.addEventListener('keydown', onKey);

    return modalBackdrop;
  },

  closeModal() {
    const existing = document.getElementById('active-modal-backdrop');
    if (existing) {
      existing.remove();
      document.body.style.overflow = '';
    }
  },

  // Confirmation Dialog
  confirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', isDestructive = false, onConfirm }) {
    const content = `
      <div class="space-y-4">
        <p class="text-sm text-slate-600 leading-relaxed">${message}</p>
        <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button id="confirm-cancel-btn" class="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            ${cancelText}
          </button>
          <button id="confirm-action-btn" class="px-4 py-2 text-xs font-medium text-white ${isDestructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'} rounded-lg transition-colors">
            ${confirmText}
          </button>
        </div>
      </div>
    `;

    this.openModal(content, title, { maxWidth: 'max-w-md' });

    document.getElementById('confirm-cancel-btn').addEventListener('click', () => this.closeModal());
    document.getElementById('confirm-action-btn').addEventListener('click', () => {
      this.closeModal();
      if (typeof onConfirm === 'function') onConfirm();
    });
  },

  // Empty State renderer
  emptyState(title, description, actionButtonHtml = '') {
    return `
      <div class="text-center py-12 px-4 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
        <div class="mx-auto w-12 h-12 flex items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-3">
          ${this.icon('info', 'w-6 h-6')}
        </div>
        <h4 class="text-sm font-semibold text-slate-900">${title}</h4>
        <p class="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">${description}</p>
        ${actionButtonHtml}
      </div>
    `;
  },

  // Printable Payment Receipt Modal
  showReceiptModal(payment, student, classObj, settings) {
    const currency = settings.currencySymbol || '$';
    const content = `
      <div class="space-y-6 printable-area bg-white p-3 border-t-4 border-t-blue-900 rounded-lg">
        <div class="flex items-start justify-between border-b-2 pb-4 border-blue-900">
          <div class="flex items-center gap-3.5">
            ${this.getLogoHtml('w-14 h-14')}
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">AL-IMAAMA · Official School System</span>
              <h2 class="text-base font-extrabold text-blue-900 tracking-tight">${settings.institutionName || 'MADARASATUL AL-IMAAM'}</h2>
              <p class="text-xs text-slate-500">${settings.address || 'Hargeisa, Somaliland'} · Tel: ${settings.contactPhone || '063-4129440'}</p>
            </div>
          </div>
          <div class="text-right">
            <span class="inline-block px-2.5 py-1 text-[11px] font-bold bg-blue-900 text-amber-300 border border-amber-400/50 rounded-md tracking-wide">OFFICIAL RECEIPT</span>
            <p class="text-xs text-slate-500 mt-1.5 font-mono font-semibold">${payment.transactionRef}</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
          <div>
            <span class="text-slate-400 uppercase tracking-wider text-[10px] font-semibold block">Student Details</span>
            <p class="font-bold text-slate-900 mt-0.5">${student.fullName}</p>
            <p class="text-slate-500">ID: ${student.id} · Class: ${classObj ? classObj.name : 'N/A'}</p>
            <p class="text-slate-500">Parent Phone: ${student.parentPhone}</p>
          </div>
          <div>
            <span class="text-slate-400 uppercase tracking-wider text-[10px] font-semibold block">Payment Information</span>
            <p class="font-bold text-slate-900 mt-0.5">Date: ${payment.paymentDate}</p>
            <p class="text-slate-500">Fee Category: <span class="font-medium text-slate-800">${payment.feeCategory}</span></p>
            <p class="text-slate-500">Method: <span class="font-medium text-slate-800">${payment.paymentMethod}</span></p>
          </div>
        </div>

        <table class="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
          <thead class="bg-blue-900 text-white border-b border-blue-950">
            <tr>
              <th class="py-2.5 px-3 text-left font-semibold">Description</th>
              <th class="py-2.5 px-3 text-right font-semibold">Fee Period</th>
              <th class="py-2.5 px-3 text-right font-semibold">Total Due</th>
              <th class="py-2.5 px-3 text-right font-semibold">Amount Paid</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr>
              <td class="py-3 px-3 font-medium text-slate-900">${payment.feeCategory} - Tuition Obligation</td>
              <td class="py-3 px-3 text-right text-slate-500">${payment.month}</td>
              <td class="py-3 px-3 text-right tabular-nums text-slate-600">${currency}${payment.amountDue.toFixed(2)}</td>
              <td class="py-3 px-3 text-right tabular-nums font-bold text-emerald-700">${currency}${payment.amountPaid.toFixed(2)}</td>
            </tr>
          </tbody>
          <tfoot class="bg-slate-50 font-medium border-t border-slate-200">
            <tr>
              <td colspan="3" class="py-2.5 px-3 text-right text-slate-600">Remaining Period Balance:</td>
              <td class="py-2.5 px-3 text-right tabular-nums font-bold text-slate-900">
                ${currency}${Math.max(0, payment.amountDue - payment.amountPaid).toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>

        <div class="flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-200">
          <span>Processed by: ${payment.recordedBy}</span>
          <span>${settings.institutionName || 'MADARASATUL AL-IMAAM'} · ${new Date().toLocaleDateString()}</span>
        </div>

        <div class="flex items-center justify-end gap-2.5 pt-2 no-print">
          <button id="receipt-pdf-btn" type="button" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">
            ${this.icon('file-text', 'w-4 h-4')} Save as PDF
          </button>
          <button id="receipt-print-btn" type="button" class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
            ${this.icon('printer', 'w-4 h-4')} Print Receipt
          </button>
        </div>
      </div>
    `;

    const modal = this.openModal(content, `Receipt: ${payment.transactionRef}`, { maxWidth: 'max-w-xl' });
    const pdfBtn = modal.querySelector('#receipt-pdf-btn');
    const printBtn = modal.querySelector('#receipt-print-btn');
    if (pdfBtn) pdfBtn.addEventListener('click', () => this.triggerPrint({ orientation: 'portrait' }));
    if (printBtn) printBtn.addEventListener('click', () => this.triggerPrint({ orientation: 'portrait' }));
  }
};
