import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector<HTMLElement>('a,button,input')?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const elements = panel.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)');
      if (!elements?.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); if (previous instanceof HTMLElement) previous.focus(); };
  }, [close]);
  return <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) close(); }}><div className="modal" ref={panel} role="dialog" aria-modal="true" aria-labelledby={id}><h3 id={id}>{title}</h3>{children}<div className="modal-foot"><button className="btn primary" onClick={close}>Đóng</button></div></div></div>;
}
