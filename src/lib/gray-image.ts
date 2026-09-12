export type Point = { x: number; y: number }
export type Quad = [Point, Point, Point, Point]

export type GrayImage = {
  width: number
  height: number
  /** Row-major, 0 = black, 255 = white. */
  pixels: Uint8Array
}

export function createGray(width: number, height: number, fill = 255): GrayImage {
  return { width, height, pixels: new Uint8Array(width * height).fill(fill) }
}

export function cloneGray(image: GrayImage): GrayImage {
  return {
    width: image.width,
    height: image.height,
    pixels: new Uint8Array(image.pixels),
  }
}

export function at(image: GrayImage, x: number, y: number): number {
  return image.pixels[y * image.width + x]
}

export function setPixel(image: GrayImage, x: number, y: number, value: number): void {
  image.pixels[y * image.width + x] = value
}

export function fromRgba(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): GrayImage {
  const pixels = new Uint8Array(width * height)
  for (let i = 0; i < pixels.length; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    pixels[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }
  return { width, height, pixels }
}

export function crop(
  image: GrayImage,
  x0: number,
  y0: number,
  width: number,
  height: number
): GrayImage {
  const srcX = Math.max(0, Math.floor(x0))
  const srcY = Math.max(0, Math.floor(y0))
  const w = Math.max(1, Math.min(width, image.width - srcX))
  const h = Math.max(1, Math.min(height, image.height - srcY))
  const out = createGray(w, h, 255)
  for (let y = 0; y < h; y++) {
    const srcOff = (srcY + y) * image.width + srcX
    out.pixels.set(image.pixels.subarray(srcOff, srcOff + w), y * w)
  }
  return out
}

export function resizeMax(image: GrayImage, maxDim: number): GrayImage {
  const longest = Math.max(image.width, image.height)
  if (longest <= maxDim) return image
  const scale = maxDim / longest
  return resize(
    image,
    Math.max(1, Math.round(image.width * scale)),
    Math.max(1, Math.round(image.height * scale))
  )
}

export function resize(image: GrayImage, width: number, height: number): GrayImage {
  if (image.width === width && image.height === height) return image
  const out = createGray(width, height, 0)
  const xRatio = image.width / width
  const yRatio = image.height / height
  const downsample = xRatio >= 1 && yRatio >= 1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (downsample) {
        const x0 = Math.floor(x * xRatio)
        const y0 = Math.floor(y * yRatio)
        const x1 = Math.max(x0 + 1, Math.floor((x + 1) * xRatio))
        const y1 = Math.max(y0 + 1, Math.floor((y + 1) * yRatio))
        let sum = 0
        let count = 0
        for (let sy = y0; sy < Math.min(image.height, y1); sy++) {
          for (let sx = x0; sx < Math.min(image.width, x1); sx++) {
            sum += at(image, sx, sy)
            count += 1
          }
        }
        setPixel(out, x, y, count === 0 ? 255 : Math.round(sum / count))
      } else {
        setPixel(out, x, y, sampleBilinear(image, (x + 0.5) * xRatio - 0.5, (y + 0.5) * yRatio - 0.5))
      }
    }
  }
  return out
}

export function sampleBilinear(image: GrayImage, x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = x0 + 1
  const y1 = y0 + 1
  const fx = x - x0
  const fy = y - y0
  const v00 = atClamped(image, x0, y0)
  const v10 = atClamped(image, x1, y0)
  const v01 = atClamped(image, x0, y1)
  const v11 = atClamped(image, x1, y1)
  return (1 - fy) * ((1 - fx) * v00 + fx * v10) + fy * ((1 - fx) * v01 + fx * v11)
}

function atClamped(image: GrayImage, x: number, y: number): number {
  const cx = Math.min(image.width - 1, Math.max(0, x))
  const cy = Math.min(image.height - 1, Math.max(0, y))
  return at(image, cx, cy)
}

export function blur3(image: GrayImage): GrayImage {
  const tmp = createGray(image.width, image.height, 0)
  const out = createGray(image.width, image.height, 0)
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const left = atClamped(image, x - 1, y)
      const mid = at(image, x, y)
      const right = atClamped(image, x + 1, y)
      setPixel(tmp, x, y, (left + mid * 2 + right) / 4)
    }
  }
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const up = atClamped(tmp, x, y - 1)
      const mid = at(tmp, x, y)
      const down = atClamped(tmp, x, y + 1)
      setPixel(out, x, y, Math.round((up + mid * 2 + down) / 4))
    }
  }
  return out
}

export function adaptiveThreshold(image: GrayImage, windowRatio = 8, t = 0.12): GrayImage {
  const integral = buildIntegral(image)
  const window = Math.max(8, Math.round(Math.max(image.width, image.height) / windowRatio) | 1)
  const radius = Math.floor(window / 2)
  const out = createGray(image.width, image.height, 255)

  for (let y = 0; y < image.height; y++) {
    const y0 = Math.max(0, y - radius)
    const y1 = Math.min(image.height, y + radius + 1)
    for (let x = 0; x < image.width; x++) {
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(image.width, x + radius + 1)
      const count = (x1 - x0) * (y1 - y0)
      const sum = rectSum(integral, image.width, x0, y0, x1, y1)
      const mean = sum / count
      const dark = at(image, x, y) < mean * (1 - t)
      setPixel(out, x, y, dark ? 0 : 255)
    }
  }
  return out
}

export function otsuThreshold(image: GrayImage): number {
  const hist = new Array<number>(256).fill(0)
  for (const value of image.pixels) hist[value] += 1
  const total = image.pixels.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]

  let sumB = 0
  let wB = 0
  let best = 0
  let threshold = 127

  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > best) {
      best = between
      threshold = t
    }
  }
  return threshold
}

export function binarize(image: GrayImage, threshold: number): GrayImage {
  const out = createGray(image.width, image.height, 255)
  for (let i = 0; i < image.pixels.length; i++) {
    out.pixels[i] = image.pixels[i] < threshold ? 0 : 255
  }
  return out
}

export function invert(image: GrayImage): GrayImage {
  const out = createGray(image.width, image.height, 0)
  for (let i = 0; i < image.pixels.length; i++) {
    out.pixels[i] = 255 - image.pixels[i]
  }
  return out
}

export function dilate(image: GrayImage, radius = 1): GrayImage {
  const out = createGray(image.width, image.height, 255)
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      let dark = false
      for (let dy = -radius; dy <= radius && !dark; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (atClamped(image, x + dx, y + dy) < 128) {
            dark = true
            break
          }
        }
      }
      setPixel(out, x, y, dark ? 0 : 255)
    }
  }
  return out
}

export function erode(image: GrayImage, radius = 1): GrayImage {
  const out = createGray(image.width, image.height, 255)
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      let allDark = true
      for (let dy = -radius; dy <= radius && allDark; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (atClamped(image, x + dx, y + dy) >= 128) {
            allDark = false
            break
          }
        }
      }
      setPixel(out, x, y, allDark ? 0 : 255)
    }
  }
  return out
}

export function close(image: GrayImage, radius = 1): GrayImage {
  return erode(dilate(image, radius), radius)
}

export type Component = {
  id: number
  area: number
  minX: number
  minY: number
  maxX: number
  maxY: number
  tl: Point
  tr: Point
  br: Point
  bl: Point
}

export function connectedComponents(binary: GrayImage, dark = true): Component[] {
  const w = binary.width
  const h = binary.height
  const n = w * h
  const parent = new Int32Array(n)
  parent.fill(-1)

  const isInk = (i: number) => (dark ? binary.pixels[i] < 128 : binary.pixels[i] >= 128)

  const find = (i: number): number => {
    let root = i
    while (parent[root] !== root) root = parent[root]
    let cur = i
    while (parent[cur] !== root) {
      const next = parent[cur]
      parent[cur] = root
      cur = next
    }
    return root
  }

  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  for (let i = 0; i < n; i++) {
    if (!isInk(i)) continue
    parent[i] = i
    const x = i % w
    const y = (i / w) | 0
    if (x > 0 && isInk(i - 1)) union(i, i - 1)
    if (y > 0 && isInk(i - w)) union(i, i - w)
  }

  const comps = new Map<number, Component>()
  for (let i = 0; i < n; i++) {
    if (parent[i] < 0) continue
    const id = find(i)
    const x = i % w
    const y = (i / w) | 0
    let comp = comps.get(id)
    if (!comp) {
      comp = {
        id,
        area: 0,
        minX: x,
        minY: y,
        maxX: x,
        maxY: y,
        tl: { x, y },
        tr: { x, y },
        br: { x, y },
        bl: { x, y },
      }
      comps.set(id, comp)
    }
    comp.area += 1
    if (x < comp.minX) comp.minX = x
    if (y < comp.minY) comp.minY = y
    if (x > comp.maxX) comp.maxX = x
    if (y > comp.maxY) comp.maxY = y
    if (x + y < comp.tl.x + comp.tl.y) comp.tl = { x, y }
    if (x - y > comp.tr.x - comp.tr.y) comp.tr = { x, y }
    if (x + y > comp.br.x + comp.br.y) comp.br = { x, y }
    if (y - x > comp.bl.y - comp.bl.x) comp.bl = { x, y }
  }

  return [...comps.values()]
}

export function longRunMask(binary: GrayImage, minFrac = 0.18): GrayImage {
  const out = createGray(binary.width, binary.height, 255)
  const minH = Math.max(8, Math.round(binary.width * minFrac))
  const minV = Math.max(8, Math.round(binary.height * minFrac))

  for (let y = 0; y < binary.height; y++) {
    let x = 0
    while (x < binary.width) {
      while (x < binary.width && at(binary, x, y) >= 128) x += 1
      const start = x
      while (x < binary.width && at(binary, x, y) < 128) x += 1
      if (x - start >= minH) {
        for (let i = start; i < x; i++) setPixel(out, i, y, 0)
      }
    }
  }

  for (let x = 0; x < binary.width; x++) {
    let y = 0
    while (y < binary.height) {
      while (y < binary.height && at(binary, x, y) >= 128) y += 1
      const start = y
      while (y < binary.height && at(binary, x, y) < 128) y += 1
      if (y - start >= minV) {
        for (let i = start; i < y; i++) setPixel(out, x, i, 0)
      }
    }
  }

  return out
}

export function extremaQuad(comp: Component): Quad {
  return [comp.tl, comp.tr, comp.br, comp.bl]
}

export function imageQuad(image: GrayImage): Quad {
  return [
    { x: 0, y: 0 },
    { x: image.width - 1, y: 0 },
    { x: image.width - 1, y: image.height - 1 },
    { x: 0, y: image.height - 1 },
  ]
}

export function quadArea(quad: Quad): number {
  let area = 0
  for (let i = 0; i < 4; i++) {
    const a = quad[i]
    const b = quad[(i + 1) % 4]
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area) / 2
}

export function warpPerspective(
  image: GrayImage,
  srcQuad: Quad,
  width: number,
  height: number
): GrayImage {
  const destQuad: Quad = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ]
  const h = homography(destQuad, srcQuad)
  const out = createGray(width, height, 255)
  if (!h) return out

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [sx, sy] = applyHomography(h, x, y)
      setPixel(out, x, y, sampleBilinear(image, sx, sy))
    }
  }
  return out
}

export function blitPerspective(src: GrayImage, dest: GrayImage, destQuad: Quad): void {
  const srcQuad: Quad = [
    { x: 0, y: 0 },
    { x: src.width - 1, y: 0 },
    { x: src.width - 1, y: src.height - 1 },
    { x: 0, y: src.height - 1 },
  ]
  const h = homography(destQuad, srcQuad)
  if (!h) return
  const minX = Math.max(0, Math.floor(Math.min(...destQuad.map((p) => p.x))))
  const maxX = Math.min(dest.width - 1, Math.ceil(Math.max(...destQuad.map((p) => p.x))))
  const minY = Math.max(0, Math.floor(Math.min(...destQuad.map((p) => p.y))))
  const maxY = Math.min(dest.height - 1, Math.ceil(Math.max(...destQuad.map((p) => p.y))))
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const [sx, sy] = applyHomography(h, x, y)
      if (sx < -0.5 || sy < -0.5 || sx > src.width - 0.5 || sy > src.height - 0.5) continue
      setPixel(dest, x, y, sampleBilinear(src, sx, sy))
    }
  }
}

function homography(from: Quad, to: Quad): number[] | null {
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]
    const u = to[i].x
    const v = to[i].y
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }
  return solveLinear(A, b)
}

function applyHomography(h: number[], x: number, y: number): [number, number] {
  const w = h[6] * x + h[7] * y + 1
  if (Math.abs(w) < 1e-8) return [x, y]
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]
}

function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const m = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row
    }
    if (Math.abs(m[pivot][col]) < 1e-10) return null
    if (pivot !== col) {
      const tmp = m[col]
      m[col] = m[pivot]
      m[pivot] = tmp
    }
    const div = m[col][col]
    for (let j = col; j <= n; j++) m[col][j] /= div
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = m[row][col]
      if (factor === 0) continue
      for (let j = col; j <= n; j++) m[row][j] -= factor * m[col][j]
    }
  }

  return m.map((row) => row[n])
}

function buildIntegral(image: GrayImage): Float64Array {
  const w = image.width
  const h = image.height
  const integral = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let rowSum = 0
    for (let x = 0; x < w; x++) {
      rowSum += at(image, x, y)
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum
    }
  }
  return integral
}

function rectSum(
  integral: Float64Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number {
  const stride = width + 1
  return (
    integral[y1 * stride + x1] -
    integral[y0 * stride + x1] -
    integral[y1 * stride + x0] +
    integral[y0 * stride + x0]
  )
}

export function inkRatio(image: GrayImage): number {
  let dark = 0
  for (const value of image.pixels) {
    if (value < 128) dark += 1
  }
  return dark / image.pixels.length
}

export function contrastRange(image: GrayImage): number {
  let min = 255
  let max = 0
  for (const value of image.pixels) {
    if (value < min) min = value
    if (value > max) max = value
  }
  return max - min
}

export function clearBorderInk(binary: GrayImage): GrayImage {
  const out = cloneGray(binary)
  const w = out.width
  const h = out.height
  const stack: number[] = []
  const pushIfInk = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = y * w + x
    if (out.pixels[i] < 128) {
      out.pixels[i] = 255
      stack.push(i)
    }
  }

  for (let x = 0; x < w; x++) {
    pushIfInk(x, 0)
    pushIfInk(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    pushIfInk(0, y)
    pushIfInk(w - 1, y)
  }

  while (stack.length > 0) {
    const i = stack.pop()!
    const x = i % w
    const y = (i / w) | 0
    pushIfInk(x - 1, y)
    pushIfInk(x + 1, y)
    pushIfInk(x, y - 1)
    pushIfInk(x, y + 1)
  }

  return out
}

export function drawLine(
  image: GrayImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value = 0,
  thickness = 1
): void {
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let x = x0
  let y = y0
  const r = Math.max(0, Math.floor((thickness - 1) / 2))

  while (true) {
    for (let yy = y - r; yy <= y + r; yy++) {
      for (let xx = x - r; xx <= x + r; xx++) {
        if (xx >= 0 && yy >= 0 && xx < image.width && yy < image.height) {
          setPixel(image, xx, yy, value)
        }
      }
    }
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }
}

export function blitGlyph(
  dest: GrayImage,
  glyph: GrayImage,
  x0: number,
  y0: number
): void {
  for (let y = 0; y < glyph.height; y++) {
    for (let x = 0; x < glyph.width; x++) {
      const value = at(glyph, x, y)
      if (value >= 128) continue
      const dx = x0 + x
      const dy = y0 + y
      if (dx >= 0 && dy >= 0 && dx < dest.width && dy < dest.height) {
        setPixel(dest, dx, dy, value)
      }
    }
  }
}
