import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const extensionDir = path.join(root, "extension");
const distDir = path.join(root, "dist");
const packageName = "shield-guardian-extension-v0.1.0.zip";
const outputPath = path.join(distDir, packageName);

const IGNORED_NAMES = new Set([".DS_Store", "Thumbs.db"]);

function makeCrcTable() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUInt16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function writeUInt32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

async function collectFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (IGNORED_NAMES.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath, relativePath)));
    } else if (entry.isFile()) {
      files.push({
        absolutePath,
        zipPath: relativePath.replaceAll("\\", "/"),
      });
    }
  }

  return files.sort((left, right) => left.zipPath.localeCompare(right.zipPath));
}

function createLocalFileHeader(name, data, crc) {
  const nameBuffer = Buffer.from(name);

  return Buffer.concat([
    writeUInt32(0x04034b50),
    writeUInt16(20),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt32(crc),
    writeUInt32(data.length),
    writeUInt32(data.length),
    writeUInt16(nameBuffer.length),
    writeUInt16(0),
    nameBuffer,
  ]);
}

function createCentralDirectoryHeader(name, data, crc, localOffset) {
  const nameBuffer = Buffer.from(name);

  return Buffer.concat([
    writeUInt32(0x02014b50),
    writeUInt16(20),
    writeUInt16(20),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt32(crc),
    writeUInt32(data.length),
    writeUInt32(data.length),
    writeUInt16(nameBuffer.length),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt32(0),
    writeUInt32(localOffset),
    nameBuffer,
  ]);
}

function createEndOfCentralDirectory(fileCount, centralSize, centralOffset) {
  return Buffer.concat([
    writeUInt32(0x06054b50),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(fileCount),
    writeUInt16(fileCount),
    writeUInt32(centralSize),
    writeUInt32(centralOffset),
    writeUInt16(0),
  ]);
}

const files = await collectFiles(extensionDir);
const localParts = [];
const centralParts = [];
let offset = 0;

for (const file of files) {
  const data = await readFile(file.absolutePath);
  const crc = crc32(data);
  const localHeader = createLocalFileHeader(file.zipPath, data, crc);
  const centralHeader = createCentralDirectoryHeader(
    file.zipPath,
    data,
    crc,
    offset,
  );

  localParts.push(localHeader, data);
  centralParts.push(centralHeader);
  offset += localHeader.length + data.length;
}

const centralOffset = offset;
const centralDirectory = Buffer.concat(centralParts);
const endRecord = createEndOfCentralDirectory(
  files.length,
  centralDirectory.length,
  centralOffset,
);
const archive = Buffer.concat([...localParts, centralDirectory, endRecord]);

await mkdir(distDir, { recursive: true });
await writeFile(outputPath, archive);

console.log(`Packaged ${files.length} extension files to ${outputPath}.`);
