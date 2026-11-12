export type Kind = 'pin' | 'pen' | 'highlight' | 'rect' | 'ellipse' | 'arrow' | 'text'

export type Note = {
  id: string
  /** Missing in files saved by 0.1.0; those are pins. */
  kind?: Kind
  /** Pin point, arrow start, text position, or the top-left of the shape's box, in the SVG's
   *  own (viewBox) units like every other number here. */
  x: number
  y: number
  w?: number
  h?: number
  /** Arrow end. */
  x2?: number
  y2?: number
  /** Pen and highlight strokes: x,y pairs. */
  points?: number[]
  color?: string
  /** Stroke width, or font size for text. */
  width?: number
  /** The layer at the mark (`#Card > #Button`), and at an arrow's end. */
  target?: string
  target2?: string
  /** The note for the AI; for text marks, the text drawn on the design. */
  text: string
}

const BLOCK = /\s*<metadata id="ai-annotations">[\s\S]*?<\/metadata>/
const OPEN_TAG = /<svg\b[^>]*>/

export function readNotes(svg: string): Note[] {
  const block = svg.match(BLOCK)?.[0]
  if (!block) {
    return []
  }
  const json = block.slice(block.indexOf('<![CDATA[') + 9, block.lastIndexOf(']]>'))
  try {
    const notes = JSON.parse(json).notes
    return Array.isArray(notes) ? notes : []
  } catch {
    return []
  }
}

const ABOUT =
  "Notes for an AI agent from the SVG Annotate plugin, in this SVG's viewBox units: a pin or text marks x,y; rect, ellipse, pen and highlight mark the area x,y,w,h; an arrow runs from x,y to x2,y2. target and target2 name the layers there; text is the note."

export function writeNotes(svg: string, notes: Note[]): string {
  const without = svg.replace(BLOCK, '')
  if (notes.length === 0) {
    return without
  }
  // `]]>` inside a note would close the CDATA section early.
  const json = JSON.stringify({ about: ABOUT, notes }, null, 2).replace(/]]>/g, ']]\\u003e')
  const block = `\n<metadata id="ai-annotations"><![CDATA[\n${json}\n]]></metadata>`
  return without.replace(OPEN_TAG, (tag) => tag + block)
}

/** Keep the outside file, then apply my note edits and deletions on top, matched by id. */
export function mergeSvg(base: string, outside: string, mine: string): string {
  if (mine === base) {
    return outside
  }
  if (outside === base) {
    return mine
  }
  const baseNotes = new Map(readNotes(base).map((n) => [n.id, n]))
  const mineNotes = new Map(readNotes(mine).map((n) => [n.id, n]))
  const merged = readNotes(outside).filter((n) => !(baseNotes.has(n.id) && !mineNotes.has(n.id)))
  for (const note of mineNotes.values()) {
    const i = merged.findIndex((n) => n.id === note.id)
    const changed = JSON.stringify(note) !== JSON.stringify(baseNotes.get(note.id))
    if (i === -1 && !baseNotes.has(note.id)) {
      merged.push(note)
    } else if (i !== -1 && changed) {
      merged[i] = note
    }
  }
  return writeNotes(outside, merged)
}

/** Box of a mark's points, for pen and highlight strokes. */
export function boundsOf(points: number[]): { x: number; y: number; w: number; h: number } {
  const xs = points.filter((_, i) => i % 2 === 0)
  const ys = points.filter((_, i) => i % 2 === 1)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

const AREA: Partial<Record<Kind, string>> = {
  rect: 'rectangle',
  ellipse: 'ellipse',
  pen: 'drawing',
  highlight: 'highlight'
}

export function toPrompt(notes: Note[]): string {
  const at = (target: string | undefined, x: number, y: number) =>
    `${target ? `${target} ` : ''}x=${Math.round(x)} y=${Math.round(y)}`
  const lines = notes.map((n, i) => {
    const kind = n.kind ?? 'pin'
    const area = AREA[kind]
    const where = area
      ? `${area} ${at(n.target, n.x, n.y)} w=${Math.round(n.w ?? 0)} h=${Math.round(n.h ?? 0)}`
      : kind === 'arrow'
        ? `arrow from ${at(n.target, n.x, n.y)} to ${at(n.target2, n.x2 ?? n.x, n.y2 ?? n.y)}`
        : kind === 'text'
          ? `text on the design at ${at(n.target, n.x, n.y)}`
          : at(n.target, n.x, n.y)
    return `${i + 1}. (${where}) ${n.text.trim() || '(no note)'}`
  })
  return [
    'Here is a design with my notes on it. Use the notes to implement it.',
    '(Each note names the layer ids it points at and x,y in the design.)',
    '',
    ...lines
  ].join('\n')
}

/** Names Figma gives layers by itself (`Frame 758532675`, `Group 12_3`), which say nothing. */
const AUTO_NAME =
  /^#(Frame|Group|Rectangle|Vector|Ellipse|Line|Union|Subtract|Intersect|Exclude|Polygon|Star|Mask group|Image|Layer)[ _]?[\d_]*$/i

/** The innermost hand-named layer of a `#A > #B > #C` chain, for showing in the list. */
export function shortName(target: string | undefined): string {
  if (!target) return 'no layer'
  const parts = target.split(' > ')
  return [...parts].reverse().find((p) => !AUTO_NAME.test(p)) ?? parts[parts.length - 1]
}
