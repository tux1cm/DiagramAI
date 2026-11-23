// Commit-on-blur property fields are drafts too, not only canvas text editors.
// A remote refresh must not blur/drop their uncommitted values.
export function hasEditorDraft() {
  if (document.querySelector('.inline-node-editor,.inline-edge-editor,.project-name input')) return true;
  const active = document.activeElement;
  return (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && Boolean(active.closest('.prop-content')) && active.value !== active.defaultValue;
}
