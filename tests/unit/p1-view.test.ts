import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createFixture, FILLS, SHAPES, viewReducer } from '../../packages/ui/src/editor/fixture';
import { edgeGeometry, fitPreview, portPoint, previewTextLines } from '../../packages/ui/src/editor/preview-layout';

describe('P1 view-only state (not a domain/history/persistence engine)', () => {
  it('registers exactly the approved 21 palette entries', () => {
    const reference = readFileSync('design/reference/DiagramAI_Mockup.html', 'utf8').match(/const SHAPES=\[([\s\S]*?)\n\];/)?.[1] ?? '';
    const ids = [...reference.matchAll(/id:'([^']+)'/g)].map((match) => match[1]);
    expect(SHAPES.map((shape) => shape.id)).toEqual(ids);
  });
  it('creates independent fixture state for each editor mount', () => {
    const first = createFixture();
    first.nodes[0].fill = '#000000';
    expect(createFixture().nodes[0].fill).toBe('#e9f0ff');
  });
  it('does not change color without a selected node', () => {
    const state = createFixture();
    expect(viewReducer(state, { type: 'fill', value: FILLS[2] })).toBe(state);
  });
  it('changes only the selected fixture, without mutating the old state', () => {
    const initial = createFixture();
    const selected = viewReducer(initial, { type: 'select', selection: { kind: 'node', id: 'n2' } });
    const next = viewReducer(selected, { type: 'fill', value: '#e3f9ef' });
    expect(initial.nodes[1].fill).toBe('#ffffff');
    expect(next.nodes[1]).toMatchObject({ fill: '#e3f9ef', stroke: '#62c99f' });
    expect(next.nodes[0]).toBe(initial.nodes[0]);
  });
  it('does not apply node fill to a selected edge', () => {
    const state = viewReducer(createFixture(), { type: 'select', selection: { kind: 'edge', id: 'e3' } });
    expect(viewReducer(state, { type: 'fill', value: FILLS[2] })).toBe(state);
  });
  it('rejects unknown colors and IDs', () => {
    const state = createFixture();
    expect(viewReducer(state, { type: 'select', selection: { kind: 'node', id: 'missing' } })).toBe(state);
    const selected = viewReducer(state, { type: 'select', selection: { kind: 'node', id: 'n1' } });
    expect(viewReducer(selected, { type: 'fill', value: 'url(javascript:alert(1))' })).toBe(selected);
  });
  it('normalizes project title and ignores empty names', () => {
    const state = createFixture();
    expect(viewReducer(state, { type: 'rename', title: '   ' })).toBe(state);
    expect(viewReducer(state, { type: 'rename', title: '  Bản mẫu  ' }).title).toBe('Bản mẫu');
    expect(viewReducer(state, { type: 'rename', title: 'x'.repeat(120) }).title).toHaveLength(100);
  });
});

describe('reference preview SVG geometry only', () => {
  it('fits the approved 1366 layout with the same reference formula', () => {
    const fit = fitPreview(createFixture().nodes, 761, 620);
    expect(fit.zoom).toBeCloseTo(480 / 611);
    expect(Math.round(fit.zoom * 100)).toBe(79);
  });
  it('returns finite values for empty/zero-size previews and clamps zoom', () => {
    expect(fitPreview([], 0, 0)).toEqual({ zoom: 1, x: 0, y: 0 });
    expect(fitPreview(createFixture().nodes, 761, 620, 100).zoom).toBe(1.8);
    expect(fitPreview(createFixture().nodes, 761, 620, 0).zoom).toBe(.45);
  });
  it('matches the reference edge path and midpoint for the No branch', () => {
    const state = createFixture();
    const geometry = edgeGeometry(state.edges[3], state.nodes);
    expect(geometry?.path).toBe('M470.0,353.0 L522.5,353.0 L522.5,352.5 L575.0,352.5');
    expect(geometry?.label).toEqual({ x: 522.5, y: 352.75 });
    expect(edgeGeometry(state.edges[0], [])).toBeNull();
  });
  it('uses the same four handles and text wrapping as the reference', () => {
    const node = createFixture().nodes[0];
    expect(portPoint(node, 'bottom')).toEqual({ x: 385, y: 111 });
    expect(previewTextLines('Tiếp nhận vật tư', 170)).toEqual(['Tiếp nhận vật tư']);
  });
});
