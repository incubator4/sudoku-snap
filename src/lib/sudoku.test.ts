import assert from "node:assert/strict"
import { test } from "node:test"
import {
  emptyGrid,
  findConflictCells,
  formatPuzzle,
  isCompleteAndValid,
  parsePuzzle,
  serializePuzzle,
  solve,
} from "./sudoku.ts"

const EASY =
  "530070000600195000098000060800060003400803001700020006060000280000419005000080079"
const EASY_SOLUTION =
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179"
const HARD =
  "800000000003600000070090200050007000000045700000100030001000068008500010090000400"

test("parsePuzzle accepts 81 digits and dotted empties", () => {
  const parsed = parsePuzzle(EASY)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(parsed.grid[0][0], 5)
  assert.equal(parsed.grid[0][2], 0)
  assert.equal(serializePuzzle(parsed.grid).replaceAll(".", "0"), EASY)
})

test("parsePuzzle rejects the wrong length", () => {
  const parsed = parsePuzzle("12345")
  assert.equal(parsed.ok, false)
})

test("formatPuzzle round-trips through parsePuzzle", () => {
  const parsed = parsePuzzle(EASY)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const formatted = formatPuzzle(parsed.grid)
  const again = parsePuzzle(formatted)
  assert.equal(again.ok, true)
  if (!again.ok) return
  assert.equal(serializePuzzle(again.grid), serializePuzzle(parsed.grid))
})

test("findConflictCells marks duplicate clues", () => {
  const grid = emptyGrid()
  grid[0][0] = 5
  grid[0][8] = 5
  const conflicts = findConflictCells(grid)
  assert.equal(conflicts.has("0-0"), true)
  assert.equal(conflicts.has("0-8"), true)
})

test("solve fills the classic easy puzzle", () => {
  const parsed = parsePuzzle(EASY)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const result = solve(parsed.grid)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(serializePuzzle(result.grid).replaceAll(".", "0"), EASY_SOLUTION)
  assert.equal(isCompleteAndValid(result.grid), true)
})

test("solve keeps original clues", () => {
  const parsed = parsePuzzle(HARD)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const result = solve(parsed.grid)
  assert.equal(result.ok, true)
  if (!result.ok) return
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const clue = parsed.grid[row][col]
      if (clue !== 0) assert.equal(result.grid[row][col], clue)
    }
  }
  assert.equal(isCompleteAndValid(result.grid), true)
})

test("solve reports conflicts instead of guessing", () => {
  const parsed = parsePuzzle(EASY)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  parsed.grid[0][2] = 5
  const result = solve(parsed.grid)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.reason, "conflict")
})

test("solve reports unsolvable puzzles", () => {
  const parsed = parsePuzzle(
    "123456789123456789000000000000000000000000000000000000000000000000000000000000000"
  )
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const result = solve(parsed.grid)
  assert.equal(result.ok, false)
})

test("empty board still produces a valid completed grid", () => {
  const result = solve(emptyGrid())
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(isCompleteAndValid(result.grid), true)
  assert.equal(result.steps.length, 81)
})
