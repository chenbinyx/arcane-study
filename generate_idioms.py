#!/usr/bin/env python3
"""
Generate AI voice pack for idioms (成语) in arcane-study app.
- One mp3 per unique 4-character idiom: voice/word/<idiom>.mp3
- Voice: zh-CN-YunyangNeural (云扬) — deep, resonant, standard Mandarin (最"浑厚")
- Skip files that already exist (safe to re-run / resume)
"""
import os
import re
import json
import asyncio
import edge_tts

BASE = os.path.dirname(os.path.abspath(__file__))
VOICE_DIR = os.path.join(BASE, "voice")
WORD_DIR = os.path.join(VOICE_DIR, "word")
os.makedirs(WORD_DIR, exist_ok=True)

# 浑厚男声：云扬（新闻主播风，低沉有厚度、字正腔圆）
VOICE_IDIOM = "zh-CN-YunyangNeural"
RATE_IDIOM = "-6%"     # 略慢，吐字清晰，适合儿童跟读
PITCH_IDIOM = "+0Hz"

SEMAPHORE = asyncio.Semaphore(12)   # 并发上限，避免被限流


def safe_name(c):
    return c.replace("/", "_").replace("\\", "_").replace(":", "_")


async def generate_one(text, voice, rate, pitch, output_path):
    if os.path.exists(output_path):
        return "skip"
    async with SEMAPHORE:
        for attempt in range(3):
            try:
                communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
                await communicate.save(output_path)
                return "ok"
            except Exception as e:
                if attempt == 2:
                    print(f"  FAIL: {output_path}: {e}")
                    return "fail"
                await asyncio.sleep(1.5 * (attempt + 1))


async def generate_all():
    js_path = os.path.join(BASE, "js", "data-words.js")
    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()
    m = re.search(r'var\s+WORD_BANK\s*=\s*(\{.*\})\s*;?\s*$', content, re.DOTALL)
    if not m:
        print("ERROR: could not parse WORD_BANK")
        return
    bank = json.loads(m.group(1))

    idioms = []
    seen = set()
    for gk, gv in bank.items():
        if not isinstance(gv, dict):
            continue
        sec = gv.get("idioms", {})
        if not isinstance(sec, dict):
            continue
        for lab, arr in sec.items():
            if not isinstance(arr, list):
                continue
            for it in arr:
                c = it.get("c", "") if isinstance(it, dict) else ""
                if not c or c in seen:
                    continue
                seen.add(c)
                idioms.append(c)

    print(f"Unique idioms to generate: {len(idioms)}")

    tasks = []
    for c in idioms:
        path = os.path.join(WORD_DIR, f"{safe_name(c)}.mp3")
        tasks.append(generate_one(c, VOICE_IDIOM, RATE_IDIOM, PITCH_IDIOM, path))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    ok = sum(1 for r in results if r == "ok")
    skip = sum(1 for r in results if r == "skip")
    fail = sum(1 for r in results if r == "fail")
    exc = sum(1 for r in results if isinstance(r, Exception))
    print(f"\nDone! generated={ok} skipped(already exist)={skip} failed={fail} exceptions={exc}")


if __name__ == "__main__":
    asyncio.run(generate_all())
