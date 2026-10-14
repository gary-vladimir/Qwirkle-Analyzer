"""Extract tile vectors from the tile legend in MindWare's official rulebook.

Source: https://i.mindware.com/match/original/Asset_Type/Document/origFilename/32016/
PDF title: Qwirkle_Rules_200401_OL. Needs pdfplumber and Pillow only for extraction.
Usage: python scripts/extract-tile-art.py path/to/rulebook.pdf
The generated browser module has no dependencies.
"""
import json
import sys
from collections import Counter
from pathlib import Path

import pdfplumber

with pdfplumber.open(sys.argv[1]) as pdf:
    page = pdf.pages[0]
    legend = page.crop((1090, 380, 1185, 475))
    curves = [o for o in page.curves if 1090 < o['x0'] < 1185 and 380 < o['top'] < 475]
    backgrounds = sorted([o for o in curves if o['top'] < 398 and o['non_stroking_color'] == (0, 0, 0, 1)], key=lambda o: o['x0'])
    assert len(backgrounds) == 6, 'The source layout has changed; inspect the PDF before extracting.'
    artwork = []
    for background in backgrounds:
        candidates = [o for o in curves if o['top'] < 398 and o['non_stroking_color'] != (0, 0, 0, 1) and background['x0'] < o['x0'] < background['x1']]
        assert candidates and all(o['path'] == candidates[0]['path'] for o in candidates), 'Unexpected overlapping artwork.'
        # Translate the paths to local coordinates without changing any proportions.
        def path_data(obj):
            parts = []
            for command, *points in obj['path']:
                assert command in ('m', 'l', 'c', 'h')
                parts.append('Z' if command == 'h' else command.upper())
                for x, y in points:
                    parts.append(f"{x - background['x0']:.6f},{y - background['top']:.6f}")
            return ' '.join(parts)
        artwork.append({
            'viewBox': f"0 0 {background['width']:.6f} {background['height']:.6f}",
            'face': path_data(background),
            'symbol': path_data(candidates[0]),
        })
    # Match the application's existing shape IDs; saved boards retain their meaning.
    artwork = [artwork[i] for i in (0, 3, 2, 5, 1, 4)]
    # PDFium renders the publisher's CMYK colors into the screen's RGB space.
    image = legend.to_image(resolution=144).original.convert('RGB')
    colors = []
    for row in range(6):
        y = 391.57 + row * 13.542
        # Sample the interior of the circle, away from antialiased boundaries.
        sample = image.crop((int((1101 - 1090) * 2), int((y - 1 - 380) * 2), int((1105 - 1090) * 2), int((y + 1 - 380) * 2)))
        rgb = Counter(sample.getdata()).most_common(1)[0][0]
        colors.append('#' + ''.join(f'{c:02x}' for c in rgb))

output = '// Original vector artwork extracted from MindWare’s Qwirkle_Rules_200401_OL.\n'
output += '// See scripts/extract-tile-art.py and README.md for source and regeneration.\n'
output += 'export const TILE_COLORS = ' + json.dumps(colors) + ';\n'
output += 'export const TILE_FACE = "#231f20";\n'
output += 'export const TILE_ART = ' + json.dumps(artwork, indent=2) + ';\n'
Path('dist/tile-art.js').write_text(output)
print('Extracted six original vector symbols and six RGB colors:', colors)
