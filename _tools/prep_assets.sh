#!/usr/bin/env bash
# 素材预处理 v2 —— 双档 CRF 策略
#   Tier A（首屏第一印象：L0 第一章正片 + L1 分支后果片 + 第二章正片）: CRF 25
#   Tier B（其余 23 个）: CRF 28
# 统一 720p/16:9、H.264 High、+faststart（moov 前置）、音频 AAC 64k 单声道
set -u

FF="/d/ai/VideoLingo/ffmpeg/bin/ffmpeg.exe"
SRC="C:/Users/-/Desktop/冰川信使海外版/_assets_extract/Scenes"
PROJ="C:/Users/-/Desktop/冰川信使海外版/glacier-messenger-h5"
OUT="$PROJ/public/videos"
POSTER="$PROJ/public/posters"
mkdir -p "$OUT" "$POSTER"

# Tier A：首屏第一印象
TIER_A="ch01_glacier_crack ch01_mining_robots ch01_excavator ch02_council_a"

declare -a MAP=(
  "scene 1 - glacier cracking.mp4|ch01_glacier_crack"
  "scene 2 - bar headed geese flying.mp4|geese_flying"
  "scene 3a - flock encountering robotic arms.mp4|ch01_mining_robots"
  "scene 3b - flock encountering excavator.mp4|ch01_excavator"
  "scene 3c - flock encountering excavator.mp4|ch01_excavator_alt"
  "scene 4 - A_closeup_dynamic_202508131718.mp4|closeup_eye"
  "scene 5a - Under_the_moonlight_202508131803.mp4|ch03_night_a"
  "scene 5b - Under_the_moonlight_202508131803.mp4|ch03_night_b"
  "scene 6a - In_the_center_202508131936_c5g60.mp4|ch02_council_a"
  "scene 6b - In_the_center_202508131938_z2f93.mp4|ch02_council_b"
  "scene 7 - Inside_a_bright_202508132012_s3kse.mp4|ch04_lab"
  "scene 8 - A_simulated_tv_202508132023_ankgn.mp4|ch06_media_tv"
  "scene 9 - The_united_nations_202508132037_rsdfm.mp4|ch08_summit"
  "scene 10 - Timelapse_shot_starting_202508132045_r3ctz.mp4|transition_timelapse"
  "scene 11a - A_flock_of_202508132109_7kmov.mp4|flock_a"
  "scene 11b - A_flock_of_202508132110_wc7tb.mp4|flock_b"
  "scene 11c - A_flock_of_202508132110_e1wx4.mp4|flock_c"
  "scene 12a - A_magnificent_sweeping_202508132131_ahuhm.mp4|hope_a"
  "scene 12b - A_magnificent_sweeping_202508132132_6qsmq.mp4|hope_b"
  "scene 12c - A_magnificent_sweeping_202508132304_du7f5.mp4|ending_hope"
  "scene 13a - Despite_losing_their_202508132138_5nh0b.mp4|ending_adaptation"
  "scene 13b - Despite_losing_their_202508132138_cvywf.mp4|adaptation_b"
  "scene 14a - A_horrible_ending_202508132323_wlk2y.mp4|doom_a"
  "scene 14b - A_horrible_ending_202508132329_l0j41.mp4|ending_doom"
  "contact_human_scientist.mp4|choice_contact_scientist"
  "launch_an_animal_protest.mp4|choice_animal_protest"
  "Expose_the_Energy_Company's_Lies.mp4|choice_expose_lies"
)

ok=0; fail=0
for row in "${MAP[@]}"; do
  src="${row%%|*}"; name="${row##*|}"
  in="$SRC/$src"; out="$OUT/$name.mp4"; pos="$POSTER/$name.webp"
  crf=28
  case " $TIER_A " in *" $name "*) crf=25 ;; esac
  hasaudio=$("$FF" -hide_banner -i "$in" 2>&1 | grep -c "Audio:")
  if [ "$hasaudio" -gt 0 ]; then
    amap=(-c:a aac -b:a 64k -ac 1 -ar 44100)
  else
    amap=(-an)
  fi
  "$FF" -hide_banner -loglevel error -y -i "$in" \
    -vf "scale=1280:720:force_original_aspect_ratio=increase:flags=lanczos,crop=1280:720" \
    -c:v libx264 -preset slow -crf "$crf" -profile:v high -level 4.0 -pix_fmt yuv420p \
    -r 24 -g 48 -keyint_min 24 -sc_threshold 0 \
    -movflags +faststart \
    "${amap[@]}" \
    "$out" 2>&1 | tail -3
  if [ -f "$out" ]; then
    "$FF" -hide_banner -loglevel error -y -ss 0.5 -i "$in" -frames:v 1 \
      -vf "scale=960:540:force_original_aspect_ratio=increase:flags=lanczos,crop=960:540" \
      -c:v libwebp -quality 68 "$pos" 2>&1 | tail -2
    ok=$((ok+1)); printf "OK    %-30s crf=%s %s\n" "$name" "$crf" "$(du -h "$out" | cut -f1)"
  else
    fail=$((fail+1)); echo "FAIL  $name"
  fi
done
echo ""
echo "==== 完成: ok=$ok fail=$fail ===="
du -sh "$OUT" "$POSTER"
