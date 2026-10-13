/** Compare immutable source PNGs; no resizing, registration, masks or pixel edits. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

const [reference = 'design/figma-390.png', actual = 'design/browser-390.png'] =
  process.argv.slice(2)
const first = PNG.sync.read(readFileSync(reference))
const second = PNG.sync.read(readFileSync(actual))
if (first.width !== second.width || first.height !== second.height) {
  throw new Error(
    `Different dimensions: ${first.width}x${first.height} vs ${second.width}x${second.height}`,
  )
}
const { width, height } = first
const diff = new PNG({ width, height })
const differing = pixelmatch(first.data, second.data, diff.data, width, height, {
  threshold: 0.1,
  includeAA: false,
})
let channelError = 0
let exactPixels = 0
for (let offset = 0; offset < first.data.length; offset += 4) {
  let same = true
  for (let channel = 0; channel < 3; channel++) {
    const error = Math.abs(first.data[offset + channel] - second.data[offset + channel])
    channelError += error
    if (error) same = false
  }
  if (same) exactPixels++
}
mkdirSync('test-results/design', { recursive: true })
writeFileSync('test-results/design/diff.png', PNG.sync.write(diff))
console.log(
  JSON.stringify(
    {
      reference,
      actual,
      width,
      height,
      pixelmatch: {
        threshold: 0.1,
        includeAA: false,
        differingPixels: differing,
        differencePercent: (differing / (width * height)) * 100,
      },
      exactPixelsPercent: (exactPixels / (width * height)) * 100,
      meanAbsoluteChannelError: channelError / (width * height * 3),
      note: 'A diagnostic, not an automatic certification of the assignment’s 99% requirement. Inspect the diff and geometry.',
    },
    null,
    2,
  ),
)
