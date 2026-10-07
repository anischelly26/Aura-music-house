import { readFile, writeFile, readdir } from "node:fs/promises";
import { build } from "esbuild";
const result = await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: true,
  define: {__AURA_COACH_SERVER__:'false'},
  write: false,
});
let html = await readFile("index.html", "utf8");
// The portable file carries its typefaces with it.
const inlineFonts = async (css) => {
  for (const [whole, name] of css.matchAll(/url\("\.\.\/assets\/fonts\/([\w.-]+\.woff2)"\)/g))
    css = css.replace(whole, 'url("data:font/woff2;base64,' + (await readFile("assets/fonts/" + name)).toString("base64") + '")');
  return css;
};
html = html.replace(/\s*<link rel="preload" href="assets\/fonts\/[^>]*>/g, "");
for (const file of ["style.css", "house.css", "activities.css", "aura.css"]) {
  const css = await inlineFonts(await readFile("src/" + file, "utf8"));
  html = html.replace(
    new RegExp('<link rel="stylesheet" href="src/' + file + '"\\s*/?\\s*>'),
    () => "<style>" + css + "</style>",
  );
}
const assets={};
async function embed(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const file=directory+'/'+entry.name;if(entry.isDirectory())await embed(file);else if(/\.(glb|webp)$/.test(file)){const data=await readFile(file);assets[file]='data:'+(file.endsWith('.glb')?'model/gltf-binary':'image/webp')+';base64,'+data.toString('base64');}}}
await embed('assets/models');
html=html.replace('<script type="module" src="src/main.js"></script>','<script>window.AURA_ASSETS='+JSON.stringify(assets)+'</script><script type="module" src="src/main.js"></script>');
html = html
  .replace(/<script type="importmap">[\s\S]*?<\/script>/, "")
  .replace(
    '<script type="module" src="src/main.js"></script>',
    () =>
      "<script>" +
      result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script") +
      "</script>",
  );
if (html.includes('src="src/main.js"') || html.includes('href="src/'))
  throw Error("Unbundled asset reference");
await writeFile("AURA.html", html);
console.log("Created portable, offline AURA.html");
