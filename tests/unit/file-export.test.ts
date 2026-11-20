import { describe, expect, it } from 'vitest';
import { createDocument, createEdge, createNode, serializeDocument } from '@diagramai/diagram-core';
import { renderDiagramSvg } from '@diagramai/editor/export';
import { diagramBlob, parseDiagramFile, suggestedName } from '../../packages/ui/src/files/file-port';

describe('validated portable file and domain export', () => {
  it('round-trips Vietnamese JSON without UI state and rejects the entire invalid graph', async () => {
    const document = createDocument('Sơ đồ tiếng Việt'); document.nodes.push(createNode('rect', -120, -80, 'Đầu vào <script>'));
    expect(parseDiagramFile(await diagramBlob(document).text())).toEqual(document);
    const invalid = { ...document, nodes: [...document.nodes, document.nodes[0]] };
    expect(() => parseDiagramFile(JSON.stringify(invalid))).toThrow('hợp lệ');
    expect(() => parseDiagramFile(JSON.stringify({ ...document, formatVersion: 99 }))).toThrow('phiên bản');
    expect(() => parseDiagramFile('x'.repeat(2 * 1024 * 1024 + 1))).toThrow('2 MB');
    expect(serializeDocument(document)).not.toMatch(/selection|viewport|past|interaction/);
  });
  it('exports negative coordinates, arrowheads, all text and transparent/white background independently of DOM', () => {
    const document = createDocument('Kiểm tra');
    const a = createNode('diamond', -300, -200, '<script>alert(1)</script>'), b = createNode('ellipse', 200, 200, 'Đạt yêu cầu');
    document.nodes.push(a, b); document.edges.push({ ...createEdge(a.id, b.id, 'right', 'left', { kind: 'curved' }), label: 'Đi tiếp' });
    const result = renderDiagramSvg(document);
    expect(result.bounds.x).toBeLessThan(-300); expect(result.bounds.y).toBeLessThan(-200);
    expect(result.svg).toContain('marker-end'); expect(result.svg).toContain('Đi tiếp'); expect(result.svg).toContain('Đạt yêu cầu');
    expect(result.svg).not.toContain('<script>'); expect(result.svg).not.toContain('react-flow');
    expect(renderDiagramSvg(createDocument(), { transparent: true }).svg).not.toContain('<rect');
    expect(renderDiagramSvg(createDocument()).svg).toContain('fill="#ffffff"');
    expect(suggestedName('a/b:*?\n', 'pdf')).toBe('a_b____.pdf');
  });
});
