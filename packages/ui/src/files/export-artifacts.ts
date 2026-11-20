import type { DiagramDocument } from '@diagramai/diagram-core';
import type { FileKind } from './file-port';

const fontCache = new Map<string, Promise<string>>();
async function fontBase64(basePath: string, weight: 'Regular' | 'Bold') {
  const url = `${basePath}fonts/NotoSans-${weight}.ttf`;
  if (!fontCache.has(url)) fontCache.set(url, (async () => {
    const response = await fetch(url); if (!response.ok) throw new Error('Không tải được font tiếng Việt để xuất file.');
    const bytes = new Uint8Array(await response.arrayBuffer()); let binary = '';
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(binary);
  })());
  try { return await fontCache.get(url)!; } catch (error) { fontCache.delete(url); throw error; }
}
export async function exportArtifact(document: DiagramDocument, kind: Exclude<FileKind, 'document'>, basePath: string, options: { transparent: boolean; scale: number }) {
  const { renderDiagramSvg } = await import('@diagramai/editor/export');
  if (kind === 'svg') return new Blob([renderDiagramSvg(document, { transparent: options.transparent }).svg], { type: 'image/svg+xml;charset=utf-8' });
  const [regular, bold] = await Promise.all([fontBase64(basePath, 'Regular'), fontBase64(basePath, 'Bold')]);
  if (kind === 'png') {
    const fontCss = `@font-face{font-family:DiagramExport;src:url(data:font/ttf;base64,${regular}) format('truetype');font-weight:400 600}@font-face{font-family:DiagramExport;src:url(data:font/ttf;base64,${bold}) format('truetype');font-weight:700}`;
    const rendered = renderDiagramSvg(document, { transparent: options.transparent, fontFamily: 'DiagramExport', fontCss });
    const width = Math.ceil(rendered.width * options.scale), height = Math.ceil(rendered.height * options.scale);
    if (width > 16384 || height > 16384 || width * height > 16_000_000) throw new Error('Ảnh quá lớn (tối đa 16 triệu pixel, mỗi chiều 16384px). Giảm tỷ lệ xuất hoặc dùng SVG/PDF.');
    const url = URL.createObjectURL(new Blob([rendered.svg], { type: 'image/svg+xml' }));
    try {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = globalThis.document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d'); if (!context) throw new Error('Không tạo được canvas để xuất PNG.');
      context.drawImage(image, 0, 0, width, height);
      return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Trình duyệt không tạo được PNG.')), 'image/png'));
    } finally { URL.revokeObjectURL(url); }
  }
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const rendered = renderDiagramSvg(document, { fontFamily: 'Noto Sans' });
  const svg = new DOMParser().parseFromString(rendered.svg, 'image/svg+xml').documentElement as unknown as SVGSVGElement;
  const landscape = rendered.width > rendered.height, pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4', putOnlyUsedFonts: true, compress: true });
  pdf.addFileToVFS('NotoSans-Regular.ttf', regular); pdf.addFileToVFS('NotoSans-Bold.ttf', bold);
  pdf.addFont('NotoSans-Regular.ttf', 'Noto Sans', 'normal'); pdf.addFont('NotoSans-Bold.ttf', 'Noto Sans', 'bold'); pdf.addFont('NotoSans-Bold.ttf', 'Noto Sans', '600normal');
  pdf.setFont('Noto Sans', 'normal'); pdf.setProperties({ title: document.title, creator: 'DiagramAI' });
  const margin = 24, pageWidth = pdf.internal.pageSize.getWidth(), pageHeight = pdf.internal.pageSize.getHeight();
  const scale = Math.min((pageWidth - 2 * margin) / rendered.width, (pageHeight - 2 * margin) / rendered.height);
  const container = globalThis.document.createElement('div'); container.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none'; container.append(svg); globalThis.document.body.append(container);
  try { await svg2pdf(svg, pdf, { x: (pageWidth - rendered.width * scale) / 2, y: (pageHeight - rendered.height * scale) / 2, width: rendered.width * scale, height: rendered.height * scale }); }
  finally { container.remove(); }
  return pdf.output('blob');
}
