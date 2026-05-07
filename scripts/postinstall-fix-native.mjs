import fs from "node:fs";
import path from "node:path";

function copyIfMissing(from, to) {
  if (!fs.existsSync(from)) return false;
  if (!fs.existsSync(path.dirname(to))) return false;
  if (!fs.existsSync(to)) {
    fs.copyFileSync(from, to);
  }
  return true;
}

const root = process.cwd();

const lightningFrom = path.join(
  root,
  "node_modules",
  "lightningcss-win32-x64-msvc",
  "lightningcss.win32-x64-msvc.node",
);
const lightningTo = path.join(
  root,
  "node_modules",
  "lightningcss",
  "lightningcss.win32-x64-msvc.node",
);

const copiedLightning = copyIfMissing(lightningFrom, lightningTo);

if (copiedLightning) {
  console.log("postinstall: ensured lightningcss native binary");
} else {
  console.log("postinstall: lightningcss native binary not copied (non-win32 or package missing)");
}
