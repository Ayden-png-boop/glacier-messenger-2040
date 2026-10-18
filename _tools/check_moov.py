import struct, sys, os

def atoms(path):
    order = []
    with open(path, 'rb') as f:
        size = os.path.getsize(path)
        pos = 0
        while pos < size and len(order) < 6:
            f.seek(pos)
            hdr = f.read(8)
            if len(hdr) < 8:
                break
            n, typ = struct.unpack('>I4s', hdr)
            typ = typ.decode('latin1')
            if n == 1:
                n = struct.unpack('>Q', f.read(8))[0]
            if n == 0:
                break
            order.append((typ, pos, n))
            pos += n
    return order

root = r"C:/Users/-/Desktop/冰川信使海外版/glacier-messenger-h5/public/videos"
ok = bad = 0
for name in sorted(os.listdir(root)):
    p = os.path.join(root, name)
    try:
        seq = [t for t, _, _ in atoms(p)]
        good = seq[0] in ('ftyp',) and 'moov' in seq and (
            'mdat' not in seq or seq.index('moov') < seq.index('mdat')
        )
    except Exception as e:
        seq, good = [str(e)], False
    if good:
        ok += 1
        print(f"PASS  {name:34s} {'>'.join(seq[:4])}")
    else:
        bad += 1
        print(f"FAIL  {name:34s} {'>'.join(seq[:4])}")
print(f"\nfaststart 达标: {ok}/{ok+bad}")
sys.exit(0 if bad == 0 else 1)
