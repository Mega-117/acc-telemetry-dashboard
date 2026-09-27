"""Regenerate committed responsive WebP assets. Requires Pillow 12; no server dependency.

Originals stay untouched. Content hashes allow long-lived caching without stale images.
Only canonical track illustrations are included, not debug screenshots in public/tracks.
"""
from pathlib import Path
import hashlib
import json
import re
import io
from PIL import Image, UnidentifiedImageError

ROOT = Path(__file__).resolve().parents[1]


def main():
    sources = {
        f'/images/cars/{p.name}': p
        for p in sorted((ROOT / 'app/assets/images/cars').glob('*.png'))
    }
    metadata = (ROOT / 'app/services/projections/trackMetadata.ts').read_text(encoding='utf-8')
    for name in sorted(set(re.findall(r'/tracks/[^\s\x27]+\.png', metadata))):
        sources[name] = ROOT / 'public' / name.lstrip('/')
    for p in sorted((ROOT / 'public/images/voices').glob('*.png')):
        sources[f'/images/voices/{p.name}'] = p
    output = ROOT / 'public/images/optimized'
    output.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for key, source in sources.items():
        try:
            Image.open(source).close()
        except UnidentifiedImageError:
            if key != '/tracks/track_default.png':
                raise
            print(f'Preserving unrecognized original without conversion: {key}')
            continue
        with Image.open(source) as image:
            widths = sorted(set(min(w, image.width) for w in (256, 512, 1024)))
            variants = []
            for width in widths:
                height = round(image.height * width / image.width)
                scaled = image.resize((width, height), Image.Resampling.LANCZOS)
                buffer = io.BytesIO()
                scaled.save(buffer, 'WEBP', quality=85, method=6)
                data = buffer.getvalue()
                digest = hashlib.sha256(data).hexdigest()[:12]
                name = f'{source.stem}-{width}-{digest}.webp'
                (output / name).write_bytes(data)
                variants.append({
                    'width': width, 'src': f'/images/optimized/{name}', 'bytes': len(data)
                })
            manifest[key] = {
                'width': image.width, 'height': image.height,
                'sourceBytes': source.stat().st_size, 'variants': variants
            }
    (ROOT / 'app/assets/image-manifest.json').write_text(
        json.dumps(manifest, indent=2) + '\n', encoding='utf-8'
    )
    original = sum(v['sourceBytes'] for v in manifest.values())
    cards = sum(v['variants'][0]['bytes'] for v in manifest.values())
    large = sum(v['variants'][-1]['bytes'] for v in manifest.values())
    print(f'{len(manifest)} images: originals={original}, smallest={cards}, largest={large} bytes')


if __name__ == '__main__':
    main()
