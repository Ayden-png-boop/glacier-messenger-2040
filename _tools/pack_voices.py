# -*- coding: utf-8 -*-
"""把四语配音打包成 zip（中文文件名需显式走 UTF-8，避免 cp437 乱码）。"""
import os
import zipfile

SRC = "C:/Users/-/Desktop/冰川信使海外版/output/voice-overs"
DST = "C:/Users/-/Desktop/冰川信使海外版/output/冰川信使2040-四语AI配音.zip"
EXTRA = [
    ("C:/Users/-/Desktop/冰川信使海外版/output/voice-script/配音脚本-四语对照.csv", "配音脚本-四语对照.csv"),
]

n = 0
with zipfile.ZipFile(DST, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as z:
    for root, _dirs, files in os.walk(SRC):
        for f in files:
            if f.startswith("_"):
                continue  # 跳过 _manifest / _report 等中间文件
            p = os.path.join(root, f)
            arc = os.path.relpath(p, SRC).replace("\\", "/")
            z.write(p, arc)
            n += 1
    for src, arc in EXTRA:
        if os.path.exists(src):
            z.write(src, arc)
            n += 1

print("文件数:", n)
print("大小: %.1f MB" % (os.path.getsize(DST) / 1024 / 1024))
print("输出:", DST)
