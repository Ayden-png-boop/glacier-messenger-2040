#!/usr/bin/env bash
# 校验输出视频 moov 是否前置 + 时长/尺寸一致
FP="/d/ai/VideoLingo/ffmpeg/bin/ffprobe.exe"
OUT="C:/Users/-/Desktop/冰川信使海外版/glacier-messenger-h5/public/videos"
pass=0; fail=0
for f in "$OUT"/*.mp4; do
  name=$(basename "$f")
  res=$("$FP" -v trace -i "$f" -f null - 2>&1 | grep -m1 -o "type:'moov'.*pos:[0-9]*" | grep -o "pos:[0-9]*" | head -1 | cut -d: -f2)
  moovpos=$("$FP" -v debug -i "$f" -f null - 2>&1 | grep -m1 "moov" | head -1)
  # 更可靠：比较 moov 与 mdat 在 atom 遍历中的出现顺序
  order=$("$FP" -v trace -i "$f" -f null - 2>&1 | grep -oE "type:'(moov|mdat)'" | head -2 | tr '\n' ' ')
  wh=$("$FP" -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$f")
  if [ "$order" = "type:'moov' type:'mdat'" ]; then
    pass=$((pass+1)); printf "PASS  %-30s %s\n" "$name" "$wh"
  else
    fail=$((fail+1)); printf "FAIL  %-30s order=%s\n" "$name" "$order"
  fi
done
echo ""
echo "faststart 达标: $pass / $((pass+fail))"
