import assert from "node:assert/strict"
import { test } from "node:test"
import { recognizeCell, renderDigitGlyph } from "./digit-ocr.ts"
import {
  blitGlyph,
  blitPerspective,
  createGray,
  drawLine,
  fromRgba,
  longRunMask,
  resize,
  type GrayImage,
} from "./gray-image.ts"
import { recognizeSudoku } from "./recognize-sudoku.ts"
import { givenCount, parsePuzzle, serializePuzzle, type Digit, type Grid } from "./sudoku.ts"

const EASY =
  "530070000600195000098000060800060003400803001700020006060000280000419005000080079"

function parseGrid(data: string): Grid {
  const parsed = parsePuzzle(data)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) throw new Error(parsed.message)
  return parsed.grid
}

function renderPuzzle(grid: Grid, cell = 40, line = 3): GrayImage {
  const size = cell * 9 + line
  const image = createGray(size, size, 255)
  for (let i = 0; i <= 9; i++) {
    const pos = i * cell
    const thickness = i % 3 === 0 ? line : 1
    drawLine(image, pos, 0, pos, size - 1, 0, thickness)
    drawLine(image, 0, pos, size - 1, pos, 0, thickness)
  }
  const glyphSize = Math.round(cell * 0.62)
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const digit = grid[row][col]
      if (digit === 0) continue
      const glyph = renderDigitGlyph(digit as Digit, glyphSize)
      const x = col * cell + Math.round((cell - glyphSize) / 2)
      const y = row * cell + Math.round((cell - glyphSize) / 2)
      blitGlyph(image, glyph, x, y)
    }
  }
  return image
}

test("recognizeCell reads rendered digits 1-9", () => {
  for (let digit = 1; digit <= 9; digit++) {
    const glyph = renderDigitGlyph(digit as Digit, 48)
    const padded = createGray(64, 64, 255)
    blitGlyph(padded, glyph, 8, 8)
    const result = recognizeCell(padded)
    assert.equal(result.empty, false, `digit ${digit} should not be empty`)
    assert.equal(result.guesses[0]?.digit, digit, `expected ${digit}, got ${result.guesses[0]?.digit}`)
  }
})

test("recognizeCell treats blank cells as empty", () => {
  const blank = createGray(48, 48, 245)
  const result = recognizeCell(blank)
  assert.equal(result.empty, true)
})

test("recognizeSudoku reads a clean rendered puzzle", () => {
  const grid = parseGrid(EASY)
  const image = renderPuzzle(grid)
  const result = recognizeSudoku(image)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(serializePuzzle(result.grid), serializePuzzle(grid))
  assert.equal(result.givenCount, givenCount(grid))
})

test("recognizeSudoku reads a puzzle inset on a larger page", () => {
  const grid = parseGrid(EASY)
  const puzzle = renderPuzzle(grid, 32, 2)
  const page = createGray(puzzle.width + 80, puzzle.height + 90, 250)
  blitGlyph(page, puzzle, 40, 35)
  const result = recognizeSudoku(page)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(serializePuzzle(result.grid), serializePuzzle(grid))
})

test("recognizeSudoku recovers a mildly perspective-warped puzzle", () => {
  const grid = parseGrid(EASY)
  const puzzle = renderPuzzle(grid, 36, 2)
  const page = createGray(520, 500, 252)
  blitPerspective(puzzle, page, [
    { x: 70, y: 40 },
    { x: 470, y: 55 },
    { x: 455, y: 460 },
    { x: 55, y: 445 },
  ])
  const result = recognizeSudoku(page)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(serializePuzzle(result.grid), serializePuzzle(grid))
})

test("fromRgba converts color pixels to luma", () => {
  const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 255])
  const gray = fromRgba(data, 2, 1)
  assert.equal(gray.width, 2)
  assert.ok(gray.pixels[0] > 50)
  assert.equal(gray.pixels[1], 0)
})

test("longRunMask keeps full-width grid lines", () => {
  const image = createGray(40, 40, 255)
  drawLine(image, 0, 10, 39, 10, 0, 2)
  const mask = longRunMask(image, 0.4)
  let dark = 0
  for (const value of mask.pixels) if (value < 128) dark += 1
  assert.ok(dark >= 40)
})

test("resize preserves a filled block", () => {
  const image = createGray(10, 10, 255)
  for (let y = 2; y < 8; y++) {
    for (let x = 2; x < 8; x++) image.pixels[y * 10 + x] = 0
  }
  const out = resize(image, 20, 20)
  assert.equal(out.width, 20)
  assert.equal(out.pixels[10 * 20 + 10], 0)
})
