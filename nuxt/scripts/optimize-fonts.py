"""Generate committed WOFF2 files from unchanged local TTF sources.

Requires fonttools[woff]. Kept separate from builds; users need no Python runtime.
"""
from pathlib import Path
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
for source in sorted((root / 'app/assets/fonts').glob('ChakraPetch-*.ttf')):
    font = TTFont(source, recalcTimestamp=False)
    font.flavor = 'woff2'
    target = source.with_suffix('.woff2')
    font.save(target)
    print(f'{source.name}: {source.stat().st_size} -> {target.stat().st_size} bytes')
