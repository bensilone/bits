#!/usr/bin/env node
/**
 * Download pinned XMRig v6.26.0 into apps/desktop/binaries/xmrig/
 * Binaries are gitignored — run: npm run fetch-worker
 */
import {
  createWriteStream,
  mkdirSync,
  rmSync,
  chmodSync,
  readdirSync,
  statSync,
  copyFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";

const VERSION = "6.26.0";
const BASE = `https://github.com/xmrig/xmrig/releases/download/v${VERSION}`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "binaries", "xmrig");
const TMP_DIR = join(__dirname, "..", "binaries", ".tmp-xmrig");

function detectAsset() {
  const platform = process.platform; // darwin | linux | win32
  const arch = process.arch; // x64 | arm64

  if (platform === "linux" && arch === "x64") {
    return {
      file: `xmrig-${VERSION}-linux-static-x64.tar.gz`,
      kind: "tar.gz",
      exe: "xmrig",
    };
  }
  if (platform === "win32" && (arch === "x64" || arch === "arm64")) {
    return {
      file: `xmrig-${VERSION}-windows-x64.zip`,
      kind: "zip",
      exe: "xmrig.exe",
    };
  }
  if (platform === "darwin" && arch === "arm64") {
    return {
      file: `xmrig-${VERSION}-macos-arm64.tar.gz`,
      kind: "tar.gz",
      exe: "xmrig",
    };
  }
  if (platform === "darwin" && arch === "x64") {
    return {
      file: `xmrig-${VERSION}-macos-x64.tar.gz`,
      kind: "tar.gz",
      exe: "xmrig",
    };
  }
  throw new Error(
    `Unsupported platform for XMRig fetch: ${platform}/${arch}. Supported: linux-x64, windows-x64, macos-x64, macos-arm64.`
  );
}

async function download(url, dest) {
  console.log(`Downloading ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText} for ${url}`);
  }
  await pipeline(res.body, createWriteStream(dest));
}

function findBinary(root, name) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const ent of readdirSync(dir)) {
      const p = join(dir, ent);
      const st = statSync(p);
      if (st.isDirectory()) stack.push(p);
      else if (ent === name) return p;
    }
  }
  return null;
}

function extractTarGz(archive, dest) {
  mkdirSync(dest, { recursive: true });
  execFileSync("tar", ["-xzf", archive, "-C", dest], { stdio: "inherit" });
}

function extractZip(archive, dest) {
  mkdirSync(dest, { recursive: true });
  try {
    execFileSync("unzip", ["-o", archive, "-d", dest], { stdio: "inherit" });
  } catch {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Force -Path '${archive}' -DestinationPath '${dest}'`,
      ],
      { stdio: "inherit" }
    );
  }
}

async function main() {
  const asset = detectAsset();
  const url = `${BASE}/${asset.file}`;

  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const archivePath = join(TMP_DIR, asset.file);
  await download(url, archivePath);

  const extractDir = join(TMP_DIR, "extract");
  if (asset.kind === "tar.gz") extractTarGz(archivePath, extractDir);
  else extractZip(archivePath, extractDir);

  const found = findBinary(extractDir, asset.exe);
  if (!found) throw new Error(`Could not find ${asset.exe} inside ${asset.file}`);

  const destBin = join(OUT_DIR, asset.exe);
  for (const ent of readdirSync(OUT_DIR)) {
    rmSync(join(OUT_DIR, ent), { recursive: true, force: true });
  }
  copyFileSync(found, destBin);
  if (process.platform !== "win32") {
    chmodSync(destBin, 0o755);
  }

  rmSync(TMP_DIR, { recursive: true, force: true });
  console.log(`XMRig v${VERSION} ready at ${destBin}`);
  console.log("AV may flag this binary — expected for RandomX miners.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
