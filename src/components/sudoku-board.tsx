"use client"

import { cellKey, type Digit, type Grid } from "@/lib/sudoku"
import { cn } from "@/lib/utils"

type SudokuBoardProps = {
  grid: Grid
  selected: { row: number; col: number } | null
  conflicts: Set<string>
  givenKeys: Set<string>
  filledKeys: Set<string>
  disabled?: boolean
  onSelect: (row: number, col: number) => void
}

export function SudokuBoard({
  grid,
  selected,
  conflicts,
  givenKeys,
  filledKeys,
  disabled = false,
  onSelect,
}: SudokuBoardProps) {
  const selectedValue =
    selected === null ? 0 : grid[selected.row][selected.col]

  return (
    <div
      role="grid"
      aria-label="数独棋盘"
      aria-rowcount={9}
      aria-colcount={9}
      className="grid aspect-square w-full grid-cols-9 overflow-hidden rounded-lg border-[3px] border-foreground bg-white shadow-[0_18px_50px_-28px_rgba(28,25,23,0.45)]"
    >
      {grid.map((row, rowIndex) =>
        row.map((value, colIndex) => {
          const key = cellKey(rowIndex, colIndex)
          const isSelected =
            selected?.row === rowIndex && selected?.col === colIndex
          const isConflict = conflicts.has(key)
          const isGiven = givenKeys.has(key)
          const isFilled = filledKeys.has(key)
          const isSameNumber =
            selectedValue !== 0 && value === selectedValue && !isSelected
          const isSameUnit =
            selected !== null &&
            !isSelected &&
            (selected.row === rowIndex ||
              selected.col === colIndex ||
              (Math.floor(selected.row / 3) === Math.floor(rowIndex / 3) &&
                Math.floor(selected.col / 3) === Math.floor(colIndex / 3)))
          const boxTint =
            (Math.floor(rowIndex / 3) + Math.floor(colIndex / 3)) % 2 === 1

          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              aria-rowindex={rowIndex + 1}
              aria-colindex={colIndex + 1}
              aria-selected={isSelected}
              aria-invalid={isConflict}
              aria-label={`第 ${rowIndex + 1} 行第 ${colIndex + 1} 列${value ? `，${value}` : "，空"}}`}
              disabled={disabled}
              onClick={() => onSelect(rowIndex, colIndex)}
              className={cn(
                "relative flex aspect-square items-center justify-center border-r border-b border-stone-300 text-[clamp(1.05rem,3.6vw,1.55rem)] leading-none transition-colors",
                colIndex % 3 === 2 && colIndex !== 8 && "border-r-[3px] border-r-foreground",
                rowIndex % 3 === 2 && rowIndex !== 8 && "border-b-[3px] border-b-foreground",
                boxTint ? "bg-stone-50" : "bg-white",
                isSameUnit && "bg-amber-50/80",
                isSameNumber && "bg-sky-100",
                isSelected && "z-10 bg-amber-200 ring-2 ring-inset ring-amber-700",
                isConflict && "bg-red-100 text-red-700 ring-2 ring-inset ring-red-500",
                isGiven && !isConflict && "font-bold text-stone-900",
                isFilled && !isConflict && "font-semibold text-teal-700",
                !isGiven && !isFilled && value !== 0 && !isConflict && "font-medium text-stone-800",
                disabled && "cursor-default"
              )}
            >
              {value === 0 ? "" : (value as Digit)}
            </button>
          )
        })
      )}
    </div>
  )
}
