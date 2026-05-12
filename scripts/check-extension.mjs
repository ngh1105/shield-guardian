import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const extensionDir = path.join(root, "extension");
const manifestPath = path.join(extensionDir, "manifest.json");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readText(filePath) {
  return readFile(filePath, "utf8");
}

function assertExtensionFile(relativePath) {
  const fullPath = path.join(extensionDir, relativePath);
  assert(existsSync(fullPath), `Missing extension file: ${relativePath}`);
}

function findHtmlRefs(html) {
  return [...html.matchAll(/\b(?:src|href)="\.\/([^"]+)"/g)].map(
    (match) => match[1],
  );
}

function findJsImports(js) {
  return [...js.matchAll(/\bfrom\s+"\.\/([^"]+)"/g)].map((match) => match[1]);
}

const manifest = JSON.parse(await readText(manifestPath));

assert(manifest.manifest_version === 3, "Extension must use Manifest V3.");
assert(manifest.background?.service_worker, "Missing background service worker.");
assert(manifest.action?.default_popup, "Missing popup file.");
assert(manifest.options_page, "Missing options page.");

const manifestRefs = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_page,
  ...(manifest.content_scripts ?? []).flatMap((script) => script.js ?? []),
];

for (const ref of manifestRefs) {
  assertExtensionFile(ref);
}

const htmlRefs = new Set();
for (const htmlFile of [manifest.action.default_popup, manifest.options_page]) {
  const html = await readText(path.join(extensionDir, htmlFile));
  for (const ref of findHtmlRefs(html)) {
    htmlRefs.add(ref);
  }
}

for (const ref of htmlRefs) {
  assertExtensionFile(ref);
}

const jsRefs = new Set();
for (const jsFile of [
  manifest.background.service_worker,
  ...[...htmlRefs].filter((ref) => ref.endsWith(".js")),
]) {
  const js = await readText(path.join(extensionDir, jsFile));
  for (const ref of findJsImports(js)) {
    jsRefs.add(ref);
  }
}

for (const ref of jsRefs) {
  assertExtensionFile(ref);
}

const permissions = new Set(manifest.permissions ?? []);
for (const permission of ["activeTab", "storage", "scripting"]) {
  assert(permissions.has(permission), `Missing permission: ${permission}`);
}

const hostPermissions = manifest.host_permissions ?? [];
assert(
  hostPermissions.includes("http://localhost/*"),
  "Missing localhost host permission.",
);
assert(
  hostPermissions.includes("http://127.0.0.1/*"),
  "Missing 127.0.0.1 host permission.",
);
assert(
  !hostPermissions.includes("<all_urls>"),
  "Host permissions must not include <all_urls>.",
);

const optionalHostPermissions = manifest.optional_host_permissions ?? [];
assert(
  optionalHostPermissions.includes("http://*/*") &&
    optionalHostPermissions.includes("https://*/*"),
  "Optional host permissions must support user-selected API origins.",
);

console.log("Extension static check passed.");
