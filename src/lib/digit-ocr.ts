import type { Digit } from "./sudoku"
import {
  at,
  binarize,
  connectedComponents,
  contrastRange,
  createGray,
  crop,
  inkRatio,
  otsuThreshold,
  resize,
  setPixel,
  type GrayImage,
} from "./gray-image"

export type DigitGuess = {
  digit: Digit
  score: number
}

export type CellOcr = {
  empty: boolean
  guesses: DigitGuess[]
}

const TEMPLATE_SIZE = 32

type Template = {
  digit: Digit
  vector: Float64Array
  holes: number
  holeY: number
  aspect: number
}

const BITMAPS: { digit: Digit; rows: string[] }[] = [
  {
    digit: 1,
    rows: [
      "..##...",
      ".###...",
      "..##...",
      "..##...",
      "..##...",
      "..##...",
      "..##...",
      "..##...",
      "######.",
    ],
  },
  {
    digit: 1,
    rows: [
      "...#...",
      "...#...",
      "...#...",
      "...#...",
      "...#...",
      "...#...",
      "...#...",
      "...#...",
      "...#...",
    ],
  },
  {
    digit: 2,
    rows: [
      ".#####.",
      "##...##",
      ".....##",
      "....##.",
      "...##..",
      "..##...",
      ".##....",
      "##.....",
      "#######",
    ],
  },
  {
    digit: 3,
    rows: [
      ".#####.",
      "##...##",
      ".....##",
      "...###.",
      ".....##",
      ".....##",
      ".....##",
      "##...##",
      ".#####.",
    ],
  },
  {
    digit: 4,
    rows: [
      "...##..",
      "..###..",
      ".#.##..",
      "##.##..",
      "#######",
      "...##..",
      "...##..",
      "...##..",
      "..####.",
    ],
  },
  {
    digit: 4,
    rows: [
      "..#..#.",
      ".##..#.",
      "##...#.",
      "#....#.",
      "#######",
      ".....#.",
      ".....#.",
      ".....#.",
      "....##.",
    ],
  },
  {
    digit: 5,
    rows: [
      "#######",
      "##.....",
      "##.....",
      "######.",
      ".....##",
      ".....##",
      ".....##",
      "##...##",
      ".#####.",
    ],
  },
  {
    digit: 6,
    rows: [
      ".#####.",
      "##...##",
      "##.....",
      "######.",
      "##...##",
      "##...##",
      "##...##",
      "##...##",
      ".#####.",
    ],
  },
  {
    digit: 7,
    rows: [
      "#######",
      ".....##",
      "....##.",
      "...##..",
      "...##..",
      "..##...",
      "..##...",
      ".##....",
      ".##....",
    ],
  },
  {
    digit: 7,
    rows: [
      "#######",
      "#...##.",
      "...##..",
      "..###..",
      "...##..",
      "...##..",
      "...##..",
      "...##..",
      "...##..",
    ],
  },
  {
    digit: 8,
    rows: [
      ".#####.",
      "##...##",
      "##...##",
      ".#####.",
      "##...##",
      "##...##",
      "##...##",
      "##...##",
      ".#####.",
    ],
  },
  {
    digit: 9,
    rows: [
      ".#####.",
      "##...##",
      "##...##",
      "##...##",
      ".######",
      ".....##",
      ".....##",
      "##...##",
      ".#####.",
    ],
  },
]

const TEMPLATES: Template[] = BITMAPS.map((entry) => {
  const glyph = rasterizeBitmap(entry.rows)
  const holes = holeFeatures(glyph)
  return {
    digit: entry.digit,
    vector: featureVector(glyph, glyph.width / glyph.height, holes),
    holes: holes.count,
    holeY: holes.meanY,
    aspect: glyph.width / glyph.height,
  }
})

export function renderDigitGlyph(digit: Digit, size = TEMPLATE_SIZE): GrayImage {
  const match = BITMAPS.find((entry) => entry.digit === digit)
  if (!match || digit === 0) return createGray(size, size, 255)
  return resize(rasterizeBitmap(match.rows), size, size)
}

export function recognizeCell(cell: GrayImage): CellOcr {
  if (contrastRange(cell) < 22) return { empty: true, guesses: [] }

  const binary = binarize(cell, Math.max(40, otsuThreshold(cell)))
  const extracted = extractGlyph(binary)
  if (!extracted) return { empty: true, guesses: [] }

  const { glyph, aspect } = extracted
  const coverage = inkRatio(glyph)
  if (coverage < 0.04 || coverage > 0.68) return { empty: true, guesses: [] }

  const normalized = normalizeGlyph(glyph)
  const holes = holeFeatures(normalized)
  const vector = featureVector(normalized, aspect, holes)
  const scores = new Map<Digit, number>()

  for (const template of TEMPLATES) {
    let score = cosine(vector, template.vector)
    if (holes.count === 2 && template.digit === 8) score += 0.08
    if (holes.count === 1 && template.digit === 6 && holes.meanY > 0.52) score += 0.06
    if (holes.count === 1 && template.digit === 9 && holes.meanY < 0.48) score += 0.06
    if (holes.count === 0 && template.digit === 8) score -= 0.08
    if (aspect < 0.5 && template.digit === 1) score += 0.08
    if (aspect > 0.85 && template.digit === 1) score -= 0.06
    const previous = scores.get(template.digit) ?? -1
    if (score > previous) scores.set(template.digit, score)
  }

  const guesses = [...scores.entries()]
    .map(([digit, score]) => ({ digit, score }))
    .sort((a, b) => b.score - a.score)

  const best = guesses[0]
  const second = guesses[1]
  if (!best || best.score < 0.62) return { empty: true, guesses }
  if (second && best.score - second.score < 0.025 && best.score < 0.78) {
    return { empty: true, guesses }
  }

  return { empty: false, guesses }
}

function rasterizeBitmap(rows: string[]): GrayImage {
  const height = rows.length
  const width = rows[0].length
  const image = createGray(width, height, 255)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rows[y][x] === "#") setPixel(image, x, y, 0)
    }
  }
  return normalizeGlyph(image)
}

function extractGlyph(binary: GrayImage): { glyph: GrayImage; aspect: number } | null {
  const comps = connectedComponents(binary, true)
  const cellArea = binary.width * binary.height
  const candidates = comps.filter((comp) => {
    const bw = comp.maxX - comp.minX + 1
    const bh = comp.maxY - comp.minY + 1
    const aspect = bw / bh
    if (comp.area < Math.max(10, cellArea * 0.015)) return false
    if (comp.area > cellArea * 0.62) return false
    if (aspect < 0.12 || aspect > 3.2) return false
    const horizontalLine = bw > binary.width * 0.78 && bh < binary.height * 0.22
    const verticalLine = bh > binary.height * 0.78 && bw < binary.width * 0.22
    if (horizontalLine || verticalLine) return false
    const cx = (comp.minX + comp.maxX) / 2
    const cy = (comp.minY + comp.maxY) / 2
    const centered =
      cx > binary.width * 0.18 &&
      cx < binary.width * 0.82 &&
      cy > binary.height * 0.18 &&
      cy < binary.height * 0.82
    return centered
  })

  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.area - a.area)
  const best = candidates[0]
  const padX = Math.max(1, Math.round((best.maxX - best.minX + 1) * 0.08))
  const padY = Math.max(1, Math.round((best.maxY - best.minY + 1) * 0.08))
  const glyph = crop(
    binary,
    best.minX - padX,
    best.minY - padY,
    best.maxX - best.minX + 1 + padX * 2,
    best.maxY - best.minY + 1 + padY * 2
  )
  const aspect = (best.maxX - best.minX + 1) / (best.maxY - best.minY + 1)
  return { glyph, aspect }
}

function normalizeGlyph(glyph: GrayImage): GrayImage {
  const canvas = createGray(TEMPLATE_SIZE, TEMPLATE_SIZE, 255)
  const scale = Math.min(
    (TEMPLATE_SIZE - 4) / Math.max(1, glyph.width),
    (TEMPLATE_SIZE - 4) / Math.max(1, glyph.height)
  )
  const width = Math.max(1, Math.round(glyph.width * scale))
  const height = Math.max(1, Math.round(glyph.height * scale))
  const resized = resize(glyph, width, height)
  const x0 = Math.floor((TEMPLATE_SIZE - width) / 2)
  const y0 = Math.floor((TEMPLATE_SIZE - height) / 2)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      setPixel(canvas, x0 + x, y0 + y, at(resized, x, y) < 128 ? 0 : 255)
    }
  }
  return canvas
}

function featureVector(
  glyph: GrayImage,
  aspect: number,
  holes: { count: number; meanY: number }
): Float64Array {
  const zones = zoneDensity(glyph, 4, 4)
  const segments = sevenSegments(glyph)
  const values = [
    ...zones,
    ...segments,
    Math.min(2, holes.count) / 2,
    holes.meanY,
    Math.min(2.5, aspect) / 2.5,
  ]
  return Float64Array.from(values)
}

function zoneDensity(image: GrayImage, rows: number, cols: number): number[] {
  const values: number[] = []
  const rowH = image.height / rows
  const colW = image.width / cols
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(c * colW)
      const y0 = Math.floor(r * rowH)
      const x1 = Math.floor((c + 1) * colW)
      const y1 = Math.floor((r + 1) * rowH)
      let dark = 0
      const total = Math.max(1, (x1 - x0) * (y1 - y0))
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (at(image, x, y) < 128) dark += 1
        }
      }
      values.push(dark / total)
    }
  }
  return values
}

function sevenSegments(image: GrayImage): number[] {
  const w = image.width
  const h = image.height
  const boxes = [
    [0.22, 0.06, 0.78, 0.22],
    [0.08, 0.18, 0.32, 0.48],
    [0.68, 0.18, 0.92, 0.48],
    [0.22, 0.42, 0.78, 0.58],
    [0.08, 0.52, 0.32, 0.84],
    [0.68, 0.52, 0.92, 0.84],
    [0.22, 0.78, 0.78, 0.94],
  ]
  return boxes.map(([x0, y0, x1, y1]) => {
    const left = Math.floor(x0 * w)
    const top = Math.floor(y0 * h)
    const right = Math.ceil(x1 * w)
    const bottom = Math.ceil(y1 * h)
    let dark = 0
    const total = Math.max(1, (right - left) * (bottom - top))
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        if (at(image, x, y) < 128) dark += 1
      }
    }
    return dark / total
  })
}

function cosine(a: Float64Array, b: Float64Array): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function holeFeatures(binary: GrayImage): { count: number; meanY: number } {
  const inverted = createGray(binary.width, binary.height, 255)
  for (let i = 0; i < binary.pixels.length; i++) {
    inverted.pixels[i] = binary.pixels[i] < 128 ? 255 : 0
  }
  const w = inverted.width
  const h = inverted.height
  const stack: number[] = []
  const visit = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = y * w + x
    if (inverted.pixels[i] < 128) {
      inverted.pixels[i] = 255
      stack.push(i)
    }
  }
  for (let x = 0; x < w; x++) {
    visit(x, 0)
    visit(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    visit(0, y)
    visit(w - 1, y)
  }
  while (stack.length > 0) {
    const i = stack.pop()!
    const x = i % w
    const y = (i / w) | 0
    visit(x - 1, y)
    visit(x + 1, y)
    visit(x, y - 1)
    visit(x, y + 1)
  }
  const holes = connectedComponents(inverted, true).filter((comp) => comp.area >= 6)
  if (holes.length === 0) return { count: 0, meanY: 0.5 }
  const meanY =
    holes.reduce((sum, hole) => sum + (hole.minY + hole.maxY) / 2, 0) /
    holes.length /
    binary.height
  return { count: holes.length, meanY }
}
