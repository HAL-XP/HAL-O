/**
 * Generate icon.png (multiple sizes) and icon.ico from icon.svg
 * Uses the `canvas` npm package (already installed).
 *
 * Run:  node _scripts/generate-icons.js
 */

const fs = require('fs')
const path = require('path')
const { createCanvas, loadImage } = require('canvas')

const RESOURCES = path.join(__dirname, '..', 'resources')
const SVG_PATH = path.join(RESOURCES, 'icon.svg')

// Sizes to generate (the 256 is the main icon.png)
const SIZES = [16, 32, 48, 64, 128, 256]

async function renderSvgAtSize(svgBuffer, size) {
  // Scale the SVG by wrapping it with explicit width/height
  const svgStr = svgBuffer
    .toString('utf8')
    .replace(/width="128"/, `width="${size}"`)
    .replace(/height="128"/, `height="${size}"`)

  const img = await loadImage(Buffer.from(svgStr))
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  // Dark background for icon visibility (matches app theme)
  ctx.fillStyle = '#0a0e17'
  ctx.fillRect(0, 0, size, size)

  ctx.drawImage(img, 0, 0, size, size)
  return canvas.toBuffer('image/png')
}

/**
 * Build a minimal ICO file from multiple PNG buffers.
 * ICO format: https://en.wikipedia.org/wiki/ICO_(file_format)
 */
function buildIco(pngBuffers, sizes) {
  const count = pngBuffers.length
  // ICO header: 6 bytes
  const headerSize = 6
  // Each directory entry: 16 bytes
  const dirSize = 16 * count
  const dataOffset = headerSize + dirSize

  // Calculate total size
  let totalDataSize = 0
  for (const buf of pngBuffers) totalDataSize += buf.length
  const totalSize = dataOffset + totalDataSize

  const ico = Buffer.alloc(totalSize)

  // ICO Header
  ico.writeUInt16LE(0, 0)      // Reserved
  ico.writeUInt16LE(1, 2)      // Type: 1 = ICO
  ico.writeUInt16LE(count, 4)  // Number of images

  let currentOffset = dataOffset
  for (let i = 0; i < count; i++) {
    const size = sizes[i]
    const pngBuf = pngBuffers[i]
    const entryOffset = headerSize + i * 16

    ico.writeUInt8(size >= 256 ? 0 : size, entryOffset + 0)  // Width (0 = 256)
    ico.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1)  // Height (0 = 256)
    ico.writeUInt8(0, entryOffset + 2)   // Color palette
    ico.writeUInt8(0, entryOffset + 3)   // Reserved
    ico.writeUInt16LE(1, entryOffset + 4)  // Color planes
    ico.writeUInt16LE(32, entryOffset + 6) // Bits per pixel
    ico.writeUInt32LE(pngBuf.length, entryOffset + 8)  // Size of image data
    ico.writeUInt32LE(currentOffset, entryOffset + 12)  // Offset to image data

    pngBuf.copy(ico, currentOffset)
    currentOffset += pngBuf.length
  }

  return ico
}

async function main() {
  const svgBuffer = fs.readFileSync(SVG_PATH)
  console.log('Loaded SVG from', SVG_PATH)

  const pngBuffers = {}

  for (const size of SIZES) {
    const png = await renderSvgAtSize(svgBuffer, size)
    const filename = size === 256 ? 'icon.png' : `icon_${size}.png`
    const outPath = path.join(RESOURCES, filename)
    fs.writeFileSync(outPath, png)
    pngBuffers[size] = png
    console.log(`  ${filename} (${size}x${size}) — ${png.length} bytes`)
  }

  // Also copy 256 as icon_256.png
  fs.writeFileSync(path.join(RESOURCES, 'icon_256.png'), pngBuffers[256])
  console.log('  icon_256.png (copy of icon.png)')

  // Build ICO with 16, 32, 48, 256
  const icoSizes = [16, 32, 48, 256]
  const icoPngs = icoSizes.map(s => pngBuffers[s])
  const icoBuffer = buildIco(icoPngs, icoSizes)
  const icoPath = path.join(RESOURCES, 'icon.ico')
  fs.writeFileSync(icoPath, icoBuffer)
  console.log(`  icon.ico (${icoSizes.join(', ')}) — ${icoBuffer.length} bytes`)

  console.log('\nDone! All icons generated.')
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
