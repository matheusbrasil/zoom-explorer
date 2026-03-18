#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = process.cwd();
const publicDir = path.join(projectRoot, "public");
const distDir = path.join(projectRoot, "dist");

function collectImageNameVariants(name) {
  const variants = [];
  const seen = new Set();
  const addVariant = (value) => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed.toLowerCase())) {
      return;
    }
    seen.add(trimmed.toLowerCase());
    variants.push(trimmed);
  };

  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s+\-]/g, "")
    .trim();

  addVariant(name);
  addVariant(name.replace(/\s+/g, " "));
  addVariant(name.replace(/\s*\/\s*/g, "-"));
  addVariant(name.replace(/\s*-\s*/g, "-"));
  addVariant(name.replace(/\s+/g, "-"));
  addVariant(name.replace(/\s+/g, "_"));
  addVariant(name.replace(/\s+/g, ""));
  addVariant(name.toLowerCase().replace(/\s+/g, "-"));
  addVariant(name.toLowerCase().replace(/\s+/g, "_"));
  addVariant(name.toLowerCase().replace(/\s+/g, ""));

  if (normalized.length > 0) {
    addVariant(normalized);
    addVariant(normalized.replace(/\s+/g, "-"));
    addVariant(normalized.replace(/\s+/g, "_"));
    addVariant(normalized.replace(/\s+/g, ""));
    addVariant(normalized.toLowerCase().replace(/\s+/g, "-"));
    addVariant(normalized.toLowerCase().replace(/\s+/g, "_"));
    addVariant(normalized.toLowerCase().replace(/\s+/g, ""));
  }

  return variants;
}

function buildCaseInsensitiveFileMap(directory) {
  const fileMap = new Map();
  for (const fileName of fs.readdirSync(directory)) {
    fileMap.set(fileName.toLowerCase(), fileName);
  }
  return fileMap;
}

function findSourceImageForEffectName(effectName, fileMap) {
  if (typeof effectName !== "string" || effectName.trim().length === 0) {
    return undefined;
  }

  for (const variant of collectImageNameVariants(effectName)) {
    const candidate = `${variant}.png`;
    const match = fileMap.get(candidate.toLowerCase());
    if (match !== undefined) {
      return match;
    }
  }

  return undefined;
}

function addCodeBasedAliases(effectsDir, mappingsDir) {
  const fileMap = buildCaseInsensitiveFileMap(effectsDir);
  const mappingFiles = fs
    .readdirSync(mappingsDir)
    .filter((fileName) => /^zoom-effect-mappings-.*\.json$/i.test(fileName));

  for (const mappingFile of mappingFiles) {
    const mappingPath = path.join(mappingsDir, mappingFile);
    let mappingData;
    try {
      mappingData = JSON.parse(fs.readFileSync(mappingPath, "utf8"));
    }
    catch {
      continue;
    }

    if (mappingData === null || typeof mappingData !== "object") {
      continue;
    }

    for (const [rawCode, entry] of Object.entries(mappingData)) {
      if (entry === null || typeof entry !== "object") {
        continue;
      }

      const code = String(rawCode).trim().toLowerCase();
      if (!/^[0-9a-f]{8}$/.test(code)) {
        continue;
      }

      const targetFile = `${code}.png`;
      const targetKey = targetFile.toLowerCase();
      if (fileMap.has(targetKey)) {
        continue;
      }

      const nameCandidates = [entry.screenName, entry.name].filter((value) => typeof value === "string");
      let sourceFile;
      for (const effectName of nameCandidates) {
        sourceFile = findSourceImageForEffectName(effectName, fileMap);
        if (sourceFile !== undefined) {
          break;
        }
      }

      if (sourceFile === undefined) {
        continue;
      }

      fs.copyFileSync(path.join(effectsDir, sourceFile), path.join(effectsDir, targetFile));
      fileMap.set(targetKey, targetFile);
    }
  }

  // BPM exists under more than one effect code; guarantee both code files are present.
  const bpmCodes = ["07000ff0", "09000ff0"];
  const bpmSourceCandidates = [
    "BPM.png",
    "bpm.png",
    "07000ff0.png",
    "09000ff0.png",
  ];

  let bpmSourceFile;
  for (const candidate of bpmSourceCandidates) {
    const match = fileMap.get(candidate.toLowerCase());
    if (match !== undefined) {
      bpmSourceFile = match;
      break;
    }
  }

  if (bpmSourceFile !== undefined) {
    for (const bpmCode of bpmCodes) {
      const targetFile = `${bpmCode}.png`;
      const targetKey = targetFile.toLowerCase();
      if (!fileMap.has(targetKey)) {
        fs.copyFileSync(path.join(effectsDir, bpmSourceFile), path.join(effectsDir, targetFile));
        fileMap.set(targetKey, targetFile);
      }
    }
  }
}

function pruneNonCodeEffectImages(effectsDir) {
  for (const fileName of fs.readdirSync(effectsDir)) {
    if (!fileName.toLowerCase().endsWith(".png")) {
      continue;
    }

    const base = path.basename(fileName, ".png");
    if (base.toUpperCase() === "BLANK") {
      continue;
    }
    if (!/^[0-9a-f]{8}$/i.test(base)) {
      fs.rmSync(path.join(effectsDir, fileName), { force: true });
    }
  }
}

if (!fs.existsSync(publicDir)) {
  console.error("Public directory not found.");
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });

for (const entry of fs.readdirSync(publicDir, { withFileTypes: true })) {
  const source = path.join(publicDir, entry.name);
  const destination = path.join(distDir, entry.name);
  fs.cpSync(source, destination, { recursive: true, force: true });
}

const effectsDir = path.join(distDir, "img", "effects");
if (fs.existsSync(effectsDir)) {
  addCodeBasedAliases(effectsDir, publicDir);
  pruneNonCodeEffectImages(effectsDir);
}
