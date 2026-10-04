"""Data-only import from the recovered 0x401280 initializer. No executable is read."""
import argparse
import hashlib
import json
import re
import struct
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--reference', default='D:/AIWorkspace/Touhou20Reconstruction')
parser.add_argument('--output', default='games/touhou20/assets/bullet-styles.json')
args = parser.parse_args()
path = Path(args.reference) / 'source_reconstruction/bullet_system/style_data.cpp'
source = path.read_text(encoding='utf-8')
pattern = re.compile(r'\{(0x[0-9a-f]+)u,\{ // type (\d+)\s*(.*?)\},std::bit_cast<float>\((0x[0-9a-f]+)u\),((?:0x[0-9a-f]+u,){3}0x[0-9a-f]+u)\}', re.S)
styles = []
for script, number, colors, radius, tail in pattern.findall(source):
    entries = [[int(x, 16) for x in re.findall(r'0x([0-9a-f]+)u', row)]
               for row in re.findall(r'\{\{(.*?)\}\}', colors)]
    if len(entries) != 16 or any(len(row) != 5 for row in entries):
        raise ValueError(f'Invalid source color table in type {number}')
    draw, cancel, field150, child = [int(x, 16) for x in re.findall(r'0x([0-9a-f]+)u', tail)]
    styles.append(dict(type=int(number), script=int(script,16), colors=entries,
                       radius=struct.unpack('<f',struct.pack('<I',int(radius,16)))[0],
                       radiusBits=int(radius,16), drawGroup=draw, cancelType=cancel,
                       field150=field150, childScript=child))
assert [s['type'] for s in styles] == list(range(50)), 'Expected original 50 style records'
result = {'source':str(path), 'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
          'initializerVA':'0x00401280', 'styles':styles}
out = Path(args.output); out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(result, ensure_ascii=False, separators=(',',':')),encoding='utf-8')
print(f'Imported {len(styles)} original bullet styles / 800 color records -> {out}')
