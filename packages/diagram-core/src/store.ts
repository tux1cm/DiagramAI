import { applyCommands, CommandSchema, type DiagramCommand } from './commands';
import { newId } from './registry';
import { parseDocument, type DiagramDocument } from './schema';
import { copyFragment, FragmentSchema, pasteFragment, type DiagramFragment } from './clipboard';

export interface GraphSelection { nodeIds: string[]; edgeIds: string[] }
export interface Transaction {
  operationId: string; label: string; baseRevision: number; commands: DiagramCommand[];
  before: DiagramDocument; after: DiagramDocument; timestamp: string;
}
export interface EditorSnapshot {
  document: DiagramDocument; selection: GraphSelection; past: Transaction[]; future: Transaction[];
  revision: number; dirty: boolean; interaction: { label: string; before: DiagramDocument; baseRevision: number } | null;
}
function freezeDocument(document: DiagramDocument): DiagramDocument {
  for (const node of document.nodes) { Object.freeze(node.style); Object.freeze(node); }
  for (const edge of document.edges) { Object.freeze(edge.style); Object.freeze(edge); }
  for (const group of document.groups) { Object.freeze(group.nodeIds); Object.freeze(group); }
  Object.freeze(document.nodes); Object.freeze(document.edges); Object.freeze(document.groups); Object.freeze(document.metadata);
  return Object.freeze(document);
}
function content(document: DiagramDocument) { return JSON.stringify([document.title, document.nodes, document.edges, document.groups]); }
function freezeSnapshot<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeSnapshot(child);
    Object.freeze(value);
  }
  return value;
}

export class DiagramStore {
  private state: EditorSnapshot;
  private listeners = new Set<() => void>();
  private initial: string;
  private interactionCommands: DiagramCommand[] = [];
  private clipboard: DiagramFragment | null = null;
  constructor(document: unknown) {
    const parsed = freezeDocument(parseDocument(document));
    this.initial = content(parsed);
    this.state = freezeSnapshot({ document: parsed, selection: { nodeIds: [], edgeIds: [] }, past: [], future: [], revision: 0, dirty: false, interaction: null });
  }
  getSnapshot = (): EditorSnapshot => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(next: EditorSnapshot) {
    const nodeIds = new Set(next.document.nodes.map((node) => node.id)), edgeIds = new Set(next.document.edges.map((edge) => edge.id));
    this.state = freezeSnapshot({ ...next, dirty: content(next.document) !== this.initial, selection: { nodeIds: next.selection.nodeIds.filter((id) => nodeIds.has(id)), edgeIds: next.selection.edgeIds.filter((id) => edgeIds.has(id)) } });
    for (const listener of this.listeners) listener();
  }
  select(nodeIds: string[], edgeIds: string[], expandGroups = true) {
    const nodes = new Set(nodeIds), edges = new Set(edgeIds);
    if (expandGroups) for (const group of this.state.document.groups) if (group.nodeIds.some((id) => nodes.has(id))) for (const id of group.nodeIds) nodes.add(id);
    const selection = { nodeIds: this.state.document.nodes.filter((node) => nodes.has(node.id)).map((node) => node.id), edgeIds: this.state.document.edges.filter((edge) => edges.has(edge.id)).map((edge) => edge.id) };
    if (JSON.stringify(selection) === JSON.stringify(this.state.selection)) return;
    this.publish({ ...this.state, selection });
  }
  selectAll() { this.select(this.state.document.nodes.map((node) => node.id), this.state.document.edges.map((edge) => edge.id)); }
  copySelection() {
    const fragment = copyFragment(this.state.document, this.state.selection);
    if (fragment) this.clipboard = structuredClone(fragment);
    return fragment;
  }
  hasClipboard() { return this.clipboard !== null; }
  setClipboard(input: unknown) { this.clipboard = FragmentSchema.parse(input); }
  paste() {
    if (!this.clipboard) return false;
    const result = pasteFragment(this.state.document, this.clipboard);
    const changed = this.execute(result.commands, 'Dán');
    if (changed) this.select(result.selection.nodeIds, result.selection.edgeIds);
    return changed;
  }
  duplicate() {
    const fragment = copyFragment(this.state.document, this.state.selection);
    if (!fragment) return false;
    const result = pasteFragment(this.state.document, fragment);
    const changed = this.execute(result.commands, 'Nhân đôi');
    if (changed) this.select(result.selection.nodeIds, result.selection.edgeIds);
    return changed;
  }
  execute(inputs: readonly unknown[], label = 'Chỉnh sửa', expectedRevision?: number): boolean {
    if (expectedRevision !== undefined && expectedRevision !== this.state.revision) throw new Error('Phiên bản tài liệu đã thay đổi');
    const after = applyCommands(this.state.document, inputs); // Validate before touching an active draft/history.
    if (this.state.interaction) this.finishInteraction();
    const before = this.state.document;
    if (content(before) === content(after)) return false;
    after.metadata.updatedAt = new Date().toISOString();
    const frozen = freezeDocument(after);
    const transaction: Transaction = { operationId: newId(), label, baseRevision: this.state.revision, commands: inputs.map((input) => CommandSchema.parse(input)), before, after: frozen, timestamp: after.metadata.updatedAt };
    this.publish({ ...this.state, document: frozen, past: [...this.state.past.slice(-199), transaction], future: [], revision: this.state.revision + 1 });
    return true;
  }
  beginInteraction(label: string) {
    if (this.state.interaction) this.finishInteraction();
    this.interactionCommands = [];
    this.publish({ ...this.state, interaction: { label, before: this.state.document, baseRevision: this.state.revision } });
  }
  updateInteraction(inputs: readonly unknown[]) {
    if (!this.state.interaction) throw new Error('Chưa bắt đầu interaction');
    const commands = inputs.map((input) => CommandSchema.parse(input));
    if (commands.some((command) => command.type !== 'geometry')) throw new Error('Interaction chỉ nhận thay đổi vị trí/kích thước');
    const after = applyCommands(this.state.document, inputs);
    if (content(after) === content(this.state.document)) return;
    // Only geometry is admitted here; text/style/history use execute().
    this.interactionCommands = commands; // Final geometry is serialized on commit below.
    this.publish({ ...this.state, document: freezeDocument(after), revision: this.state.revision + 1 });
  }
  finishInteraction(inputs: readonly unknown[] = [], label?: string) {
    const interaction = this.state.interaction;
    if (!interaction) return;
    // Validate the final graph edit against the live draft before publishing.
    // A drag + edge split is one transaction whose before is the pointer-down graph.
    const after = applyCommands(this.state.document, inputs);
    if (content(interaction.before) === content(after)) { this.publish({ ...this.state, interaction: null }); return; }
    after.metadata.updatedAt = new Date().toISOString();
    const frozen = freezeDocument(after);
    // Record all changed geometry, including group members, rather than just the last pointer event.
    const values = this.state.document.nodes.filter((node) => {
      const before = interaction.before.nodes.find((item) => item.id === node.id);
      return before && (before.x !== node.x || before.y !== node.y || before.width !== node.width || before.height !== node.height);
    }).map(({ id, x, y, width, height }) => ({ id, x, y, width, height }));
    const commands: DiagramCommand[] = [...(values.length ? [{ type: 'geometry' as const, values }] : this.interactionCommands), ...inputs.map((input) => CommandSchema.parse(input))];
    const transaction: Transaction = { operationId: newId(), label: label ?? interaction.label, baseRevision: interaction.baseRevision, commands, before: interaction.before, after: frozen, timestamp: after.metadata.updatedAt };
    this.interactionCommands = [];
    this.publish({ ...this.state, document: frozen, past: [...this.state.past.slice(-199), transaction], future: [], interaction: null, revision: this.state.revision + 1 });
  }
  cancelInteraction() {
    if (!this.state.interaction) return;
    const before = this.state.interaction.before;
    this.interactionCommands = [];
    this.publish({ ...this.state, document: before, interaction: null, revision: this.state.revision + 1 });
  }
  undo() {
    if (this.state.interaction) { this.cancelInteraction(); return; }
    const transaction = this.state.past.at(-1);
    if (!transaction) return;
    this.publish({ ...this.state, document: transaction.before, past: this.state.past.slice(0, -1), future: [...this.state.future, transaction], revision: this.state.revision + 1 });
  }
  redo() {
    if (this.state.interaction) return;
    const transaction = this.state.future.at(-1);
    if (!transaction) return;
    this.publish({ ...this.state, document: transaction.after, past: [...this.state.past, transaction], future: this.state.future.slice(0, -1), revision: this.state.revision + 1 });
  }
}
