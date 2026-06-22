/**
 * Build script to create aiconsumptionmonitor.zip from dist/ output + xs-app.json
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

const DIST_DIR = 'dist';
const OUTPUT_FILE = join(DIST_DIR, 'aiconsumptionmonitor.zip');
const XS_APP_FILE = 'xs-app.json';
const MANIFEST_FILE = 'manifest.json';

function collectFiles(dir, base = dir) {
    const files = [];
    const entries = readdirSync(dir);
    for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
            files.push(...collectFiles(fullPath, base));
        } else {
            if (fullPath.endsWith('.zip')) continue;
            if (fullPath.endsWith('.map')) continue;
            files.push({ path: relative(base, fullPath), fullPath });
        }
    }
    return files;
}

function crc32(buf) {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c;
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

console.log('📦 Creating aiconsumptionmonitor.zip...');

const files = collectFiles(DIST_DIR);

const additionalFiles = [XS_APP_FILE, MANIFEST_FILE, 'Component.js'];
for (const extraFile of additionalFiles) {
    try {
        statSync(extraFile);
        files.push({ path: extraFile, fullPath: extraFile });
    } catch (e) {
        console.warn(`   ⚠ Skipping ${extraFile} (not found)`);
    }
}

console.log(`   Found ${files.length} files to package`);

const localParts = [];
const centralParts = [];
let offset = 0;

for (const file of files) {
    const content = readFileSync(file.fullPath);
    const fileName = Buffer.from(file.path.replace(/\\/g, '/'));
    const crc = crc32(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, fileName, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    centralParts.push(central, fileName);
    offset += local.length + fileName.length + content.length;
}

const centralDirSize = centralParts.reduce((sum, buf) => sum + buf.length, 0);
const endRecord = Buffer.alloc(22);
endRecord.writeUInt32LE(0x06054b50, 0);
endRecord.writeUInt16LE(0, 4);
endRecord.writeUInt16LE(0, 6);
endRecord.writeUInt16LE(files.length, 8);
endRecord.writeUInt16LE(files.length, 10);
endRecord.writeUInt32LE(centralDirSize, 12);
endRecord.writeUInt32LE(offset, 16);
endRecord.writeUInt16LE(0, 20);

const zipBuffer = Buffer.concat([...localParts, ...centralParts, endRecord]);
writeFileSync(OUTPUT_FILE, zipBuffer);

console.log(`✅ Created ${OUTPUT_FILE} (${(zipBuffer.length / 1024).toFixed(1)} KB)`);