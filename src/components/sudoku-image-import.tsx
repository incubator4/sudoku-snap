"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, ImageUp, LoaderCircle, ClipboardPaste } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { fromRgba, type GrayImage } from "@/lib/gray-image"
import { grayToRgba, overlayGridLines, recognizeSudoku } from "@/lib/recognize-sudoku"
import { formatPuzzle, type Grid } from "@/lib/sudoku"

type ImageImportState =
  | { kind: "idle" }
  | { kind: "working"; message: string }
  | {
      kind: "ready"
      grid: Grid
      givenCount: number
      previewUrl: string
      fileName: string
    }
  | { kind: "error"; message: string; previewUrl?: string }

export function SudokuImageImport({
  disabled = false,
  onApply,
}: {
  disabled?: boolean
  onApply: (grid: Grid, note?: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<ImageImportState>({ kind: "idle" })
  const [dragOver, setDragOver] = useState(false)

  const recognizeFile = useCallback(async (file: File) => {
    setState({ kind: "working", message: "正在读取图片并查找棋盘…" })
    try {
      if (!file.type.startsWith("image/")) {
        setState({ kind: "error", message: "请选择图片文件（拍照或截图均可）。" })
        return
      }
      const gray = await fileToGray(file)
      setState({ kind: "working", message: "正在识别格子中的数字…" })
      await yieldFrame()
      const result = recognizeSudoku(gray)
      const preview = result.warped
        ? grayToDataUrl(overlayGridLines(result.warped))
        : undefined
      if (!result.ok) {
        setState({
          kind: "error",
          message: result.message,
          previewUrl: preview,
        })
        return
      }
      setState({
        kind: "ready",
        grid: result.grid,
        givenCount: result.givenCount,
        previewUrl: preview ?? grayToDataUrl(result.warped),
        fileName: file.name || "数独照片",
      })
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "图片识别失败，请换一张更清晰的照片再试。",
      })
    }
  }, [])

  const handleFiles = useCallback(
    (files: FileList | File[] | null) => {
      const file = files?.[0]
      if (file) void recognizeFile(file)
    },
    [recognizeFile]
  )

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return
      const files = event.clipboardData?.files
      if (!files || files.length === 0) return
      if (![...files].some((file) => file.type.startsWith("image/"))) return
      event.preventDefault()
      handleFiles(files)
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [handleFiles])

  const handlePaste = useCallback(
    async (event?: React.ClipboardEvent) => {
      const clipboardFiles = event?.clipboardData?.files
      if (clipboardFiles && clipboardFiles.length > 0) {
        handleFiles(clipboardFiles)
        return
      }
      try {
        if (!navigator.clipboard?.read) {
          setState({
            kind: "error",
            message: "当前浏览器不允许读取剪贴板，请改用上传或拖放图片。",
          })
          return
        }
        const items = await navigator.clipboard.read()
        for (const item of items) {
          const type = item.types.find((value) => value.startsWith("image/"))
          if (!type) continue
          const blob = await item.getType(type)
          const file = new File([blob], "clipboard.png", { type: blob.type })
          await recognizeFile(file)
          return
        }
        setState({
          kind: "error",
          message: "剪贴板里没有图片。可以先截图再点「粘贴图片」。",
        })
      } catch {
        setState({
          kind: "error",
          message: "无法读取剪贴板，请改用上传或拖放图片。",
        })
      }
    },
    [handleFiles, recognizeFile]
  )

  const busy = disabled || state.kind === "working"

  return (
    <Card>
      <CardHeader>
        <CardTitle>图片识别</CardTitle>
        <CardDescription>
          上传、拍照或粘贴数独照片。程序会找出 9×9 棋盘并读出已知数字，识别后仍可在棋盘上改正。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            handleFiles(event.target.files)
            event.target.value = ""
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            handleFiles(event.target.files)
            event.target.value = ""
          }}
        />

        <div
          role="button"
          tabIndex={0}
          onPaste={(event) => {
            if (event.clipboardData.files.length > 0) {
              event.preventDefault()
              handleFiles(event.clipboardData.files)
            }
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragOver(false)
            handleFiles(event.dataTransfer.files)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              fileRef.current?.click()
            }
          }}
          className={`rounded-lg border border-dashed px-3 py-4 text-center text-sm transition-colors ${
            dragOver
              ? "border-stone-700 bg-amber-50"
              : "border-stone-300 bg-stone-50/70"
          }`}
        >
          {state.kind === "working" ? (
            <p className="flex items-center justify-center gap-2 text-stone-700">
              <LoaderCircle className="size-4 animate-spin" />
              {state.message}
            </p>
          ) : (
            <p className="text-muted-foreground">
              把照片拖到这里，或使用下方按钮。拍摄时尽量让棋盘充满画面。
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <ImageUp data-icon="inline-start" />
            上传图片
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
          >
            <Camera data-icon="inline-start" />
            拍照
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void handlePaste()}
          >
            <ClipboardPaste data-icon="inline-start" />
            粘贴图片
          </Button>
        </div>

        {state.kind === "ready" || (state.kind === "error" && state.previewUrl) ? (
          <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.previewUrl}
              alt="识别到的数独棋盘"
              className="mx-auto max-h-56 w-full object-contain"
            />
          </div>
        ) : null}

        {state.kind === "ready" ? (
          <div className="space-y-2">
            <p className="text-sm leading-6 text-stone-600">
              从「{state.fileName}」识别到 {state.givenCount} 个已知数字。
              {state.givenCount < 17
                ? " 线索偏少，建议核对后补全漏识的格子。"
                : " 可先应用到棋盘，再改正个别误识。"}
            </p>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                onApply(state.grid, formatPuzzle(state.grid))
              }}
            >
              应用到棋盘
            </Button>
          </div>
        ) : null}

        {state.kind === "error" ? (
          <p className="text-sm text-destructive">{state.message}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

async function fileToGray(file: File): Promise<GrayImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  try {
    const maxDim = 1200
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("当前浏览器无法处理图片。")
    ctx.drawImage(bitmap, 0, 0, width, height)
    const imageData = ctx.getImageData(0, 0, width, height)
    return fromRgba(imageData.data, width, height)
  } finally {
    bitmap.close()
  }
}

function grayToDataUrl(image: GrayImage): string {
  const canvas = document.createElement("canvas")
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""
  const imageData = ctx.createImageData(image.width, image.height)
  imageData.data.set(grayToRgba(image))
  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL("image/png")
}

function yieldFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 16)
  })
}
