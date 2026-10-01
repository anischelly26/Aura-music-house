import { mkdir, cp, rm, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";
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
html = html
  .replace(/<script type="importmap">[\s\S]*?<\/script>/, "")
  .replace(
    '<script type="module" src="src/main.js"></script>',
    '<script src="studio.js"></script>',
  );
await writeFile("dist/index.html", html);
await import("./bundle.mjs");
console.log("Built the music house into dist/");
