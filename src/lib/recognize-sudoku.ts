import { recognizeCell, type CellOcr } from "./digit-ocr"
import {
  adaptiveThreshold,
  blur3,
  close,
  connectedComponents,
  crop,
  extremaQuad,
  imageQuad,
  inkRatio,
  longRunMask,
  quadArea,
  resizeMax,
  warpPerspective,
  type GrayImage,
  type Quad,
} from "./gray-image"
import {
  cloneGrid,
  emptyGrid,
  findConflictCells,
  givenCount,
  solve,
  type Digit,
  type Grid,
} from "./sudoku"

const WARP_SIZE = 450

export type RecognizeSuccess = {
  ok: true
  grid: Grid
  givenCount: number
  warped: GrayImage
}

export type RecognizeFailure = {
  ok: false
  message: string
  warped?: GrayImage
}

export type RecognizeResult = RecognizeSuccess | RecognizeFailure

export function recognizeSudoku(source: GrayImage): RecognizeResult {
  const image = resizeMax(source, 900)
  const binary = adaptiveThreshold(blur3(image))
  const quad = findGridQuad(binary, image)
  const warped = warpPerspective(image, quad, WARP_SIZE, WARP_SIZE)
  const cells = splitCells(warped)
  const readings = cells.map((cell) => recognizeCell(cell))
  const resolved = resolveReadings(readings)

  if (givenCount(resolved) === 0) {
    return {
      ok: false,
      message: "没有识别到数字。请让棋盘尽量充满画面，并保证光线均匀、数字清晰。",
      warped,
    }
  }

  return {
    ok: true,
    grid: resolved,
    givenCount: givenCount(resolved),
    warped,
  }
}

export function findGridQuad(binary: GrayImage, original: GrayImage): Quad {
  const lineMask = close(longRunMask(binary, 0.16), 1)
  const fromLines = bestQuad(lineMask, original)
  if (fromLines) return fromLines

  const fromInk = bestQuad(binary, original)
  if (fromInk) return fromInk

  return imageQuad(original)
}

function bestQuad(mask: GrayImage, original: GrayImage): Quad | null {
  const minArea = original.width * original.height * 0.08
  const comps = connectedComponents(mask, true)
    .filter((comp) => {
      const bw = comp.maxX - comp.minX + 1
      const bh = comp.maxY - comp.minY + 1
      const aspect = bw / bh
      return (
        comp.area >= minArea * 0.04 &&
        aspect > 0.62 &&
        aspect < 1.55 &&
        bw > original.width * 0.25 &&
        bh > original.height * 0.25
      )
    })
    .sort((a, b) => {
      const areaA = (a.maxX - a.minX + 1) * (a.maxY - a.minY + 1)
      const areaB = (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1)
      return areaB - areaA
    })

  for (const comp of comps) {
    const quad = extremaQuad(comp)
    const area = quadArea(quad)
    if (area < minArea) continue
    if (!isConvexQuad(quad)) continue
    return quad
  }
  return null
}

function isConvexQuad(quad: Quad): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = quad[i]
    const b = quad[(i + 1) % 4]
    const c = quad[(i + 2) % 4]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cross) < 1) continue
    const next = cross > 0 ? 1 : -1
    if (sign === 0) sign = next
    else if (sign !== next) return false
  }
  return true
}

export function splitCells(warped: GrayImage): GrayImage[] {
  const lines = locateGridLines(warped)
  const cells: GrayImage[] = []
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const x0 = lines.vertical[col]
      const x1 = lines.vertical[col + 1]
      const y0 = lines.horizontal[row]
      const y1 = lines.horizontal[row + 1]
      const padX = Math.max(1, Math.round((x1 - x0) * 0.08))
      const padY = Math.max(1, Math.round((y1 - y0) * 0.08))
      cells.push(
        crop(warped, x0 + padX, y0 + padY, x1 - x0 - padX * 2, y1 - y0 - padY * 2)
      )
    }
  }
  return cells
}

function locateGridLines(warped: GrayImage): { horizontal: number[]; vertical: number[] } {
  const binary = adaptiveThreshold(warped, 12, 0.08)
  return {
    horizontal: fitLinePositions(project(binary, "row"), warped.height),
    vertical: fitLinePositions(project(binary, "col"), warped.width),
  }
}

function project(binary: GrayImage, axis: "row" | "col"): number[] {
  if (axis === "row") {
    const values = new Array<number>(binary.height).fill(0)
    for (let y = 0; y < binary.height; y++) {
      let dark = 0
      for (let x = 0; x < binary.width; x++) {
        if (binary.pixels[y * binary.width + x] < 128) dark += 1
      }
      values[y] = dark
    }
    return values
  }
  const values = new Array<number>(binary.width).fill(0)
  for (let x = 0; x < binary.width; x++) {
    let dark = 0
    for (let y = 0; y < binary.height; y++) {
      if (binary.pixels[y * binary.width + x] < 128) dark += 1
    }
    values[x] = dark
  }
  return values
}

function fitLinePositions(projection: number[], size: number): number[] {
  const expected = (size - 1) / 9
  let bestScore = -Infinity
  let bestOffset = 0
  let bestScale = 1

  for (let scale = 0.96; scale <= 1.04; scale += 0.005) {
    for (let offset = -12; offset <= 12; offset += 1) {
      let score = 0
      for (let i = 0; i <= 9; i++) {
        const pos = Math.round(offset + i * expected * scale)
        if (pos < 0 || pos >= projection.length) {
          score -= 50
          continue
        }
        score += projection[pos]
        if (pos > 0) score += projection[pos - 1] * 0.5
        if (pos + 1 < projection.length) score += projection[pos + 1] * 0.5
      }
      if (score > bestScore) {
        bestScore = score
        bestOffset = offset
        bestScale = scale
      }
    }
  }

  const positions = Array.from({ length: 10 }, (_, i) =>
    Math.min(size, Math.max(0, Math.round(bestOffset + i * expected * bestScale)))
  )
  positions[0] = 0
  positions[9] = size
  return positions
}

export function resolveReadings(readings: CellOcr[]): Grid {
  const grid = emptyGrid()
  const locked: { row: number; col: number; digit: Digit; score: number }[] = []

  for (let i = 0; i < 81; i++) {
    const reading = readings[i]
    if (reading.empty || reading.guesses.length === 0) continue
    const best = reading.guesses[0]
    const row = Math.floor(i / 9)
    const col = i % 9
    grid[row][col] = best.digit
    locked.push({ row, col, digit: best.digit, score: best.score })
  }

  if (findConflictCells(grid).size === 0) {
    const result = solve(grid)
    if (result.ok) return grid
  }

  return repairWithCandidates(readings, locked)
}

function repairWithCandidates(
  readings: CellOcr[],
  locked: { row: number; col: number; digit: Digit; score: number }[]
): Grid {
  const ordered = [...locked].sort((a, b) => a.score - b.score)
  const grid = emptyGrid()

  for (const cell of ordered) {
    grid[cell.row][cell.col] = cell.digit
  }

  for (const cell of ordered) {
    if (findConflictCells(grid).size === 0 && solve(grid).ok) break
    const index = cell.row * 9 + cell.col
    const alternatives = readings[index].guesses.slice(1, 3)
    let placed = false
    for (const alt of alternatives) {
      grid[cell.row][cell.col] = alt.digit
      if (findConflictCells(grid).size === 0) {
        placed = true
        break
      }
    }
    if (!placed) grid[cell.row][cell.col] = 0
  }

  if (findConflictCells(grid).size > 0) {
    const remaining = [...ordered].sort((a, b) => a.score - b.score)
    for (const cell of remaining) {
      grid[cell.row][cell.col] = 0
      if (findConflictCells(grid).size === 0) break
    }
  }

  const solved = solve(grid)
  if (!solved.ok) {
    const byScore = [...ordered].sort((a, b) => a.score - b.score)
    for (const cell of byScore) {
      if (grid[cell.row][cell.col] === 0) continue
      const previous = grid[cell.row][cell.col]
      grid[cell.row][cell.col] = 0
      if (solve(grid).ok) continue
      grid[cell.row][cell.col] = previous
    }
  }

  return cloneGrid(grid)
}

export function grayToRgba(image: GrayImage): Uint8ClampedArray {
  const data = new Uint8ClampedArray(image.width * image.height * 4)
  for (let i = 0; i < image.pixels.length; i++) {
    const value = image.pixels[i]
    data[i * 4] = value
    data[i * 4 + 1] = value
    data[i * 4 + 2] = value
    data[i * 4 + 3] = 255
  }
  return data
}

export function overlayGridLines(image: GrayImage): GrayImage {
  const copy = {
    width: image.width,
    height: image.height,
    pixels: new Uint8Array(image.pixels),
  }
  const step = image.width / 9
  for (let i = 0; i <= 9; i++) {
    const pos = Math.round(i * step)
    const thickness = i % 3 === 0 ? 3 : 1
    for (let t = 0; t < thickness; t++) {
      const x = Math.min(image.width - 1, pos + t)
      const y = Math.min(image.height - 1, pos + t)
      for (let row = 0; row < image.height; row++) copy.pixels[row * image.width + x] = 40
      for (let col = 0; col < image.width; col++) copy.pixels[y * image.width + col] = 40
    }
  }
  return copy
}

export { inkRatio }
