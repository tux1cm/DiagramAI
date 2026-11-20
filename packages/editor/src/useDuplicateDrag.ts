import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { useReactFlow } from '@xyflow/react';
import { insertNodeOnEdge, moveDuplicateDrag, prepareDuplicateDrag, snapNode, type DiagramNode, type DiagramStore, type DuplicateDragPlan, type GraphSelection, type SnapGuide } from '@diagramai/diagram-core';
import { hitTestEdges, type EdgeHit } from './hit-testing';

interface Gesture {
  pointerId: number; screen: { x: number; y: number }; world: { x: number; y: number }; revision: number;
  plan: DuplicateDragPlan; primary: number; selection: GraphSelection; clickIds: string[]; moved: boolean;
}
export function useDuplicateDrag({ store, host, enabled, snap, onError, onCues }: {
  store: DiagramStore; host: RefObject<HTMLDivElement | null>; enabled: boolean; snap: boolean;
  onError: (message: string) => void; onCues: (hit: EdgeHit | null, guides: SnapGuide[]) => void;
}) {
  const flow = useReactFlow();
  const gesture = useRef<Gesture | null>(null);
  const [previews, setPreviews] = useState<DiagramNode[]>([]);
  const release = () => {
    const active = gesture.current; gesture.current = null;
    if (active && host.current?.hasPointerCapture(active.pointerId)) host.current.releasePointerCapture(active.pointerId);
    setPreviews([]); onCues(null, []);
  };
  useEffect(() => {
    const cancel = () => {
      const active = gesture.current;
      if (!active) return;
      release();
      if (store.getSnapshot().revision === active.revision) store.select(active.selection.nodeIds, active.selection.edgeIds, false);
    };
    const position = (event: PointerEvent, active: Gesture) => {
      const world = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      let dx = world.x - active.world.x, dy = world.y - active.world.y;
      let guides: SnapGuide[] = [];
      const primary = active.plan.nodes[active.primary];
      if (snap) {
        const result = snapNode({ ...primary, x: primary.x + dx, y: primary.y + dy }, store.getSnapshot().document.nodes, flow.getZoom());
        dx = result.x - primary.x; dy = result.y - primary.y; guides = result.guides;
      }
      const moved = moveDuplicateDrag(active.plan, dx, dy), node = moved.nodes[0];
      const hit = moved.nodes.length === 1 && host.current ? hitTestEdges(host.current, flow.flowToScreenPosition({ x: node.x + node.width / 2, y: node.y + node.height / 2 })) : null;
      return { ...moved, hit, guides };
    };
    const move = (event: PointerEvent) => {
      const active = gesture.current;
      if (!active || event.pointerId !== active.pointerId) return;
      if (store.getSnapshot().revision !== active.revision) { cancel(); return; }
      if (!active.moved && Math.hypot(event.clientX - active.screen.x, event.clientY - active.screen.y) < 4) return;
      if (!active.moved) store.select(active.plan.sourceIds, []);
      active.moved = true;
      const result = position(event, active);
      setPreviews(result.nodes); onCues(result.hit, result.guides);
    };
    const up = (event: PointerEvent) => {
      const active = gesture.current;
      if (!active || event.pointerId !== active.pointerId) return;
      const bounds = host.current?.getBoundingClientRect();
      if (!bounds || event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) { cancel(); return; }
      if (!active.moved) {
        // Preserve Ctrl-click multi-selection; duplication starts only after
        // real movement, not simply when the modifier is held on pointer-down.
        const ids = new Set(active.selection.nodeIds), remove = active.clickIds.every((id) => ids.has(id));
        for (const id of active.clickIds) { if (remove) ids.delete(id); else ids.add(id); }
        store.select([...ids], active.selection.edgeIds);
        release(); return;
      }
      try {
        const result = position(event, active);
        const commands = result.hit ? [insertNodeOnEdge(result.hit.edgeId, result.nodes[0], result.hit.point, result.hit.tangent)] : result.commands;
        const label = result.hit && store.getSnapshot().document.edges.find((edge) => edge.id === result.hit!.edgeId)?.label;
        if (store.execute(commands, result.hit ? 'Nhân đôi và chèn vào đường nối' : 'Ctrl+kéo nhân đôi', active.revision)) {
          store.select(active.plan.nodeIds, result.hit ? [] : active.plan.edgeIds);
          if (label) onError('Đã giữ nhãn điều kiện trên đoạn trước hình mới. Bạn có thể đổi nhãn ở Thuộc tính.');
        }
      } catch { onError('Không thể nhân đôi: sơ đồ đã thay đổi hoặc vượt giới hạn. Bản gốc được giữ nguyên.'); }
      release();
    };
    const key = (event: KeyboardEvent) => {
      if (!gesture.current || event.isComposing) return;
      if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z')) {
        event.preventDefault(); event.stopImmediatePropagation(); cancel();
      }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel); window.addEventListener('blur', cancel); window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel); window.removeEventListener('keydown', key, true);
    };
  });
  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled || event.button !== 0 || event.altKey || !(event.ctrlKey || event.metaKey) || !(event.target instanceof Element)) return;
    if (event.target.closest('input,textarea,select,[contenteditable=true],.react-flow__handle,.react-flow__resize-control')) return;
    const nodeId = event.target.closest<HTMLElement>('[data-node]')?.dataset.node;
    if (!nodeId) return;
    event.preventDefault(); event.stopPropagation();
    host.current?.focus({ preventScroll: true });
    const before = store.getSnapshot();
    if (before.interaction) return;
    const selection = before.selection;
    try {
      const current = store.getSnapshot(), clickIds = current.document.groups.find((group) => group.nodeIds.includes(nodeId))?.nodeIds ?? [nodeId];
      const plan = prepareDuplicateDrag(current.document, selection.nodeIds.includes(nodeId) ? selection.nodeIds : clickIds);
      gesture.current = { pointerId: event.pointerId, screen: { x: event.clientX, y: event.clientY }, world: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }), revision: current.revision, plan, primary: plan.sourceIds.indexOf(nodeId), selection, clickIds, moved: false };
      host.current?.setPointerCapture(event.pointerId);
    } catch { onError('Không thể nhân đôi: vượt giới hạn số hình hoặc cạnh.'); }
  };
  return { previews, start, active: () => gesture.current !== null };
}
