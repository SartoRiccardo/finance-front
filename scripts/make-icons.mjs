// One-off: draws a minimal euro glyph on a solid tile, writes public/icons/icon-{192,512}.png
// Run: node scripts/make-icons.mjs
import { crc32, deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const BG = [0x17, 0x17, 0x17]
const FG = [0xff, 0xff, 0xff]

const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, coverage) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  let o = 0
  for (let y = 0; y < size; y++) {
    raw[o++] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const k = coverage(x, y) / 4 // 2x2 supersample
      for (let i = 0; i < 3; i++) raw[o++] = Math.round(BG[i] + (FG[i] - BG[i]) * k)
      raw[o++] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

function euro(size) {
  const c = size / 2
  const R = 0.28 * size // ring radius
  const t = 0.09 * size // stroke thickness
  const gap = (55 * Math.PI) / 180 // opening of the C, facing right
  const barH = 0.075 * size
  const barX = [c - 0.36 * size, c + 0.12 * size]
  const barOff = 0.13 * size
  return (x, y) => {
    let inside = 0
    for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const px = x + dx - c
      const py = y + dy - c
      if (Math.abs(Math.hypot(px, py) - R) <= t / 2 && Math.abs(Math.atan2(py, px)) > gap) inside++
      for (const off of [-barOff, barOff]) {
        if (px >= barX[0] - c && px <= barX[1] - c && Math.abs(py - off) <= barH / 2) inside++
      }
    }
    return inside
  }
}

const out = path.resolve(import.meta.dirname, '../public/icons')
mkdirSync(out, { recursive: true })
for (const size of [192, 512]) writeFileSync(path.join(out, `icon-${size}.png`), png(size, euro(size)))
console.log('wrote', out)
