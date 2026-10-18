#!/usr/bin/env bash
FF="/d/ai/VideoLingo/ffmpeg/bin/ffmpeg.exe"
SRC="C:/Users/-/Desktop/冰川信使海外版/_assets_extract/Scenes"
T="C:/Users/-/Desktop/冰川信使海外版/_tools/_calib"
SCALE="scale=1280:720:force_original_aspect_ratio=increase:flags=lanczos,crop=1280:720"

"$FF" -hide_banner -loglevel error -y -ss 3 -i "$SRC/scene 3c - flock encountering excavator.mp4" -frames:v 1 -vf "$SCALE" "$T/f_orig.png"
"$FF" -hide_banner -loglevel error -y -ss 3 -i "$T/crf23.mp4" -frames:v 1 "$T/f_23.png"
"$FF" -hide_banner -loglevel error -y -ss 3 -i "$T/crf28.mp4" -frames:v 1 "$T/f_28.png"
"$FF" -hide_banner -loglevel error -y -ss 3 -i "$T/crf30_dn.mp4" -frames:v 1 "$T/f_30.png"

for n in orig 23 28 30; do
  "$FF" -hide_banner -loglevel error -y -i "$T/f_$n.png" -vf "crop=640:360:320:180,scale=440:248" "$T/c_$n.png"
done

"$FF" -hide_banner -loglevel error -y -i "$T/c_orig.png" -i "$T/c_23.png" -i "$T/c_28.png" -i "$T/c_30.png" \
  -filter_complex "[0][1]hstack[t];[2][3]hstack[b];[t][b]vstack" "$T/compare.png"

ls -la "$T/compare.png"
echo "顺序：左上=原片  右上=CRF23  左下=CRF28  右下=CRF30+降噪"
