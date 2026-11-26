export function ArrowMarker({ id, color, size }: { id: string; color: string; size: number }) {
  return <marker id={id} viewBox="0 0 10 10" refX="10" refY="5" markerWidth={size} markerHeight={size} markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path d="M0 0 L10 5 L0 10 z" fill={color}/></marker>;
}
