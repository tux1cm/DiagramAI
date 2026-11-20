export function linesFor(text: string, width: number, fontSize: number): string[] {
  const limit = Math.max(4, Math.floor(width / (fontSize * .6))), lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if ((line + ' ' + word).trim().length > limit && line) { lines.push(line); line = word; }
      else line = (line + ' ' + word).trim();
    }
    lines.push(line);
  }
  return lines;
}
