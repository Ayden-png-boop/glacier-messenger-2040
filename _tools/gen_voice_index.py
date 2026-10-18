# -*- coding: utf-8 -*-
"""
生成配音交付索引：
  output/voice-overs/配音索引.csv   逐条清单（四语文本 + 文件名 + 实际时长）
  output/voice-overs/index.html     单文件试听页（数据内嵌，双击即可用，无需服务器）

要点：file:// 协议下 fetch 本地 JSON 会被 CORS 拦截，所以数据必须内嵌进 HTML。
"""
import csv
import json
import os
import subprocess
import sys

ROOT = "C:/Users/-/Desktop/冰川信使海外版/output/voice-overs"
MANIFEST = os.path.join(ROOT, "_manifest.json")
LANGS = ["zh", "en", "ja", "fr"]
LANG_NAME = {"zh": "中文", "en": "English", "ja": "日本語", "fr": "Français"}

FFPROBE = r"D:\ai\VideoLingo\ffmpeg\bin\ffprobe.exe"
if not os.path.exists(FFPROBE):
    FFPROBE = "ffprobe"

SKIP_TYPES = {"visual"}


def duration(path):
    if not os.path.exists(path):
        return 0.0
    try:
        out = subprocess.run(
            [FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
            capture_output=True, text=True, timeout=20,
        )
        return round(float(out.stdout.strip().splitlines()[0]), 2)
    except Exception:  # noqa: BLE001
        return 0.0


def main():
    with open(MANIFEST, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    items = [it for it in manifest["items"] if it["type"] not in SKIP_TYPES]
    print(f"探测 {len(items)} 条 × {len(LANGS)} 语的实际时长…")

    rows = []
    for it in items:
        rec = {
            "id": it["id"],
            "scene": it["scene"],
            "type": it["type"],
            "typeLabel": it["typeLabel"],
            "speaker": it.get("speaker", ""),
            "texts": it["texts"],
            "files": {},
            "dur": {},
        }
        for L in LANGS:
            p = os.path.join(ROOT, L, it["id"] + ".mp3")
            rec["files"][L] = f"{L}/{it['id']}.mp3" if os.path.exists(p) else ""
            rec["dur"][L] = duration(p) if os.path.exists(p) else 0.0
        rows.append(rec)

    # ── CSV ──
    csv_path = os.path.join(ROOT, "配音索引.csv")
    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "编号", "场景", "类型", "说话者",
            "中文", "English", "日本語", "Français",
            "中文文件", "EN文件", "JA文件", "FR文件",
            "中文时长(秒)", "EN时长(秒)", "JA时长(秒)", "FR时长(秒)",
        ])
        for r in rows:
            w.writerow([
                r["id"], r["scene"], r["typeLabel"], r["speaker"],
                r["texts"]["zh"], r["texts"]["en"], r["texts"]["ja"], r["texts"]["fr"],
                r["files"]["zh"], r["files"]["en"], r["files"]["ja"], r["files"]["fr"],
                r["dur"]["zh"], r["dur"]["en"], r["dur"]["ja"], r["dur"]["fr"],
            ])
    print("已写出:", csv_path)

    # ── HTML 试听页 ──
    total_dur = {L: round(sum(r["dur"][L] for r in rows), 1) for L in LANGS}
    missing = sum(1 for r in rows for L in LANGS if not r["files"][L])
    html_path = os.path.join(ROOT, "index.html")

    def fmt(sec):
        m, s = divmod(int(sec), 60)
        return f"{m}:{s:02d}"

    data = json.dumps(rows, ensure_ascii=False)
    stats = json.dumps({"total": len(rows), "dur": total_dur, "missing": missing}, ensure_ascii=False)

    html = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>冰川信使2040 · 四语配音试听</title>
<style>
  :root {{ color-scheme: light; }}
  * {{ box-sizing: border-box; }}
  body {{ margin:0; background:#f6f8fb; color:#0f172a;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }}
  header {{ position:sticky; top:0; z-index:10; background:#fff; border-bottom:1px solid #e2e8f0; padding:14px 18px; }}
  h1 {{ margin:0 0 6px; font-size:17px; }}
  .meta {{ font-size:12px; color:#64748b; }}
  .bar {{ display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:10px; }}
  select,button {{ font:inherit; font-size:13px; padding:5px 10px; border:1px solid #cbd5e1;
    border-radius:7px; background:#fff; color:#0f172a; cursor:pointer; }}
  button:hover {{ background:#f1f5f9; }}
  main {{ padding:14px 18px 60px; max-width:1000px; }}
  .row {{ background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:10px; }}
  .top {{ display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; }}
  .id {{ font-weight:600; font-size:13px; color:#0369a1; }}
  .tag {{ font-size:11px; padding:2px 7px; border-radius:99px; background:#e0f2fe; color:#075985; }}
  .tag.d {{ background:#fef3c7; color:#92400e; }}
  .tag.v {{ background:#f1f5f9; color:#475569; }}
  .scene {{ font-size:12px; color:#94a3b8; }}
  .txt {{ margin:8px 0 4px; font-size:14px; line-height:1.65; }}
  .txt .l {{ display:inline-block; min-width:52px; font-size:11px; color:#94a3b8; vertical-align:top; }}
  .play {{ display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }}
  .play button {{ font-size:12px; padding:4px 9px; }}
  .play button.on {{ background:#0369a1; color:#fff; border-color:#0369a1; }}
  .dur {{ font-size:11px; color:#94a3b8; margin-left:4px; }}
  footer {{ position:fixed; bottom:0; left:0; right:0; background:#fff; border-top:1px solid #e2e8f0;
    padding:10px 18px; font-size:12px; color:#475569; display:flex; align-items:center; gap:10px; }}
  audio {{ flex:1; height:34px; }}
  .empty {{ color:#b91c1c; }}
</style>
</head>
<body>
<header>
  <h1>《冰川信使：斑头雁的2040》四语 AI 配音 · 试听索引</h1>
  <div class="meta" id="meta"></div>
  <div class="bar">
    <select id="fType"><option value="">全部类型</option></select>
    <select id="fScene"><option value="">全部场景</option></select>
    <button id="playAll">▶ 连续播放当前语言</button>
    <select id="playLang">
      <option value="zh">中文</option><option value="en">English</option>
      <option value="ja">日本語</option><option value="fr">Français</option>
    </select>
    <span class="meta" id="count"></span>
  </div>
</header>
<main id="list"></main>
<footer><audio id="au" controls></audio><span id="now">未播放</span></footer>

<script>
const DATA = {data};
const STATS = {stats};
const LANG_NAME = {{zh:'中文', en:'English', ja:'日本語', fr:'Français'}};

document.getElementById('meta').textContent =
  `共 ${{STATS.total}} 条 · 中文 ${{fmt(STATS.dur.zh)}} · English ${{fmt(STATS.dur.en)}} · `
  + `日本語 ${{fmt(STATS.dur.ja)}} · Français ${{fmt(STATS.dur.fr)}}`
  + (STATS.missing ? ` · ⚠ 缺失 ${{STATS.missing}} 个文件` : ' · 文件齐全');

function fmt(s){{ s=Math.round(s); const m=Math.floor(s/60), x=s%60; return m+':'+String(x).padStart(2,'0'); }}

const types=[...new Set(DATA.map(d=>d.typeLabel))];
const scenes=[...new Set(DATA.map(d=>d.scene))];
const ft=document.getElementById('fType'), fs=document.getElementById('fScene');
types.forEach(t=>ft.add(new Option(t,t)));
scenes.forEach(s=>fs.add(new Option(s,s)));

const au=document.getElementById('au'), now=document.getElementById('now');
let queue=[], qi=0;

function render(){{
  const t=ft.value, s=fs.value;
  const rows=DATA.filter(d=>(!t||d.typeLabel===t)&&(!s||d.scene===s));
  document.getElementById('count').textContent='显示 '+rows.length+' 条';
  document.getElementById('list').innerHTML = rows.map(d=>{{
    const tagCls = d.type==='dialogue' ? 'd' : (d.type==='ui'||d.type==='choice' ? 'v':'');
    return `<div class="row">
      <div class="top">
        <span class="id">${{d.id}}</span>
        <span class="tag ${{tagCls}}">${{d.typeLabel}}</span>
        ${{d.speaker?`<span class="tag d">${{d.speaker}}</span>`:''}}
        <span class="scene">${{d.scene}}</span>
      </div>
      ${{['zh','en','ja','fr'].map(L=>`<div class="txt"><span class="l">${{LANG_NAME[L]}}</span>${{(d.texts[L]||'').replace(/</g,'&lt;')}}</div>`).join('')}}
      <div class="play">
        ${{['zh','en','ja','fr'].map(L=>{{
          const f=d.files[L];
          if(!f) return `<button disabled class="empty">${{LANG_NAME[L]}} 缺失</button>`;
          return `<button data-src="${{f}}" data-lang="${{L}}" data-id="${{d.id}}">▶ ${{LANG_NAME[L]}} <span class="dur">${{d.dur[L]?fmt(d.dur[L]):''}}</span></button>`;
        }}).join('')}}
      </div>
    </div>`;
  }}).join('');
}}

document.getElementById('list').addEventListener('click', e=>{{
  const b=e.target.closest('button[data-src]'); if(!b) return;
  document.querySelectorAll('.play button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');
  au.src=b.dataset.src; now.textContent=b.dataset.id+' · '+LANG_NAME[b.dataset.lang];
  au.play().catch(()=>{{}});
  queue=[]; qi=0;
}});

au.addEventListener('ended', ()=>{{
  if(qi<queue.length){{ const n=queue[qi++]; au.src=n.src; now.textContent=n.id+' · '+LANG_NAME[n.lang]; au.play().catch(()=>{{}}); }}
  else now.textContent='播放完毕';
}});

document.getElementById('playAll').onclick=()=>{{
  const L=document.getElementById('playLang').value;
  const t=ft.value, s=fs.value;
  queue=DATA.filter(d=>(!t||d.typeLabel===t)&&(!s||d.scene===s))
    .filter(d=>d.files[L]).map(d=>({{src:d.files[L], id:d.id, lang:L}}));
  qi=0; now.textContent='连续播放 '+queue.length+' 条';
  if(queue.length){{ au.src=queue[qi++].src; au.play().catch(()=>{{}}); }}
}};

ft.onchange=fs.onchange=render;
render();
</script>
</body>
</html>"""

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    print("已写出:", html_path)
    print("各语总时长(秒):", total_dur, " 缺失文件:", missing)


if __name__ == "__main__":
    sys.exit(main())
