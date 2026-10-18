# -*- coding: utf-8 -*-
"""
用 edge-tts（Microsoft 神经网络语音）批量合成《冰川信使：斑头雁的2040》四语配音。

用法：
  python synth_voice.py            # 全量合成
  python synth_voice.py --limit 5  # 先跑 5 条试听
  python synth_voice.py --only ja  # 只合成日语

要点：
  - 必须在 import edge_tts 之前设置代理环境变量（aiohttp 靠 trust_env 读取）
  - 并发要限流（微软会限流返回 403），失败自动重试
  - Windows 事件循环用 ProactorEventLoop，且必须显式设置
"""
import os

# ── 代理：本机走 127.0.0.1:55955，必须在 import aiohttp/edge_tts 前设置 ──
PROXY = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or "http://127.0.0.1:55955"
os.environ["HTTPS_PROXY"] = PROXY
os.environ["HTTP_PROXY"] = PROXY
os.environ["https_proxy"] = PROXY
os.environ["http_proxy"] = PROXY

import argparse  # noqa: E402
import asyncio  # noqa: E402
import json  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402

import edge_tts  # noqa: E402

ROOT = "C:/Users/-/Desktop/冰川信使海外版/output/voice-overs"
MANIFEST = os.path.join(ROOT, "_manifest.json")
REPORT = os.path.join(ROOT, "_synth_report.json")

# ── 音色：全部选 Narrative/Novel 类，适合故事朗读 ──
# narration = 主旁白（沉稳叙述）；female = 女主/雪翼；male = 其他男性角色
VOICES = {
    "zh": {"narration": "zh-CN-XiaoxiaoNeural", "female": "zh-CN-XiaoxiaoNeural", "male": "zh-CN-YunxiNeural"},
    "en": {"narration": "en-US-AriaNeural", "female": "en-US-AriaNeural", "male": "en-US-ChristopherNeural"},
    "ja": {"narration": "ja-JP-NanamiNeural", "female": "ja-JP-NanamiNeural", "male": "ja-JP-KeitaNeural"},
    "fr": {"narration": "fr-FR-DeniseNeural", "female": "fr-FR-DeniseNeural", "male": "fr-FR-HenriNeural"},
}

# ── 语速：旁白略慢，台词还原自然速度 ──
RATE = {
    "narration": {"zh": "-8%", "en": "-5%", "ja": "-5%", "fr": "-5%"},
    "chapter-title": {"zh": "-10%", "en": "-8%", "ja": "-8%", "fr": "-8%"},
    "ending-title": {"zh": "-10%", "en": "-8%", "ja": "-8%", "fr": "-8%"},
    "dialogue": {"zh": "+0%", "en": "+0%", "ja": "+0%", "fr": "+0%"},
    "choice": {"zh": "-5%", "en": "-3%", "ja": "-3%", "fr": "-3%"},
    "consequence": {"zh": "-5%", "en": "-3%", "ja": "-3%", "fr": "-3%"},
    "condition": {"zh": "-5%", "en": "-3%", "ja": "-3%", "fr": "-3%"},
    "ui": {"zh": "+0%", "en": "+0%", "ja": "+0%", "fr": "+0%"},
}

SKIP_TYPES = {"visual"}  # 画面提示是镜头调度说明，不配音

# 主角（雌性斑头雁）用女声，其余角色用男声
FEMALE_SPEAKERS = {"雪翼"}


def pick_voice(lang, item):
    kind = "narration"
    if item["type"] == "dialogue":
        kind = "female" if item.get("speaker") in FEMALE_SPEAKERS else "male"
    return VOICES[lang][kind]


async def synth_one(sem, lang, item, idx, total):
    text = (item["texts"].get(lang) or "").strip()
    if not text:
        return {"id": item["id"], "lang": lang, "ok": True, "skipped": "empty"}

    outdir = os.path.join(ROOT, lang)
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, item["id"] + ".mp3")

    # 已存在且非空 → 跳过（便于断点续跑）
    if os.path.exists(path) and os.path.getsize(path) > 1024:
        return {"id": item["id"], "lang": lang, "ok": True, "skipped": "exists", "path": path}

    voice = pick_voice(lang, item)
    rate = RATE.get(item["type"], {}).get(lang, "+0%")

    last_err = None
    for attempt in range(3):
        try:
            async with sem:
                comm = edge_tts.Communicate(text, voice, rate=rate)
                await comm.save(path)
            if os.path.getsize(path) > 1024:
                return {"id": item["id"], "lang": lang, "ok": True, "path": path, "voice": voice, "rate": rate}
            last_err = "file too small"
        except Exception as e:  # noqa: BLE001
            last_err = f"{type(e).__name__}: {e}"
            await asyncio.sleep(1.5 * (attempt + 1))
    return {"id": item["id"], "lang": lang, "ok": False, "error": last_err, "text": text[:60]}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="只处理前 N 条（测试用）")
    ap.add_argument("--only", default="", help="只合成指定语言，逗号分隔")
    ap.add_argument("--concurrency", type=int, default=5)
    args = ap.parse_args()

    if sys.platform.startswith("win"):
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    with open(MANIFEST, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    items = [it for it in manifest["items"] if it["type"] not in SKIP_TYPES]
    if args.limit:
        items = items[: args.limit]
    langs = [l for l in ["zh", "en", "ja", "fr"] if not args.only or l in args.only.split(",")]

    tasks = []
    for it in items:
        for lang in langs:
            tasks.append((lang, it))

    print(f"待合成: {len(tasks)} 个音频（{len(items)} 条 × {len(langs)} 语），并发 {args.concurrency}")
    print(f"代理: {PROXY}")
    t0 = time.time()

    sem = asyncio.Semaphore(args.concurrency)
    results = []
    done = 0
    # 分批处理，避免一次性建太多协程导致连接堆积
    BATCH = 40
    for i in range(0, len(tasks), BATCH):
        chunk = tasks[i : i + BATCH]
        res = await asyncio.gather(*(synth_one(sem, l, it, i + k, len(tasks)) for k, (l, it) in enumerate(chunk)))
        results.extend(res)
        done += len(chunk)
        ok = sum(1 for r in res if r.get("ok"))
        print(f"  [{done}/{len(tasks)}] 本批成功 {ok}/{len(chunk)}  用时 {time.time() - t0:.0f}s")

    failed = [r for r in results if not r.get("ok")]
    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump({"total": len(tasks), "failed": failed, "elapsed": round(time.time() - t0, 1)}, f, ensure_ascii=False, indent=2)

    print(f"\n完成: {len(tasks) - len(failed)}/{len(tasks)}  用时 {time.time() - t0:.0f}s")
    if failed:
        print(f"失败 {len(failed)} 个，已写入 {REPORT}")
        for r in failed[:5]:
            print("   ", r["id"], r["lang"], r.get("error"))
    else:
        print("全部成功")


if __name__ == "__main__":
    asyncio.run(main())
