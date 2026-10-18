import io
import re

s = io.open(r'C:/Users/-/Desktop/冰川信使海外版/glacier-messenger-h5/src/story/story.js', encoding='utf-8').read()

ids = [(m.start(), m.group(1)) for m in re.finditer(r"id:\s*'([^']+)'", s)]
for pos, cid in ids:
    seg = s[pos:pos + 2000]
    # 只看 choices 内的 id（有 text 字段的），跳过章节点
    if 'text:' not in seg[:400]:
        continue
    ani = re.search(r"animation:\s*'([^']+)'", seg)
    qte = 'qte:' in seg[:800]
    nxt = re.search(r'nextChapter:\s*(\d+)', seg)
    end = re.search(r"ending:\s*'([^']+)'", seg)
    rule = 'endingRule' in seg[:1500]
    print(f"{cid:6s} | ani={ani.group(1) if ani else '-':28s} | qte={qte} | next={nxt.group(1) if nxt else '-'} | end={end.group(1) if end else '-'}{'/rule' if rule else ''}")

print()
print('章节列表:')
for m in re.finditer(r"id:\s*(\d+),\s*\n\s*video:\s*'([^']+)'", s):
    print(' chapter', m.group(1), '->', m.group(2))
print()
print('结局视频:')
for m in re.finditer(r"video:\s*'([^']+)'", s[s.find('ENDINGS'):]):
    print(' ', m.group(1))
