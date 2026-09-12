export type SamplePuzzle = {
  id: string
  name: string
  hint: string
  data: string
}

export const SAMPLE_PUZZLES: SamplePuzzle[] = [
  {
    id: "easy",
    name: "入门",
    hint: "已知数字较多，适合试手",
    data: "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
  },
  {
    id: "medium",
    name: "中等",
    hint: "需要一些推理",
    data: "000260701680070090190004500820100040004602900050003028009300074040050036703018000",
  },
  {
    id: "hard",
    name: "困难",
    hint: "线索很少，回溯也能秒出",
    data: "800000000003600000070090200050007000000045700000100030001000068008500010090000400",
  },
]
