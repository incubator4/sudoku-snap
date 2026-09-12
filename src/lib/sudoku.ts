export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type Grid = Digit[][]

export type SolveSuccess = {
  ok: true
  grid: Grid
  steps: { row: number; col: number; value: Digit }[]
}

export type SolveFailure = {
  ok: false
  reason: "conflict" | "unsolvable" | "invalid-size"
  message: string
}

export type SolveResult = SolveSuccess | SolveFailure

const SIZE = 9
const BOX = 3
const DIGIT_BITS = 0b1111111110

export function emptyGrid(): Grid {
  return Array.from({ length: SIZE }, () => Array<Digit>(SIZE).fill(0))
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => [...row])
}

export function cellKey(row: number, col: number): string {
  return `${row}-${col}`
}

function boxIndex(row: number, col: number): number {
  return Math.floor(row / BOX) * BOX + Math.floor(col / BOX)
}

function bitCount(mask: number): number {
  let bits = mask >> 1
  let count = 0
  while (bits) {
    count += bits & 1
    bits >>= 1
  }
  return count
}

export function parsePuzzle(text: string): { ok: true; grid: Grid } | { ok: false; message: string } {
  const normalized = text
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/[·•＿_xX]/g, ".")

  const digits: Digit[] = []
  for (const ch of normalized) {
    if (ch === "." || ch === "0" || ch === "*" || ch === "-") {
      digits.push(0)
    } else if (ch >= "1" && ch <= "9") {
      digits.push(Number(ch) as Digit)
    }
  }

  if (digits.length !== 81) {
    return {
      ok: false,
      message: `需要正好 81 个格子（数字或空位），当前识别到 ${digits.length} 个。`,
    }
  }

  const grid = emptyGrid()
  for (let i = 0; i < 81; i++) {
    grid[Math.floor(i / SIZE)][i % SIZE] = digits[i]
  }
  return { ok: true, grid }
}

export function serializePuzzle(grid: Grid): string {
  return grid.flat().map((n) => (n === 0 ? "." : String(n))).join("")
}

export function formatPuzzle(grid: Grid): string {
  return grid
    .map((row) => row.map((n) => (n === 0 ? "." : String(n))).join(" "))
    .join("\n")
}

export function givenCount(grid: Grid): number {
  return grid.flat().filter((n) => n !== 0).length
}

export function findConflictCells(grid: Grid): Set<string> {
  const conflicts = new Set<string>()

  const markDuplicates = (cells: { row: number; col: number; value: Digit }[]) => {
    const buckets = new Map<number, { row: number; col: number }[]>()
    for (const cell of cells) {
      if (cell.value === 0) continue
      const list = buckets.get(cell.value) ?? []
      list.push({ row: cell.row, col: cell.col })
      buckets.set(cell.value, list)
    }
    for (const list of buckets.values()) {
      if (list.length > 1) {
        for (const cell of list) conflicts.add(cellKey(cell.row, cell.col))
      }
    }
  }

  for (let row = 0; row < SIZE; row++) {
    markDuplicates(
      grid[row].map((value, col) => ({ row, col, value }))
    )
  }

  for (let col = 0; col < SIZE; col++) {
    markDuplicates(
      Array.from({ length: SIZE }, (_, row) => ({
        row,
        col,
        value: grid[row][col],
      }))
    )
  }

  for (let box = 0; box < SIZE; box++) {
    const startRow = Math.floor(box / BOX) * BOX
    const startCol = (box % BOX) * BOX
    const cells: { row: number; col: number; value: Digit }[] = []
    for (let r = 0; r < BOX; r++) {
      for (let c = 0; c < BOX; c++) {
        cells.push({
          row: startRow + r,
          col: startCol + c,
          value: grid[startRow + r][startCol + c],
        })
      }
    }
    markDuplicates(cells)
  }

  return conflicts
}

export function isCompleteAndValid(grid: Grid): boolean {
  if (grid.some((row) => row.some((n) => n < 1 || n > 9))) return false
  return findConflictCells(grid).size === 0
}

export function solve(grid: Grid): SolveResult {
  if (grid.length !== SIZE || grid.some((row) => row.length !== SIZE)) {
    return { ok: false, reason: "invalid-size", message: "棋盘必须是 9×9。" }
  }

  const board = cloneGrid(grid)
  if (findConflictCells(board).size > 0) {
    return {
      ok: false,
      reason: "conflict",
      message: "题目本身有冲突：同一行、列或宫里出现了重复数字。",
    }
  }

  const rows = new Array<number>(SIZE).fill(0)
  const cols = new Array<number>(SIZE).fill(0)
  const boxes = new Array<number>(SIZE).fill(0)
  const empties: { row: number; col: number }[] = []

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const value = board[row][col]
      if (value === 0) {
        empties.push({ row, col })
        continue
      }
      const bit = 1 << value
      rows[row] |= bit
      cols[col] |= bit
      boxes[boxIndex(row, col)] |= bit
    }
  }

  const candidates = (row: number, col: number) =>
    DIGIT_BITS & ~(rows[row] | cols[col] | boxes[boxIndex(row, col)])

  const pick = () => {
    let bestIndex = -1
    let bestMask = 0
    let bestCount = 10

    for (let i = 0; i < empties.length; i++) {
      const { row, col } = empties[i]
      if (board[row][col] !== 0) continue
      const mask = candidates(row, col)
      const count = bitCount(mask)
      if (count === 0) {
        return { index: i, mask, count }
      }
      if (count < bestCount) {
        bestIndex = i
        bestMask = mask
        bestCount = count
        if (count === 1) break
      }
    }

    return { index: bestIndex, mask: bestMask, count: bestCount }
  }

  const search = (): boolean => {
    const { index, mask, count } = pick()
    if (index === -1) return true
    if (count === 0) return false

    const { row, col } = empties[index]
    for (let value = 1; value <= 9; value++) {
      const bit = 1 << value
      if ((mask & bit) === 0) continue

      board[row][col] = value as Digit
      rows[row] |= bit
      cols[col] |= bit
      boxes[boxIndex(row, col)] |= bit

      if (search()) return true

      board[row][col] = 0
      rows[row] &= ~bit
      cols[col] &= ~bit
      boxes[boxIndex(row, col)] &= ~bit
    }

    return false
  }

  if (!search()) {
    return {
      ok: false,
      reason: "unsolvable",
      message: "当前题目无解。请检查已填数字是否有误。",
    }
  }

  const steps: SolveSuccess["steps"] = []
  for (const cell of empties) {
    steps.push({
      row: cell.row,
      col: cell.col,
      value: board[cell.row][cell.col],
    })
  }

  return { ok: true, grid: board, steps }
}
