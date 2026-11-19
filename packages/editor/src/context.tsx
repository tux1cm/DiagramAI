import { createContext, useContext, useSyncExternalStore } from 'react';
import type { DiagramCommand, DiagramStore } from '@diagramai/diagram-core';

export const EngineContext = createContext<{ store: DiagramStore; onError: (message: string) => void; insertionEdgeId?: string; routingExcludedNodeIds?: string[] } | null>(null);
export function useEngine() {
  const context = useContext(EngineContext);
  if (!context) throw new Error('Missing editor engine context');
  return context;
}
export function useDiagram(store: DiagramStore) { return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot); }
export function executeSafely(store: DiagramStore, commands: DiagramCommand[], label: string, onError: (message: string) => void) {
  try { return store.execute(commands, label); }
  catch { onError('Thay đổi không hợp lệ. Kiểm tra kích thước, màu sắc và các đầu nối.'); return false; }
}
