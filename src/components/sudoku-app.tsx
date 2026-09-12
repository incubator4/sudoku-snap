"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Eraser,
  Keyboard,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  WandSparkles,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { SudokuBoard } from "@/components/sudoku-board"
import { SAMPLE_PUZZLES } from "@/lib/puzzles"
import {
  cellKey,
  cloneGrid,
  emptyGrid,
  findConflictCells,
  formatPuzzle,
  givenCount,
  parsePuzzle,
  solve,
  type Digit,
  type Grid,
} from "@/lib/sudoku"

type Status =
  | { kind: "idle" }
  | { kind: "empty" }
  | { kind: "conflict"; message: string }
  | { kind: "error"; message: string }
  | { kind: "solving"; filled: number; total: number }
  | { kind: "solved"; filled: number }

function setCell(grid: Grid, row: number, col: number, value: Digit): Grid {
  const next = cloneGrid(grid)
  next[row][col] = value
  return next
}

export function SudokuApp() {
  const [grid, setGrid] = useState<Grid>(() => emptyGrid())
  const [givenKeys, setGivenKeys] = useState<Set<string>>(() => new Set())
  const [filledKeys, setFilledKeys] = useState<Set<string>>(() => new Set())
  const [selected, setSelected] = useState<{ row: number; col: number }>({
    row: 0,
    col: 0,
  })
  const [pasteText, setPasteText] = useState("")
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>({ kind: "empty" })
  const [isSolving, setIsSolving] = useState(false)
  const boardRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number | null>(null)

  const conflicts = useMemo(() => findConflictCells(grid), [grid])
  const clues = givenCount(grid)

  const stopAnimation = useCallback(() => {
    if (animationRef.current !== null) {
      window.clearTimeout(animationRef.current)
      animationRef.current = null
    }
    setIsSolving(false)
  }, [])

  const applyPuzzle = useCallback(
    (next: Grid, options?: { note?: string }) => {
      stopAnimation()
      setGrid(next)
      const keys = new Set<string>()
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          if (next[row][col] !== 0) keys.add(cellKey(row, col))
        }
      }
      setGivenKeys(keys)
      setFilledKeys(new Set())
      setPasteError(null)
      const nextConflicts = findConflictCells(next)
      if (nextConflicts.size > 0) {
        setStatus({
          kind: "conflict",
          message: "题目有冲突：同一行、列或宫出现了重复数字。",
        })
      } else if (givenCount(next) === 0) {
        setStatus({ kind: "empty" })
      } else {
        setStatus({ kind: "idle" })
      }
      if (options?.note) setPasteText(formatPuzzle(next))
    },
    [stopAnimation]
  )

  const enterDigit = useCallback(
    (value: Digit) => {
      if (isSolving) return
      const { row, col } = selected
      const next = setCell(grid, row, col, value)
      const key = cellKey(row, col)
      const nextGivens = new Set(givenKeys)
      const nextFilled = new Set(filledKeys)
      nextFilled.delete(key)
      if (value === 0) nextGivens.delete(key)
      else nextGivens.add(key)
      setGrid(next)
      setGivenKeys(nextGivens)
      setFilledKeys(nextFilled)
      const nextConflicts = findConflictCells(next)
      if (nextConflicts.size > 0) {
        setStatus({
          kind: "conflict",
          message: "题目有冲突：同一行、列或宫出现了重复数字。",
        })
      } else if (givenCount(next) === 0) {
        setStatus({ kind: "empty" })
      } else {
        setStatus({ kind: "idle" })
      }
    },
    [filledKeys, givenKeys, grid, isSolving, selected]
  )

  const moveSelection = useCallback((rowDelta: number, colDelta: number) => {
    setSelected((current) => ({
      row: Math.min(8, Math.max(0, current.row + rowDelta)),
      col: Math.min(8, Math.max(0, current.col + colDelta)),
    }))
  }, [])

  const fillSolution = useCallback(
    (base: Grid, steps: { row: number; col: number; value: Digit }[], animate: boolean) => {
      stopAnimation()
      const ordered = [...steps].sort(
        (a, b) => a.row - b.row || a.col - b.col
      )

      if (!animate || ordered.length === 0) {
        const complete = cloneGrid(base)
        const filled = new Set<string>()
        for (const step of ordered) {
          complete[step.row][step.col] = step.value
          filled.add(cellKey(step.row, step.col))
        }
        setGrid(complete)
        setFilledKeys(filled)
        setStatus({ kind: "solved", filled: ordered.length })
        return
      }

      setIsSolving(true)
      setFilledKeys(new Set())
      setGrid(cloneGrid(base))
      setStatus({ kind: "solving", filled: 0, total: ordered.length })

      const delay = ordered.length > 50 ? 12 : 28
      let index = 0
      const tick = () => {
        const step = ordered[index]
        const key = cellKey(step.row, step.col)
        setGrid((current) => setCell(current, step.row, step.col, step.value))
        setFilledKeys((current) => {
          const next = new Set(current)
          next.add(key)
          return next
        })
        index += 1
        setStatus({ kind: "solving", filled: index, total: ordered.length })
        if (index >= ordered.length) {
          animationRef.current = null
          setIsSolving(false)
          setStatus({ kind: "solved", filled: ordered.length })
          return
        }
        animationRef.current = window.setTimeout(tick, delay)
      }
      animationRef.current = window.setTimeout(tick, 80)
    },
    [stopAnimation]
  )

  const handleSolve = useCallback(
    (animate: boolean) => {
      if (conflicts.size > 0) {
        setStatus({
          kind: "conflict",
          message: "请先修正标红的冲突格子，再自动填写。",
        })
        return
      }

      const cluesOnly = cloneGrid(grid)
      for (const key of filledKeys) {
        const [row, col] = key.split("-").map(Number)
        cluesOnly[row][col] = 0
      }

      const result = solve(cluesOnly)
      if (!result.ok) {
        setStatus({ kind: "error", message: result.message })
        return
      }
      fillSolution(cluesOnly, result.steps, animate)
    },
    [conflicts.size, fillSolution, filledKeys, grid]
  )

  const handleClear = useCallback(() => {
    applyPuzzle(emptyGrid())
    setPasteText("")
    setSelected({ row: 0, col: 0 })
  }, [applyPuzzle])

  const handleClearFilled = useCallback(() => {
    stopAnimation()
    const next = cloneGrid(grid)
    for (const key of filledKeys) {
      const [row, col] = key.split("-").map(Number)
      next[row][col] = 0
    }
    setGrid(next)
    setFilledKeys(new Set())
    setStatus(givenCount(next) === 0 ? { kind: "empty" } : { kind: "idle" })
  }, [filledKeys, grid, stopAnimation])

  const handleApplyPaste = useCallback(() => {
    const parsed = parsePuzzle(pasteText)
    if (!parsed.ok) {
      setPasteError(parsed.message)
      setStatus({ kind: "error", message: parsed.message })
      return
    }
    applyPuzzle(parsed.grid)
    setPasteText(formatPuzzle(parsed.grid))
  }, [applyPuzzle, pasteText])

  useEffect(() => {
    return () => stopAnimation()
  }, [stopAnimation])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) {
        return
      }

      if (event.key >= "1" && event.key <= "9") {
        event.preventDefault()
        enterDigit(Number(event.key) as Digit)
        return
      }
      if (
        event.key === "0" ||
        event.key === "Backspace" ||
        event.key === "Delete" ||
        event.key === " "
      ) {
        event.preventDefault()
        enterDigit(0)
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        moveSelection(-1, 0)
      } else if (event.key === "ArrowDown") {
        event.preventDefault()
        moveSelection(1, 0)
      } else if (event.key === "ArrowLeft") {
        event.preventDefault()
        moveSelection(0, -1)
      } else if (event.key === "ArrowRight") {
        event.preventDefault()
        moveSelection(0, 1)
      } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        handleSolve(true)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [enterDigit, handleSolve, moveSelection])

  return (
    <div className="relative min-h-full overflow-hidden bg-[oklch(0.97_0.012_85)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_circle_at_12%_-10%,oklch(0.93_0.03_75),transparent_55%),radial-gradient(900px_circle_at_100%_0%,oklch(0.93_0.02_160),transparent_46%)]" />
      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl space-y-3">
            <Badge variant="secondary">9×9 标准数独</Badge>
            <div className="space-y-2">
              <h1 className="font-heading text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
                数独自动填写
              </h1>
              <p className="text-base leading-7 text-stone-600">
                在棋盘上点选格子，输入已知数字；也可以粘贴 81 个字符的题目。点
                「自动填写」后，程序会用回溯算法补全剩余空格。
              </p>
            </div>
          </div>
          <p className="text-sm text-stone-500">
            键盘：1-9 填数，方向键移动，Backspace 清空
          </p>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="space-y-4">
            <div ref={boardRef} className="mx-auto w-full max-w-[560px]">
              <SudokuBoard
                grid={grid}
                selected={selected}
                conflicts={conflicts}
                givenKeys={givenKeys}
                filledKeys={filledKeys}
                disabled={isSolving}
                onSelect={(row, col) => setSelected({ row, col })}
              />
            </div>

            <div className="mx-auto grid w-full max-w-[560px] grid-cols-5 gap-2 sm:hidden">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                <Button
                  key={digit}
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-11 text-base font-semibold"
                  disabled={isSolving}
                  onClick={() => enterDigit(digit as Digit)}
                >
                  {digit}
                </Button>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="h-11"
                disabled={isSolving}
                onClick={() => enterDigit(0)}
              >
                <Eraser data-icon="inline-start" />
                清除
              </Button>
            </div>

            <StatusBanner status={status} clues={clues} conflicts={conflicts.size} />

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                type="button"
                size="lg"
                disabled={isSolving}
                onClick={() => handleSolve(true)}
              >
                {isSolving ? (
                  <LoaderCircle data-icon="inline-start" className="animate-spin" />
                ) : (
                  <WandSparkles data-icon="inline-start" />
                )}
                {isSolving ? "正在填写…" : "自动填写"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={isSolving}
                onClick={() => handleSolve(false)}
              >
                <Sparkles data-icon="inline-start" />
                立即填完
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                disabled={isSolving || filledKeys.size === 0}
                onClick={handleClearFilled}
              >
                <RotateCcw data-icon="inline-start" />
                只清填写
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                disabled={isSolving}
                onClick={handleClear}
              >
                <Eraser data-icon="inline-start" />
                清空棋盘
              </Button>
            </div>
          </section>

          <aside className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>手动输入</CardTitle>
                <CardDescription>
                  点选格子后用键盘或下方数字键写入 1-9。空位保持空白即可。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="hidden grid-cols-5 gap-2 sm:grid">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                    <Button
                      key={digit}
                      type="button"
                      variant="outline"
                      disabled={isSolving}
                      onClick={() => enterDigit(digit as Digit)}
                    >
                      {digit}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isSolving}
                    onClick={() => enterDigit(0)}
                  >
                    空
                  </Button>
                </div>
                <p className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
                  <Keyboard className="mt-0.5 size-4 shrink-0" />
                  当前选中第 {selected.row + 1} 行第 {selected.col + 1} 列。
                  已知数字会加粗，自动填写的数字显示为青色。
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>样例题目</CardTitle>
                <CardDescription>
                  不想从零输入时，可以先载入一道题再求解。
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {SAMPLE_PUZZLES.map((puzzle) => (
                  <Button
                    key={puzzle.id}
                    type="button"
                    variant="outline"
                    className="h-auto justify-start py-2 whitespace-normal"
                    disabled={isSolving}
                    onClick={() => {
                      const parsed = parsePuzzle(puzzle.data)
                      if (parsed.ok) applyPuzzle(parsed.grid, { note: puzzle.name })
                    }}
                  >
                    <span className="flex flex-col items-start gap-0.5 text-left">
                      <span className="font-medium text-foreground">{puzzle.name}</span>
                      <span className="text-xs text-muted-foreground">{puzzle.hint}</span>
                    </span>
                  </Button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>粘贴题目</CardTitle>
                <CardDescription>
                  支持 81 位数字，空位可用 0、点号、空格或换行分隔。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={pasteText}
                  onChange={(event) => {
                    setPasteText(event.target.value)
                    setPasteError(null)
                  }}
                  spellCheck={false}
                  className="min-h-40 font-mono text-sm"
                  placeholder={"530070000\n600195000\n098000060\n..."}
                  aria-invalid={Boolean(pasteError)}
                />
                {pasteError ? (
                  <p className="text-sm text-destructive">{pasteError}</p>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    disabled={isSolving || pasteText.trim().length === 0}
                    onClick={handleApplyPaste}
                  >
                    应用到棋盘
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSolving}
                    onClick={() => setPasteText(formatPuzzle(grid))}
                  >
                    导出当前盘
                  </Button>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  )
}

function StatusBanner({
  status,
  clues,
  conflicts,
}: {
  status: Status
  clues: number
  conflicts: number
}) {
  const tone =
    status.kind === "error" || status.kind === "conflict"
      ? "border-red-200 bg-red-50 text-red-800"
      : status.kind === "solved"
        ? "border-teal-200 bg-teal-50 text-teal-900"
        : status.kind === "solving"
          ? "border-amber-200 bg-amber-50 text-amber-950"
          : "border-stone-200 bg-white/80 text-stone-700"

  const message =
    status.kind === "empty"
      ? "棋盘为空。输入已知数字，或载入一道样例后再自动填写。"
      : status.kind === "idle"
        ? `已输入 ${clues} 个已知数字。确认无误后即可自动填写。`
        : status.kind === "conflict"
          ? status.message
          : status.kind === "error"
            ? status.message
            : status.kind === "solving"
              ? `正在填写空格 ${status.filled} / ${status.total}…`
              : `填写完成，补全了 ${status.filled} 个空格。`

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-xl border px-4 py-3 text-sm leading-6 ${tone}`}
    >
      {message}
      {conflicts > 0 && status.kind !== "conflict" ? (
        <span> 当前有 {conflicts} 个冲突格子。</span>
      ) : null}
    </div>
  )
}
