import io
import re

s = io.open(r'C:/Users/-/Desktop/冰川信使海外版/glacier-messenger-h5/src/story/story.js', encoding='utf-8').read()

# 抓取每个 choice 的 id / effects / nextState
pat = re.compile(r"id:\s*'(c\d+[ab])'", re.S)
for m in pat.finditer(s):
    seg = s[m.start():m.start() + 3000]
    eff = re.search(r'effects:\s*\{([^}]*)\}', seg)
    nst = re.search(r'nextState:\s*\{([^}]*)\}', seg)
    txt = re.search(r'text:\s*\{\s*zh:\s*\'([^\']+)\'', seg)
    end = m.group(1)
    print(f"{end:5s} | {txt.group(1) if txt else '?':24s} | eff={eff.group(1).strip() if eff else '-':38s} | next={nst.group(1).strip() if nst else '-'}")
