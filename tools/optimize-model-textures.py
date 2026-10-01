"""Run after convert-models.mjs; retains only referenced textures, capped at 1024 px."""
from pathlib import Path
from PIL import Image, ImageOps
import json, io
inventory=json.loads(Path('artifacts/converted-inventory.json').read_text())
root=Path('assets/models/textures');root.mkdir(parents=True,exist_ok=True)
names={name for pack in inventory for name in pack['textures']}
for old in root.glob('*.webp'):
    if old.stem not in names: old.unlink()
for name in names:
    image=Image.open('artifacts/raw-textures/'+name.removesuffix('-flip')).convert('RGBA')
    image.thumbnail((1024,1024),Image.Resampling.LANCZOS)
    if name.endswith('-flip'): image=ImageOps.flip(image)
    stream=io.BytesIO();image.save(stream,format='WEBP',quality=84,method=6)
    (root/(name+'.webp')).write_bytes(stream.getvalue())
print('Optimized asset payload:',sum(p.stat().st_size for p in Path('assets/models').rglob('*') if p.is_file()),'bytes')
