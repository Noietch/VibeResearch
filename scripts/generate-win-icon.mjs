import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const iconsetDir = path.join(rootDir, 'assets', 'icon.iconset');
const outputPath = path.join(rootDir, 'assets', 'icon.ico');

const candidateFiles = [
  'icon_16x16.png',
  'icon_32x32.png',
  'icon_32x32@2x.png',
  'icon_128x128.png',
  'icon_256x256.png',
];

function assertPng(buffer, filePath) {
  const signature = buffer.subarray(0, 8);
  const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!signature.equals(expected)) {
    throw new Error(`Expected a PNG file: ${filePath}`);
  }
}

function readPngSize(buffer, filePath) {
  assertPng(buffer, filePath);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(images.length * 16);
  let offset = header.length + directory.length;

  for (const [index, image] of images.entries()) {
    const entryOffset = index * 16;
    directory.writeUInt8(image.width >= 256 ? 0 : image.width, entryOffset);
    directory.writeUInt8(image.height >= 256 ? 0 : image.height, entryOffset + 1);
    directory.writeUInt8(0, entryOffset + 2);
    directory.writeUInt8(0, entryOffset + 3);
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(32, entryOffset + 6);
    directory.writeUInt32LE(image.buffer.length, entryOffset + 8);
    directory.writeUInt32LE(offset, entryOffset + 12);
    offset += image.buffer.length;
  }

  return Buffer.concat([header, directory, ...images.map((image) => image.buffer)]);
}

function main() {
  const seenSizes = new Set();
  const images = [];

  for (const fileName of candidateFiles) {
    const filePath = path.join(iconsetDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing icon source: ${filePath}`);
    }

    const buffer = fs.readFileSync(filePath);
    const { width, height } = readPngSize(buffer, filePath);

    if (width !== height) {
      throw new Error(`ICO source must be square: ${filePath}`);
    }
    if (width > 256) {
      throw new Error(`ICO source is too large for ICO entry: ${filePath}`);
    }
    if (seenSizes.has(width)) {
      continue;
    }

    seenSizes.add(width);
    images.push({ width, height, buffer });
  }

  images.sort((a, b) => a.width - b.width);

  if (!images.some((image) => image.width === 256)) {
    throw new Error('Windows ICO must include a 256x256 image');
  }

  fs.writeFileSync(outputPath, buildIco(images));
  console.log(
    `Generated ${path.relative(rootDir, outputPath)} with sizes: ${images.map((image) => `${image.width}x${image.height}`).join(', ')}`,
  );
}

main();
