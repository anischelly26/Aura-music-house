from pathlib import Path
import zipfile
root=Path(__file__).resolve().parents[1]
target=root/'AURA_Music_House_v0.4.0.zip'
files=['index.html','AURA.html','START_AURA.bat','README.md','THIRD_PARTY_NOTICES.txt','package.json','package-lock.json','build.mjs','bundle.mjs','server.mjs','.openai/hosting.json']
for directory in ['src','tests','assets','tools']:
    files.extend(str(p.relative_to(root)) for p in (root/directory).rglob('*') if p.is_file() and p.suffix not in ['.wav','.zip','.mid'] and 'previous' not in p.parts)
files.extend(str(p.relative_to(root)) for p in (root/'docs').rglob('*.md'))
files.extend(str(p.relative_to(root)) for p in (root/'docs/update-0.4').rglob('*') if p.is_file())
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for name in sorted(set(files)):
        z.write(root/name,'AURA/'+name)
print(f'{target.name}: {target.stat().st_size:,} bytes / {len(set(files))} files')
