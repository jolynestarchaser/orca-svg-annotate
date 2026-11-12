import { boundsOf, type Kind, type Note, readNotes, shortName, toPrompt, writeNotes } from './notes'
import { start } from './sync'

type Tool = 'select' | 'pan' | 'eraser' | Kind
const ICONS: Record<string, string> = {
  select: '<path d="M5 3l6 17 2.4-7.1L20 10.6z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  pen: '<path d="M16.5 3.5l4 4L8 20H4v-4z"/>',
  highlight: '<path d="M9 11l-6 6v3h9l3-3"/><path d="M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  rect: '<rect x="3" y="5" width="18" height="14" rx="2"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
  arrow: '<path d="M5 19L19 5"/><path d="M9 5h10v10"/>',
  text: '<path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
  eraser: '<path d="M7 21h10"/><path d="M5.5 14.5l9-9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L13 17H8z"/>',
  pan: '<path d="M12 2v20M2 12h20"/><path d="M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-4"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h4"/>',
  clear: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  save: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>'
}
const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`

const TOOLS: [Tool, string, string][] = [
  ['select', 'Select', 'V'],
  ['pan', 'Pan', 'H'],
  ['pin', 'Pin', 'I'],
  ['pen', 'Pen', 'P'],
  ['highlight', 'Highlight', 'L'],
  ['rect', 'Rectangle', 'R'],
  ['ellipse', 'Ellipse', 'O'],
  ['arrow', 'Arrow', 'A'],
  ['text', 'Text', 'T'],
  ['eraser', 'Eraser', 'E']
]
const COLORS = ['#e5484d', '#f5a524', '#30a46c', '#3e63dd', '#8e4ec6', '#111111', '#ffffff']
const WIDTHS = [2, 4, 6, 8]
const FONT_SIZES = [14, 18, 24, 32]
const SVG_NS = 'http://www.w3.org/2000/svg'
const SELECTION = 'var(--orca-primary, #3e63dd)'
const line = 'color-mix(in srgb, var(--orca-foreground) 16%, transparent)'
const soft = 'color-mix(in srgb, var(--orca-foreground) 7%, transparent)'
const active = 'color-mix(in srgb, var(--orca-primary, #3e63dd) 28%, transparent)'
const raised = 'color-mix(in srgb, var(--orca-foreground) 4%, var(--orca-background))'

document.head.insertAdjacentHTML(
  'beforeend',
  `<style>
  html, body { height: 100%; margin: 0; overflow: hidden }
  [hidden] { display: none !important }
  body { font: 13px system-ui, sans-serif; color: var(--orca-foreground); background: var(--orca-background) }
  button, textarea { font: inherit; color: inherit; background: transparent; border: 1px solid transparent; border-radius: 6px }
  button { cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 6px 8px; white-space: nowrap }
  button:hover:not(:disabled) { background: ${soft} }
  button:focus-visible, textarea:focus-visible { outline: 2px solid var(--orca-primary, #3e63dd); outline-offset: 1px }
  button:disabled { opacity: .4; cursor: default }
  button[aria-pressed="true"] { background: ${active} }
  textarea { border-color: ${line}; padding: 6px 8px; width: 100%; box-sizing: border-box; resize: vertical }
  .bar { display: flex; flex-wrap: wrap; gap: 2px; align-items: center; padding: 6px 8px; border-bottom: 1px solid ${line} }
  .sep { width: 1px; height: 20px; background: ${line}; margin: 0 6px }
  .grow { flex: 1 }
  .primary { border-color: ${line}; background: ${soft} }
  .dot { width: 14px; height: 14px; border-radius: 50%; border: 1px solid ${line} }
  .pop { position: absolute; top: calc(100% + 6px); left: 0; z-index: 3; padding: 10px; display: grid; gap: 10px;
    background: ${raised}; border: 1px solid ${line}; border-radius: 8px; box-shadow: 0 8px 24px rgb(0 0 0 / .25) }
  .pop .row { display: flex; gap: 4px; align-items: center }
  .pop .caption { font-size: 11px; opacity: .7; min-width: 44px }
  .swatch { width: 22px; height: 22px; padding: 0; border-radius: 50%; border: 1px solid ${line} }
  .swatch[aria-pressed="true"] { outline: 2px solid var(--orca-foreground); outline-offset: 1px }
  .float { position: absolute; z-index: 2; display: flex; align-items: center; gap: 2px; padding: 3px;
    background: ${raised}; border: 1px solid ${line}; border-radius: 8px; box-shadow: 0 4px 14px rgb(0 0 0 / .2) }
  #zoom-reset { min-width: 52px; justify-content: center }
  #bubble { position: fixed; z-index: 4; width: 260px; resize: none; background: ${raised}; box-shadow: 0 8px 24px rgb(0 0 0 / .25) }
  aside { width: 300px; display: flex; flex-direction: column; border-left: 1px solid ${line}; min-height: 0 }
  aside[hidden] { display: none }
  #list { flex: 1 1 auto; min-height: 0; overflow: auto; margin: 0; padding: 8px 12px 8px 32px }
  li { margin-bottom: 8px; padding: 6px; border-radius: 6px }
  li.selected { background: ${active} }
  .target { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 12px; opacity: .8; margin-bottom: 4px }
  .target span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .target button { padding: 2px 6px }
  details { border-top: 1px solid ${line}; padding: 8px 12px; flex: none }
  summary { cursor: pointer; opacity: .8 }
  details textarea { margin-top: 8px; height: 180px }
  .empty { opacity: .6; padding: 4px 0 0; margin-left: -20px; line-height: 1.5 }
</style>`
)

const toolButton = ([id, name, key]: [Tool, string, string]) =>
  `<button data-tool="${id}" title="${name} (${key})" aria-label="${name}">${icon(id)}</button>`
document.body.innerHTML = `
<div style="display:flex;flex-direction:column;height:100%">
  <div class="bar" role="toolbar" aria-label="Annotation tools">
    ${TOOLS.slice(0, 2).map(toolButton).join('')}
    <span class="sep"></span>
    ${TOOLS.slice(2).map(toolButton).join('')}
    <span class="sep"></span>
    <div style="position:relative">
      <button id="style-btn" title="Color and width" aria-haspopup="true" aria-expanded="false">
        <span id="style-dot" class="dot"></span><span id="style-label"></span>
      </button>
      <div id="style-pop" class="pop" hidden>
        <div class="row" role="group" aria-label="Color">${COLORS.map((c) => `<button class="swatch" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}</div>
        <div class="row" role="group" aria-label="Stroke width"><span class="caption">Width</span>${WIDTHS.map((w) => `<button data-width="${w}">${w} px</button>`).join('')}</div>
        <div class="row" role="group" aria-label="Font size"><span class="caption">Text</span>${FONT_SIZES.map((f) => `<button data-font="${f}">${f}</button>`).join('')}</div>
      </div>
    </div>
    <span class="sep"></span>
    <button id="undo" title="Undo (Ctrl+Z)" aria-label="Undo">${icon('undo')}</button>
    <button id="redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">${icon('redo')}</button>
    <button id="clear" title="Clear all marks" aria-label="Clear all">${icon('clear')}</button>
    <span class="grow"></span>
    <button id="copy" class="primary" title="Copy the prompt with every note">${icon('copy')}<span>Copy for AI</span></button>
    <button id="save-png" title="Save the design with its marks as PNG">${icon('save')}<span>PNG</span></button>
    <button id="toggle-side" title="Notes panel (\\)" aria-label="Notes panel" aria-pressed="true">${icon('sidebar')}</button>
  </div>
  <div style="flex:1;display:flex;min-height:0">
    <div style="position:relative;flex:1;min-width:0;display:flex">
      <div id="stage" style="flex:1;overflow:auto;outline:none;user-select:none" tabindex="-1">
        <div id="world" style="padding:24px;width:max-content"></div>
      </div>
      <div class="float" style="right:12px;bottom:12px">
        <button id="zoom-out" title="Zoom out (-)" aria-label="Zoom out">−</button>
        <button id="zoom-reset" title="Actual size (1)">100%</button>
        <button id="zoom-in" title="Zoom in (+)" aria-label="Zoom in">+</button>
        <button id="fit" title="Fit to view (0)">Fit</button>
      </div>
      <div id="toast" class="float" style="left:12px;bottom:12px;padding:3px 3px 3px 12px" hidden>
        <span id="toast-text"></span><button id="toast-action"></button>
      </div>
    </div>
    <aside id="side" aria-label="Notes">
      <ol id="list"></ol>
      <details id="preview"><summary>Preview prompt</summary>
        <textarea id="prompt" readonly aria-label="Prompt for AI"></textarea>
      </details>
    </aside>
  </div>
</div>
<textarea id="bubble" rows="3" hidden aria-label="Note"></textarea>`

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const stage = $<HTMLDivElement>('stage')
const world = $<HTMLDivElement>('world')
const list = $<HTMLOListElement>('list')
const side = $<HTMLElement>('side')
const copy = $<HTMLButtonElement>('copy')
const promptBox = $<HTMLTextAreaElement>('prompt')
const zoomLabel = $<HTMLButtonElement>('zoom-reset')
const bubble = $<HTMLTextAreaElement>('bubble')
const stylePop = $<HTMLDivElement>('style-pop')
const styleBtn = $<HTMLButtonElement>('style-btn')
const toast = $<HTMLDivElement>('toast')
const toolButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-tool]')]

const doc = await start()
let svgText = doc.value
let notes: Note[] = readNotes(svgText)
let svg: SVGSVGElement | null = null
let layer: SVGGElement | null = null
let tool: Tool = doc.readOnly ? 'select' : 'pin'
let color = COLORS[0]
let strokePx = 4
let fontPx = 18
let selected: string | null = null
let zoom = 1
let baseW = 1
let baseH = 1
let spaceDown = false

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  return el
}

/** Screen pixels per SVG unit at the current zoom. */
const scale = () => svg?.getScreenCTM()?.a || 1
const toSvg = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(svg!.getScreenCTM()!.inverse())
const toClient = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(svg!.getScreenCTM()!)
const round = (v: number) => Math.round(v * 10) / 10

// ---- design and zoom

function renderDesign() {
  const keepZoom = svg ? zoom : null
  const root = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement
  if (root.nodeName !== 'svg') {
    svg = null
    world.textContent = 'This file is not a valid SVG.'
    return
  }
  root.querySelectorAll('script').forEach((el) => el.remove())
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith('on')) el.removeAttribute(attr.name)
    }
  }
  svg = document.importNode(root, true) as unknown as SVGSVGElement
  if (!svg.viewBox.baseVal?.width) {
    const w = parseFloat(svg.getAttribute('width') ?? '') || 800
    const h = parseFloat(svg.getAttribute('height') ?? '') || 600
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  }
  baseW = svg.viewBox.baseVal.width
  baseH = svg.viewBox.baseVal.height
  svg.style.display = 'block'
  layer = document.createElementNS(SVG_NS, 'g')
  svg.append(layer)
  world.replaceChildren(svg)
  if (keepZoom) setZoom(keepZoom)
  else fit()
  updateLayerHits()
}

function setZoom(next: number, anchorX?: number, anchorY?: number) {
  if (!svg) return
  const box = stage.getBoundingClientRect()
  const ax = anchorX ?? box.left + box.width / 2
  const ay = anchorY ?? box.top + box.height / 2
  const before = toSvg(ax, ay)
  zoom = Math.min(16, Math.max(0.02, next))
  svg.style.width = `${baseW * zoom}px`
  svg.style.height = `${baseH * zoom}px`
  const after = toClient(before.x, before.y)
  stage.scrollLeft += after.x - ax
  stage.scrollTop += after.y - ay
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`
  drawAnnotations()
}

function fit() {
  setZoom(Math.min((stage.clientWidth - 48) / baseW, (stage.clientHeight - 48) / baseH))
  stage.scrollTo(0, 0)
}

// ---- drawing marks

const pathOf = (p: number[]) => p.reduce((d, v, i) => d + (i % 2 ? ` ${v}` : `${i ? ' L' : 'M'}${v}`), '')

function arrowShape(x1: number, y1: number, x2: number, y2: number, stroke: string, width: number): SVGElement {
  const g = svgEl('g', {})
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const head = Math.max(14 / scale(), width * 4)
  const wing = (a: number) => `${x2 - head * Math.cos(angle + a)},${y2 - head * Math.sin(angle + a)}`
  g.append(
    svgEl('line', { x1, y1, x2, y2, stroke, 'stroke-width': width, 'stroke-linecap': 'round' }),
    svgEl('polygon', { points: `${x2},${y2} ${wing(0.45)} ${wing(-0.45)}`, fill: stroke })
  )
  return g
}

/** The visible mark, without its number badge or hit area. */
function markShape(n: Note): SVGElement | null {
  const stroke = n.color ?? COLORS[0]
  const width = n.width ?? 2 / scale()
  const outline = { stroke, 'stroke-width': width, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }
  switch (n.kind) {
    case 'rect':
      return svgEl('rect', { x: n.x, y: n.y, width: n.w ?? 0, height: n.h ?? 0, ...outline })
    case 'ellipse':
      return svgEl('ellipse', {
        cx: n.x + (n.w ?? 0) / 2, cy: n.y + (n.h ?? 0) / 2, rx: (n.w ?? 0) / 2, ry: (n.h ?? 0) / 2, ...outline
      })
    case 'pen':
      return svgEl('path', { d: pathOf(n.points ?? []), ...outline })
    case 'highlight':
      return svgEl('path', { d: pathOf(n.points ?? []), ...outline, 'stroke-opacity': 0.35, 'stroke-linecap': 'butt' })
    case 'arrow':
      return arrowShape(n.x, n.y, n.x2 ?? n.x, n.y2 ?? n.y, stroke, width)
    case 'text':
      return Object.assign(
        svgEl('text', {
          x: n.x, y: n.y, fill: stroke, 'font-size': n.width ?? 18, 'font-family': 'system-ui,sans-serif',
          'dominant-baseline': 'hanging', 'pointer-events': 'bounding-box', 'paint-order': 'stroke',
          stroke: stroke === '#ffffff' ? '#111111' : '#ffffff', 'stroke-width': (n.width ?? 18) / 8
        }),
        { textContent: n.text || ' ' }
      )
    default:
      return null
  }
}

function anchorOf(n: Note): [number, number] {
  if ((n.kind === 'pen' || n.kind === 'highlight') && n.points?.length) return [n.points[0], n.points[1]]
  return [n.x, n.y]
}

function drawAnnotations(draft?: SVGElement, withSelection = true) {
  if (!svg || !layer) return
  const s = scale()
  const shapes = notes.map((n, i) => {
    const g = svgEl('g', { 'data-ann': n.id })
    const mark = markShape(n)
    if (mark) {
      // A wide transparent copy so thin strokes are easy to select and erase.
      const hit = mark.cloneNode(true) as SVGElement
      hit.setAttribute('stroke', 'transparent')
      hit.setAttribute('stroke-width', String(Math.max(n.width ?? 0, 12 / s)))
      hit.setAttribute('fill', n.kind === 'text' ? 'transparent' : 'none')
      hit.querySelectorAll('*').forEach((c) => {
        c.setAttribute('stroke', 'transparent')
        c.setAttribute('fill', 'transparent')
      })
      g.append(mark, hit)
    }
    const r = (n.kind ?? 'pin') === 'pin' ? 11 / s : 8 / s
    const [ax, ay] = anchorOf(n)
    const bx = n.kind === 'text' ? ax - r * 1.4 : ax
    const by = n.kind === 'text' ? ay + r : ay
    g.append(
      svgEl('circle', { cx: bx, cy: by, r, fill: n.color ?? COLORS[0], stroke: '#fff', 'stroke-width': r / 6 }),
      Object.assign(
        svgEl('text', {
          x: bx, y: by, fill: n.color === '#ffffff' ? '#111' : '#fff', 'font-size': r * 1.1,
          'font-family': 'system-ui,sans-serif', 'text-anchor': 'middle', 'dominant-baseline': 'central'
        }),
        { textContent: String(i + 1) }
      )
    )
    return g
  })
  layer.replaceChildren(...shapes, ...(draft ? [draft] : []))
  const chosen = withSelection && selected && layer.querySelector<SVGGElement>(`[data-ann="${selected}"]`)
  if (chosen) {
    const b = chosen.getBBox()
    const pad = 4 / s
    layer.append(
      svgEl('rect', {
        x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2, fill: 'none',
        style: `stroke:${SELECTION}`, 'stroke-width': 1.5 / s, 'stroke-dasharray': `${5 / s}`, 'pointer-events': 'none'
      })
    )
  }
}

function label(n: Note): { short: string; full: string } {
  const name = TOOLS.find(([id]) => id === (n.kind ?? 'pin'))?.[1] ?? 'Pin'
  if (n.kind === 'arrow') {
    return {
      short: `${name} · ${shortName(n.target)} → ${shortName(n.target2)}`,
      full: `${n.target ?? 'no layer'} → ${n.target2 ?? 'no layer'}`
    }
  }
  return { short: `${name} · ${shortName(n.target)}`, full: n.target ?? 'no layer' }
}

// ---- notes list

function renderNotes() {
  if (notes.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent =
      'Draw on the design, then type what the AI should do there. Select a mark and press Enter to edit its note.'
    list.replaceChildren(empty)
  } else {
    list.replaceChildren(...notes.map(noteItem))
  }
  drawAnnotations()
  promptBox.value = toPrompt(notes)
}

function noteItem(note: Note): HTMLLIElement {
  const li = document.createElement('li')
  li.dataset.note = note.id
  li.classList.toggle('selected', note.id === selected)
  const head = document.createElement('div')
  head.className = 'target'
  const name = document.createElement('span')
  const { short, full } = label(note)
  name.textContent = short
  name.title = full
  const remove = document.createElement('button')
  remove.innerHTML = '&times;'
  remove.setAttribute('aria-label', 'Delete mark')
  remove.disabled = doc.readOnly
  remove.onclick = () => removeNotes([note.id])
  head.append(name, remove)
  const text = document.createElement('textarea')
  text.rows = 2
  text.value = note.text
  text.readOnly = doc.readOnly
  text.placeholder = note.kind === 'text' ? 'Text on the design' : 'What should the AI do here?'
  text.setAttribute('aria-label', `Note ${short}`)
  let before: string | null = null
  text.onfocus = () => {
    before = JSON.stringify(notes)
    select(note.id)
    reveal(note)
  }
  const fitHeight = () => {
    text.style.height = 'auto'
    text.style.height = `${text.scrollHeight + 2}px`
  }
  text.oninput = () => {
    if (before) remember(before)
    before = null
    note.text = text.value
    fitHeight()
    save()
    if (note.kind === 'text') drawAnnotations()
  }
  requestAnimationFrame(fitHeight)
  li.append(head, text)
  return li
}

function select(id: string | null) {
  selected = id
  for (const li of list.children) li.classList.toggle('selected', (li as HTMLElement).dataset.note === id)
  drawAnnotations()
}

function reveal(n: Note) {
  if (!svg) return
  const [x, y] = anchorOf(n)
  const p = toClient(x, y)
  const box = stage.getBoundingClientRect()
  if (p.x < box.left || p.x > box.right || p.y < box.top || p.y > box.bottom) {
    stage.scrollLeft += p.x - (box.left + box.width / 2)
    stage.scrollTop += p.y - (box.top + box.height / 2)
  }
}

function addNote(fields: Omit<Note, 'id'>): Note {
  remember(JSON.stringify(notes))
  const note: Note = { id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, ...fields }
  notes.push(note)
  selected = note.id
  save()
  renderNotes()
  list.querySelector(`[data-note="${note.id}"]`)?.scrollIntoView({ block: 'nearest' })
  return note
}

/** Right after a mark is drawn, ask for its note beside it; Enter keeps it, Esc skips. */
function askNote(note: Note) {
  const [x, y] = anchorOf(note)
  const p = toClient(x, y)
  openBubble(p.x, p.y, note.text, 'What should the AI do here? (Enter)', (value) => {
    if (value && value !== note.text) {
      remember(JSON.stringify(notes))
      note.text = value
      save()
      renderNotes()
    }
  })
}

function removeNotes(ids: string[], snapshot = true) {
  if (snapshot) remember(JSON.stringify(notes))
  notes = notes.filter((n) => !ids.includes(n.id))
  if (selected && ids.includes(selected)) selected = null
  save()
  renderNotes()
}

function save() {
  svgText = writeNotes(svgText, notes)
  doc.change(svgText)
  promptBox.value = toPrompt(notes)
}

// ---- undo

const undoStack: string[] = []
const redoStack: string[] = []

function remember(snapshot: string) {
  undoStack.push(snapshot)
  if (undoStack.length > 200) undoStack.shift()
  redoStack.length = 0
}

function restore(from: string[], to: string[]) {
  const snapshot = from.pop()
  if (!snapshot || doc.readOnly) return
  to.push(JSON.stringify(notes))
  notes = JSON.parse(snapshot)
  if (!notes.some((n) => n.id === selected)) selected = null
  save()
  renderNotes()
}

// ---- layers under a point

/** The smallest layer whose box holds the point: clicks pass through unfilled shapes such as
 *  an outlined input, so the clicked element alone would name the card behind it. */
function layerAt(x: number, y: number): Element | null {
  let best: Element | null = null
  let bestArea = Infinity
  for (const el of svg?.querySelectorAll('[id]') ?? []) {
    if (layer?.contains(el)) continue
    const r = el.getBoundingClientRect()
    const area = r.width * r.height
    if (area > 0 && area < bestArea && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      best = el
      bestArea = area
    }
  }
  return best
}

/** Up to three layer ids from the layer at a design point outward, e.g. `#Card > #Button`. */
function describe(x: number, y: number): string | undefined {
  const c = toClient(x, y)
  const ids: string[] = []
  for (let e: Element | null = layerAt(c.x, c.y); e && e !== svg; e = e.parentElement) {
    if (e.id) ids.unshift(`#${e.id}`)
  }
  if (ids.length) return ids.slice(-3).join(' > ')
  const hit = document.elementsFromPoint(c.x, c.y).find((el) => !layer?.contains(el))
  const text = hit?.closest('text')?.textContent?.trim()
  return text ? `text "${text.slice(0, 40)}"` : undefined
}

function retarget(n: Note) {
  if (n.kind === 'arrow') {
    n.target = describe(n.x, n.y)
    n.target2 = describe(n.x2 ?? n.x, n.y2 ?? n.y)
  } else if (n.w !== undefined && n.h !== undefined) {
    n.target = describe(n.x + n.w / 2, n.y + n.h / 2)
  } else {
    n.target = describe(n.x, n.y)
  }
}

// ---- tools and style

function setTool(next: Tool) {
  if (doc.readOnly && next !== 'select' && next !== 'pan') return
  tool = next
  for (const b of toolButtons) b.setAttribute('aria-pressed', String(b.dataset.tool === tool))
  updateCursor()
  updateLayerHits()
  updateStyle()
}

/** Marks catch the pointer only while selecting or erasing, so drawing over a mark still draws. */
function updateLayerHits() {
  if (layer) layer.style.pointerEvents = tool === 'select' || tool === 'eraser' ? 'auto' : 'none'
}

function updateCursor() {
  stage.style.cursor =
    drag?.kind === 'pan' ? 'grabbing'
      : spaceDown || tool === 'pan' ? 'grab'
        : tool === 'select' ? 'default'
          : tool === 'text' ? 'text'
            : tool === 'eraser' ? 'cell' : 'crosshair'
}

function updateStyle() {
  $('style-dot').style.background = color
  $('style-label').textContent = tool === 'text' ? `${fontPx} px` : `${strokePx} px`
  for (const b of stylePop.querySelectorAll<HTMLButtonElement>('[data-color]')) b.setAttribute('aria-pressed', String(b.dataset.color === color))
  for (const b of stylePop.querySelectorAll<HTMLButtonElement>('[data-width]')) b.setAttribute('aria-pressed', String(Number(b.dataset.width) === strokePx))
  for (const b of stylePop.querySelectorAll<HTMLButtonElement>('[data-font]')) b.setAttribute('aria-pressed', String(Number(b.dataset.font) === fontPx))
}

function toggleStylePop(open = stylePop.hidden) {
  stylePop.hidden = !open
  styleBtn.setAttribute('aria-expanded', String(open))
}

function strokeWidth(forTool: Tool): number {
  return round((forTool === 'highlight' ? strokePx * 4 : strokePx) / scale())
}

// ---- pointer input

type Drag =
  | { kind: 'pan'; x: number; y: number; left: number; top: number }
  | { kind: 'shape'; tool: 'rect' | 'ellipse' | 'arrow'; start: DOMPoint; x: number; y: number }
  | { kind: 'stroke'; tool: 'pen' | 'highlight'; points: number[]; x: number; y: number }
  | { kind: 'move'; note: Note; start: DOMPoint; orig: Note; before: string; moved: boolean }
  | { kind: 'erase'; before: string; erased: Set<string> }
let drag: Drag | null = null

function eraseAt(x: number, y: number) {
  if (drag?.kind !== 'erase') return
  for (const el of document.elementsFromPoint(x, y)) {
    const id = el.closest<SVGGElement>('[data-ann]')?.dataset.ann
    if (id && !drag.erased.has(id)) {
      drag.erased.add(id)
      notes = notes.filter((n) => n.id !== id)
    }
  }
  drawAnnotations()
}

stage.addEventListener('pointerdown', (e) => {
  if (!svg || e.button === 2 || !bubble.hidden) return
  toggleStylePop(false)
  stage.focus({ preventScroll: true })
  const target = e.target as Element
  if (tool === 'pan' || spaceDown || e.button === 1) {
    drag = { kind: 'pan', x: e.clientX, y: e.clientY, left: stage.scrollLeft, top: stage.scrollTop }
    stage.setPointerCapture(e.pointerId)
    updateCursor()
    e.preventDefault()
    return
  }
  if (tool === 'eraser') {
    drag = { kind: 'erase', before: JSON.stringify(notes), erased: new Set() }
    stage.setPointerCapture(e.pointerId)
    eraseAt(e.clientX, e.clientY)
    return
  }
  if (tool === 'select') {
    const id = target.closest<SVGGElement>('[data-ann]')?.dataset.ann
    const note = id ? notes.find((n) => n.id === id) : undefined
    select(note?.id ?? null)
    if (note && !doc.readOnly) {
      drag = {
        kind: 'move', note, start: toSvg(e.clientX, e.clientY),
        orig: structuredClone(note), before: JSON.stringify(notes), moved: false
      }
      stage.setPointerCapture(e.pointerId)
    }
    return
  }
  if (!svg.contains(target) || doc.readOnly) return
  const p = toSvg(e.clientX, e.clientY)
  if (tool === 'pin') {
    askNote(addNote({ kind: 'pin', x: round(p.x), y: round(p.y), color, target: describe(p.x, p.y), text: '' }))
  } else if (tool === 'text') {
    openBubble(e.clientX, e.clientY, '', 'Text to put on the design (Enter)', (value) => {
      if (!value) return
      addNote({
        kind: 'text', x: round(p.x), y: round(p.y), color, width: round(fontPx / scale()),
        target: describe(p.x, p.y), text: value
      })
    })
  } else if (tool === 'pen' || tool === 'highlight') {
    drag = { kind: 'stroke', tool, points: [round(p.x), round(p.y)], x: e.clientX, y: e.clientY }
    stage.setPointerCapture(e.pointerId)
  } else {
    drag = { kind: 'shape', tool, start: p, x: e.clientX, y: e.clientY }
    stage.setPointerCapture(e.pointerId)
  }
})

stage.addEventListener('pointermove', (e) => {
  if (!drag || !svg) return
  if (drag.kind === 'pan') {
    stage.scrollLeft = drag.left - (e.clientX - drag.x)
    stage.scrollTop = drag.top - (e.clientY - drag.y)
    return
  }
  if (drag.kind === 'erase') {
    eraseAt(e.clientX, e.clientY)
    return
  }
  const p = toSvg(e.clientX, e.clientY)
  if (drag.kind === 'move') {
    const dx = p.x - drag.start.x
    const dy = p.y - drag.start.y
    const { note, orig } = drag
    note.x = round(orig.x + dx)
    note.y = round(orig.y + dy)
    if (orig.x2 !== undefined) note.x2 = round(orig.x2 + dx)
    if (orig.y2 !== undefined) note.y2 = round(orig.y2 + dy)
    if (orig.points) note.points = orig.points.map((v, i) => round(v + (i % 2 ? dy : dx)))
    drag.moved = true
    drawAnnotations()
    return
  }
  const draftNote: Note = { id: 'draft', x: 0, y: 0, color, width: strokeWidth(drag.tool), text: '' }
  if (drag.kind === 'stroke') {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 2) return
    drag.x = e.clientX
    drag.y = e.clientY
    drag.points.push(round(p.x), round(p.y))
    Object.assign(draftNote, { kind: drag.tool, points: drag.points })
  } else {
    const s = drag.start
    Object.assign(
      draftNote,
      drag.tool === 'arrow'
        ? { kind: 'arrow', x: s.x, y: s.y, x2: p.x, y2: p.y }
        : { kind: drag.tool, x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) }
    )
  }
  const shape = markShape(draftNote)
  shape?.setAttribute('pointer-events', 'none')
  drawAnnotations(shape ?? undefined)
})

stage.addEventListener('pointerup', (e) => {
  const d = drag
  drag = null
  updateCursor()
  if (!d || !svg) return
  if (d.kind === 'move') {
    if (d.moved) {
      remember(d.before)
      if (d.note.points) Object.assign(d.note, bounded(d.note.points))
      retarget(d.note)
      save()
      renderNotes()
    }
    return
  }
  if (d.kind === 'erase') {
    if (d.erased.size) {
      remember(d.before)
      removeNotes([...d.erased], false)
    }
    return
  }
  if (d.kind === 'stroke') {
    drawAnnotations()
    if (d.points.length < 4) return
    const box = bounded(d.points)
    askNote(
      addNote({
        kind: d.tool, ...box, points: d.points, color, width: strokeWidth(d.tool),
        target: describe(box.x + box.w / 2, box.y + box.h / 2), text: ''
      })
    )
    return
  }
  if (d.kind !== 'shape') return
  drawAnnotations()
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return
  const p = toSvg(e.clientX, e.clientY)
  const s = d.start
  const width = strokeWidth(d.tool)
  if (d.tool === 'arrow') {
    askNote(
      addNote({
        kind: 'arrow', x: round(s.x), y: round(s.y), x2: round(p.x), y2: round(p.y), color, width,
        target: describe(s.x, s.y), target2: describe(p.x, p.y), text: ''
      })
    )
  } else {
    const box = {
      x: round(Math.min(s.x, p.x)), y: round(Math.min(s.y, p.y)),
      w: round(Math.abs(p.x - s.x)), h: round(Math.abs(p.y - s.y))
    }
    askNote(addNote({ kind: d.tool, ...box, color, width, target: describe(box.x + box.w / 2, box.y + box.h / 2), text: '' }))
  }
})

stage.addEventListener('pointercancel', () => {
  drag = null
  updateCursor()
  drawAnnotations()
})

function bounded(points: number[]) {
  const b = boundsOf(points)
  return { x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) }
}

stage.addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    setZoom(zoom * Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY)
  },
  { passive: false }
)

// ---- note bubble (text marks and notes right after drawing)

let bubbleCommit: ((value: string) => void) | null = null

function openBubble(x: number, y: number, initial: string, placeholder: string, onCommit: (value: string) => void) {
  bubble.value = initial
  bubble.placeholder = placeholder
  bubble.style.left = `${Math.max(8, Math.min(x + 14, innerWidth - 268))}px`
  bubble.style.top = `${Math.max(8, Math.min(y + 14, innerHeight - 90))}px`
  bubble.hidden = false
  bubbleCommit = onCommit
  setTimeout(() => bubble.focus())
}

function closeBubble(commit: boolean) {
  if (bubble.hidden) return
  bubble.hidden = true
  const onCommit = bubbleCommit
  bubbleCommit = null
  if (commit) onCommit?.(bubble.value.trim())
  stage.focus({ preventScroll: true })
}

bubble.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    closeBubble(true)
  } else if (e.key === 'Escape') {
    closeBubble(false)
  }
})
bubble.addEventListener('blur', () => closeBubble(true))

// ---- toast

let toastTimer = 0

function showToast(message: string, action?: [string, () => void]) {
  $('toast-text').textContent = message
  const button = $<HTMLButtonElement>('toast-action')
  button.hidden = !action
  if (action) {
    button.textContent = action[0]
    button.onclick = () => {
      toast.hidden = true
      action[1]()
    }
  }
  toast.hidden = false
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.hidden = true), 4000)
}

// ---- keyboard and buttons

const typing = (e: KeyboardEvent) => (e.target as HTMLElement).closest?.('textarea, input, select') !== null

document.addEventListener('keydown', (e) => {
  if (typing(e)) return
  const mod = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()
  if (mod && key === 'z') {
    e.preventDefault()
    if (e.shiftKey) restore(redoStack, undoStack)
    else restore(undoStack, redoStack)
    return
  }
  if (mod && key === 'y') {
    e.preventDefault()
    restore(redoStack, undoStack)
    return
  }
  if (mod) return
  if (e.key === ' ') {
    spaceDown = true
    updateCursor()
    e.preventDefault()
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !doc.readOnly) {
    removeNotes([selected])
  } else if (e.key === 'Escape') {
    drag = null
    toggleStylePop(false)
    select(null)
  } else if (e.key === 'Enter' && selected) {
    const note = notes.find((n) => n.id === selected)
    if (note && !doc.readOnly) askNote(note)
    e.preventDefault()
  } else if (e.key === '\\') toggleSide()
  else if (e.key === '+' || e.key === '=') setZoom(zoom * 1.25)
  else if (e.key === '-') setZoom(zoom / 1.25)
  else if (e.key === '0') fit()
  else if (e.key === '1') setZoom(1)
  else {
    const t = TOOLS.find(([, , k]) => k.toLowerCase() === key)
    if (t) setTool(t[0])
  }
})

document.addEventListener('keyup', (e) => {
  if (e.key === ' ') {
    spaceDown = false
    updateCursor()
  }
})

function toggleSide() {
  side.hidden = !side.hidden
  $('toggle-side').setAttribute('aria-pressed', String(!side.hidden))
}

for (const b of toolButtons) {
  b.onclick = () => setTool(b.dataset.tool as Tool)
  b.disabled = doc.readOnly && b.dataset.tool !== 'select' && b.dataset.tool !== 'pan'
}
styleBtn.onclick = () => toggleStylePop()
stylePop.addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>('button')
  if (!b) return
  if (b.dataset.color) color = b.dataset.color
  if (b.dataset.width) strokePx = Number(b.dataset.width)
  if (b.dataset.font) fontPx = Number(b.dataset.font)
  updateStyle()
})
$('undo').onclick = () => restore(undoStack, redoStack)
$('redo').onclick = () => restore(redoStack, undoStack)
$('clear').onclick = () => {
  if (!notes.length) return
  removeNotes(notes.map((n) => n.id))
  showToast('Cleared', ['Undo', () => restore(undoStack, redoStack)])
}
for (const id of ['undo', 'redo', 'clear']) $<HTMLButtonElement>(id).disabled = doc.readOnly
$('zoom-in').onclick = () => setZoom(zoom * 1.25)
$('zoom-out').onclick = () => setZoom(zoom / 1.25)
zoomLabel.onclick = () => setZoom(1)
$('fit').onclick = fit
$('toggle-side').onclick = toggleSide

// ---- export

/** The design with its marks as a PNG, at the design's own size (at least 1600 px wide). */
async function renderPng(): Promise<Blob> {
  drawAnnotations(undefined, false)
  const copyEl = svg!.cloneNode(true) as SVGSVGElement
  drawAnnotations()
  copyEl.removeAttribute('style')
  const factor = Math.max(1, Math.min(4, 1600 / baseW))
  const width = Math.round(baseW * factor)
  const height = Math.round(baseH * factor)
  copyEl.setAttribute('width', String(width))
  copyEl.setAttribute('height', String(height))
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copyEl)], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png')
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Orca's plugin frame refuses the async Clipboard API, so copy through a copy event, which a
 *  click still allows. It carries text only; the image goes out through Save PNG. */
function copyText(text: string): boolean {
  let copied = false
  const onCopy = (e: ClipboardEvent) => {
    e.clipboardData?.setData('text/plain', text)
    e.preventDefault()
    copied = true
  }
  document.addEventListener('copy', onCopy)
  try {
    document.execCommand('copy')
  } finally {
    document.removeEventListener('copy', onCopy)
  }
  return copied
}

copy.addEventListener('click', () => {
  if (copyText(promptBox.value)) {
    showToast(`Copied ${notes.length} note${notes.length === 1 ? '' : 's'}`)
  } else {
    side.hidden = false
    $<HTMLDetailsElement>('preview').open = true
    promptBox.select()
    showToast('Copy blocked: the prompt is selected, press Ctrl+C')
  }
})

$<HTMLButtonElement>('save-png').addEventListener('click', async () => {
  if (!svg || !orca.files) {
    showToast('Saving is not available here')
    return
  }
  try {
    const png = await renderPng()
    const result = await orca.files.saveAs({
      suggestedName: 'design-annotated.png', mimeType: 'image/png', data: await png.arrayBuffer()
    })
    if (result.status === 'saved') showToast('Saved PNG')
  } catch {
    showToast('Could not save the PNG')
  }
})

doc.onReplace((value) => {
  svgText = value
  notes = readNotes(value)
  undoStack.length = 0
  redoStack.length = 0
  if (!notes.some((n) => n.id === selected)) selected = null
  renderDesign()
  renderNotes()
})

setTool(tool)
updateStyle()
renderDesign()
renderNotes()
