#!/usr/bin/env python3
"""
Generate extra AI voice packs for arcane-study app (Task 1 + Task 4):
- English incentive voices (12 phrases + 3 fail) — excited, high-pitched
- Math voice pack: numbers 0-99 + operators (高亢 standard Mandarin)
- Dictation prompt voices (报听写)
- Review/forge prompt voices (错字熔炉)
- Per-character example sentences (例句)

Uses edge-tts (Microsoft neural TTS).
"""
import os
import re
import json
import asyncio
import edge_tts

BASE = os.path.dirname(os.path.abspath(__file__))
VOICE_DIR = os.path.join(BASE, "voice")
os.makedirs(VOICE_DIR, exist_ok=True)

# ── Voice roles ──
VOICE_ENG = "en-US-JennyNeural"          # Energetic English (high pitch, excited)
VOICE_MAN = "zh-CN-XiaoxiaoNeural"       # Bright standard Mandarin (高亢)
VOICE_DICT = "zh-CN-XiaoxiaoNeural"      # Standard Mandarin for dictation
VOICE_REV = "zh-CN-XiaoxiaoNeural"       # Standard Mandarin for review

RATE_ENG = "+18%"      # faster → excited
PITCH_ENG = "+30Hz"    # high pitch
RATE_MAN = "+12%"      # brighter/faster
PITCH_MAN = "+18Hz"
RATE_DICT = "+8%"
PITCH_DICT = "+14Hz"
RATE_REV = "+6%"
PITCH_REV = "+12Hz"


async def generate(text, voice, rate, output_path, pitch="+0Hz"):
    if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
        return True
    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        await communicate.save(output_path)
        return True
    except Exception as e:
        print(f"  WARN: Failed to generate {output_path}: {e}")
        return False


def num_cn(n):
    cn = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
    if n < 10:
        return cn[n]
    if n < 20:
        return '十' + (cn[n % 10] if n % 10 else '')
    if n < 100:
        tens = cn[n // 10]
        ones = n % 10
        return tens + '十' + (cn[ones] if ones else '')
    return '一百'


async def generate_all():
    tasks = []
    manifest = {}

    # ============ 1. English incentive voices ============
    inc_dir = os.path.join(VOICE_DIR, "inc")
    os.makedirs(inc_dir, exist_ok=True)

    eng_phrases = [
        "Excellent performance!", "Impressive!", "Amazing!", "You are on fire!",
        "Fantastic!", "Unbelievable!", "Outstanding!", "Perfect!",
        "Well done!", "Nice job!", "Good answer!", "Great!",
    ]
    for i, line in enumerate(eng_phrases):
        path = os.path.join(inc_dir, f"eng_{i}.mp3")
        tasks.append(generate(line, VOICE_ENG, RATE_ENG, path, PITCH_ENG))
        manifest[f"inc/eng_{i}"] = line

    eng_fail = ["Not quite, try again!", "So close! Keep going!", "Almost! One more try!"]
    for i, line in enumerate(eng_fail):
        path = os.path.join(inc_dir, f"eng_fail_{i}.mp3")
        tasks.append(generate(line, VOICE_ENG, RATE_ENG, path, PITCH_ENG))
        manifest[f"inc/eng_fail_{i}"] = line

    # ============ 2. Math voice pack (numbers + operators) ============
    math_dir = os.path.join(VOICE_DIR, "math")
    os.makedirs(math_dir, exist_ok=True)

    for n in range(0, 100):
        path = os.path.join(math_dir, f"num_{n}.mp3")
        tasks.append(generate(num_cn(n), VOICE_MAN, RATE_MAN, path, PITCH_MAN))
        manifest[f"math/num_{n}"] = num_cn(n)

    math_ops = {
        "op_add": "加", "op_sub": "减", "op_mul": "乘",
        "op_de": "得", "op_eq": "等于",
        "op_de_ji": "得几", "op_eq_ji": "等于几",
    }
    for k, line in math_ops.items():
        path = os.path.join(math_dir, f"{k}.mp3")
        tasks.append(generate(line, VOICE_MAN, RATE_MAN, path, PITCH_MAN))
        manifest[f"math/{k}"] = line

    # ============ 3. Dictation prompt voices (报听写) ============
    dict_dir = os.path.join(VOICE_DIR, "dict")
    os.makedirs(dict_dir, exist_ok=True)

    dict_lines = {
        "start": "写字表听写测试，现在开始。",
        "intro_pre": "本次听写共",
        "intro_suf": "个生字。每个生字朗读四个词语，其中最后一个是成语。",
        "rule": "每题朗读两遍，请在两遍之后写出对应的汉字。",
        "q1": "下面开始第一题。",
        "end": "听写结束，请停止书写。",
        "grade": "下面请对照答案批改，写对的打勾，写错的打叉。",
        "sum_full": "全部写对，非常棒！",
        "sum_good": "听写完成，表现不错，继续保持。",
        "sum_low": "听写完成，把错字再练几遍就好了。",
    }
    for k, line in dict_lines.items():
        path = os.path.join(dict_dir, f"{k}.mp3")
        tasks.append(generate(line, VOICE_DICT, RATE_DICT, path, PITCH_DICT))
        manifest[f"dict/{k}"] = line

    # ============ 4. Review / forge prompt voices (错字熔炉) ============
    rev_dir = os.path.join(VOICE_DIR, "review")
    os.makedirs(rev_dir, exist_ok=True)

    rev_lines = {
        "right": "写对了！",
        "wrong_tip": "再听一遍，记住它。",
        "correct_write": "正确写法：",
        "reveal": "正确答案是",
        "listen_tip": "点击喇叭听读音，然后写出这个字。",
        "done": "听写完成！",
    }
    for k, line in rev_lines.items():
        path = os.path.join(rev_dir, f"{k}.mp3")
        tasks.append(generate(line, VOICE_REV, RATE_REV, path, PITCH_REV))
        manifest[f"review/{k}"] = line

    # ============ 5. Per-character example sentences ============
    sent_dir = os.path.join(VOICE_DIR, "sent")
    os.makedirs(sent_dir, exist_ok=True)

    js_path = os.path.join(BASE, "js", "data-words.js")
    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()
    match = re.search(r'var\s+WORD_BANK\s*=\s*(\{.*\})\s*;?\s*$', content, re.DOTALL)
    if match:
        bank = json.loads(match.group(1))
        seen = set()
        for grade_key, grade_data in bank.items():
            if not isinstance(grade_data, dict):
                continue
            for sec in ["shizi", "xiezi"]:
                if sec not in grade_data:
                    continue
                for lesson, items in grade_data[sec].items():
                    if not isinstance(items, list):
                        continue
                    for item in items:
                        if not isinstance(item, dict):
                            continue
                        c = item.get("c", "")
                        s = item.get("s", "")
                        if not c or len(c) != 1 or not s or c in seen:
                            continue
                        # skip pure whitespace/placeholder sentences
                        if len(s.strip()) < 4:
                            continue
                        seen.add(c)
                        reading = f"{c}。{s}"
                        safe = c.replace("/", "_").replace("\\", "_").replace(":", "_")
                        path = os.path.join(sent_dir, f"{safe}.mp3")
                        tasks.append(generate(reading, VOICE_REV, RATE_REV, path, PITCH_REV))
                        manifest[f"sent/{safe}"] = reading
            # poly chars
            if "poly" in grade_data and isinstance(grade_data["poly"], list):
                for item in grade_data["poly"]:
                    if not isinstance(item, dict):
                        continue
                    c = item.get("c", "")
                    s = item.get("s", "")
                    if not c or len(c) != 1 or not s or c in seen:
                        continue
                    seen.add(c)
                    reading = f"{c}。{s}"
                    safe = c.replace("/", "_").replace("\\", "_").replace(":", "_")
                    path = os.path.join(sent_dir, f"{safe}.mp3")
                    tasks.append(generate(reading, VOICE_REV, RATE_REV, path, PITCH_REV))
                    manifest[f"sent/{safe}"] = reading

    print(f"Total voice files to generate: {len(tasks)}")
    batch_size = 8
    completed = 0
    failed = 0
    for i in range(0, len(tasks), batch_size):
        batch = tasks[i:i + batch_size]
        results = await asyncio.gather(*batch, return_exceptions=True)
        for r in results:
            completed += 1
            if isinstance(r, Exception):
                failed += 1
        if completed % 100 < batch_size:
            print(f"  Progress: {completed}/{len(tasks)} ({completed * 100 // len(tasks)}%) — failed: {failed}")

    # Merge with existing manifest
    manifest_path = os.path.join(VOICE_DIR, "manifest.json")
    if os.path.exists(manifest_path):
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                old = json.load(f)
            old.update(manifest)
            manifest = old
        except Exception:
            pass
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"\nDone! {completed} files processed, {failed} failed.")
    print(f"Manifest saved to {manifest_path}")


if __name__ == "__main__":
    asyncio.run(generate_all())
