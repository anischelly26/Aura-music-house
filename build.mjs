import { mkdir, cp, rm, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { createHash } from "node:crypto";
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("src", "dist/src", { recursive: true });
await cp("assets", "dist/assets", { recursive: true });
await build({
  entryPoints: ["src/main.js"],
  outfile: "dist/studio.js",
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: true,
  define: {__AURA_COACH_SERVER__:'false'},
});
let html = await readFile("index.html", "utf8");
const revision = createHash('sha256');
for (const file of ['dist/studio.js','src/style.css','src/house.css','src/activities.css','src/aura.css']) revision.update(await readFile(file));
const assetVersion = revision.digest('hex').slice(0,12);
html = html
  .replace(/<script type="importmap">[\s\S]*?<\/script>/, "")
  .replace(
    '<script type="module" src="src/main.js"></script>',
    '<script src="studio.js?v=' + assetVersion + '"></script>',
  )
  .replace(/href="(src\/(?:style|house|activities|aura)\.css)"/g, 'href="$1?v=' + assetVersion + '"');
await writeFile("dist/index.html", html);
await import("./bundle.mjs");
console.log("Built the music house into dist/");
