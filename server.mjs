import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { handleCoach } from './src/coach-api.js';
const root = path.dirname(new URL(import.meta.url).pathname);
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".glb": "model/gltf-binary",
};
http
  .createServer(async (req, res) => {
    try {
      if(new URL(req.url,'http://localhost').pathname==='/api/coach'){
        let body='';for await(const chunk of req){body+=chunk;if(body.length>18000){res.writeHead(413);res.end('Request too large');return;}}
        const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body}: {})});
        const response=await handleCoach(request,process.env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
      }
      const p = path.resolve(
        root,
        "." +
          decodeURIComponent(
            new URL(req.url, "http://localhost").pathname === "/"
              ? "/index.html"
              : new URL(req.url, "http://localhost").pathname,
          ),
      );
      if (!p.startsWith(root + path.sep)) throw Error();
      const b = fs.readFileSync(p);
      res.writeHead(200, {
        "Content-Type": mime[path.extname(p)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(b);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(Number(process.env.PORT) || 3000, "0.0.0.0", () =>
    console.log("AURA http://localhost:" + (process.env.PORT || 3000)),
  );
