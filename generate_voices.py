#!/usr/bin/env python3
"""
Generate AI voice pack for arcane-study app.
- Incentive/motivation voices (fixed lines) — ~55 files
- System prompt voices (dictation intro/outro etc.) — ~30 files
- Character reading voices (single characters only) — ~400 files
Uses edge-tts (Microsoft neural TTS) for natural, emotional Chinese voice.
"""
import os
import re
import json
import asyncio
import edge_tts

BASE = os.path.dirname(os.path.abspath(__file__))
VOICE_DIR = os.path.join(BASE, "voice")
os.makedirs(VOICE_DIR, exist_ok=True)

VOICE_TEACHER = "zh-CN-XiaoxiaoNeural"   # Warm female teacher (晓晓)
VOICE_YUJIE = "zh-CN-XiaomoNeural"        # Cool female (晓墨) — 古风御姐

RATE_TEACHER = "+8%"
RATE_YUJIE = "-5%"

async def generate(text, voice, rate, output_path, pitch="+0Hz"):
    """Generate a single voice file with error handling."""
    if os.path.exists(output_path):
        return True  # Skip if already generated
    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        await communicate.save(output_path)
        return True
    except Exception as e:
        print(f"  WARN: Failed to generate {output_path}: {e}")
        return False

async def generate_all():
    tasks = []
    manifest = {}

    # ============ 1. Incentive voices ============
    inc_dir = os.path.join(VOICE_DIR, "inc")
    os.makedirs(inc_dir, exist_ok=True)

    tier_lines = {
        1: ["不错，稳稳的。", "答对了，继续。", "有进步，很好。", "稳扎稳打，很好。"],
        2: ["漂亮！状态起来了！", "妙极了，行云流水！", "好一个乘胜追击！", "文思如泉涌，好！"],
        3: ["气势如虹，好！", "才华横溢，佩服！", "这手笔，颇有大家风范！", "挡不住了，继续！"],
        4: ["盖世之姿，从容不迫。", "巅峰之上，云淡风轻。", "高手风范，不过如此。", "百炼成钢，自成一派。"],
    }
    fail_lines = ["无妨，人非圣贤。", "这一题无妨，下一题再来。", "错了就错了，练熟就好。", "别急，慢慢来。"]

    for tier, lines in tier_lines.items():
        for i, line in enumerate(lines):
            path = os.path.join(inc_dir, f"tier{tier}_{i}.mp3")
            tasks.append(generate(line, VOICE_YUJIE, RATE_YUJIE, path))
            manifest[f"inc/tier{tier}_{i}"] = line

    for i, line in enumerate(fail_lines):
        path = os.path.join(inc_dir, f"fail_{i}.mp3")
        tasks.append(generate(line, VOICE_YUJIE, RATE_YUJIE, path))
        manifest[f"inc/fail_{i}"] = line

    ann = {
        1: "第一滴血！", 2: "双杀！", 3: "三杀！", 4: "四杀！", 5: "五杀！",
        6: "六连锐进！", 7: "七连破局！", 8: "八连超群！", 9: "九连凌世！", 10: "十连称雄！",
        15: "才势滔天！", 20: "博览无双！", 25: "思越千古！", 30: "智冠群伦！",
        35: "文思浩荡！", 40: "洞彻万象！", 45: "通识八荒！", 50: "半百封神！",
        55: "学臻化境！", 60: "万虑皆通！", 65: "胸纳经纶！", 70: "睿照千秋！",
        75: "翰墨凌云！", 80: "旷世才思！", 85: "智绝寰宇！", 90: "风华盖世！",
        95: "通达万古！", 100: "百答超神！",
    }
    for k, line in ann.items():
        path = os.path.join(inc_dir, f"ann_{k}.mp3")
        r = RATE_YUJIE if k <= 20 else "-8%"
        p = "+2Hz" if k >= 15 else "+0Hz"
        tasks.append(generate(line, VOICE_YUJIE, r, path, p))
        manifest[f"inc/ann_{k}"] = line

    quiz_lines = {
        "quiz_card": "准备好了吗？我们开始吧。",
        "quiz_poly": "多音字挑战，请做好准备。",
        "quiz_dict": "写字表听写测试，请做好准备。",
    }
    for k, line in quiz_lines.items():
        path = os.path.join(inc_dir, f"{k}.mp3")
        tasks.append(generate(line, VOICE_YUJIE, RATE_YUJIE, path))
        manifest[f"inc/{k}"] = line

    settle_lines = {
        "settle_win_high": "恭喜过关！字正腔圆，好不痛快！",
        "settle_win_mid": "恭喜过关！这一局，行云流水！",
        "settle_win_low": "过关啦！再接再厉，更上层楼！",
        "settle_fail": "无妨。错字已入熔炉，我们一同再练。",
    }
    for k, line in settle_lines.items():
        path = os.path.join(inc_dir, f"{k}.mp3")
        r = "-2%" if "fail" in k else RATE_YUJIE
        tasks.append(generate(line, VOICE_YUJIE, r, path))
        manifest[f"inc/{k}"] = line

    summary_lines = {
        "sum_card_high": "太出色了，这一局几乎全对！",
        "sum_card_mid": "不错，继续加油！",
        "sum_card_low": "别灰心，去熔炉把错字练熟就好。",
        "sum_dict_full": "全部写对，非常棒！",
        "sum_dict_good": "听写完成，表现不错，继续保持。",
        "sum_dict_low": "听写完成，把错字再练几遍就好了。",
    }
    for k, line in summary_lines.items():
        path = os.path.join(inc_dir, f"{k}.mp3")
        tasks.append(generate(line, VOICE_YUJIE, RATE_YUJIE, path))
        manifest[f"inc/{k}"] = line

    # ============ 2. System prompt voices ============
    sys_dir = os.path.join(VOICE_DIR, "sys")
    os.makedirs(sys_dir, exist_ok=True)

    sys_lines = {
        "dict_start": "写字表听写测试，现在开始。",
        "dict_rule": "每题朗读两遍，请在两遍之后写出对应的汉字。",
        "dict_q1": "下面开始第一题。",
        "dict_repeat": "再读一遍。",
        "dict_end": "听写结束，请停止书写。",
        "dict_grade": "下面请对照答案批改，写对的打勾，写错的打叉。",
    }
    cn_nums = ["一","二","三","四","五","六","七","八","九","十",
               "十一","十二","十三","十四","十五","十六","十七","十八","十九","二十"]
    for i, num in enumerate(cn_nums):
        sys_lines[f"num_{i+1}"] = f"第{num}题。"

    for k, line in sys_lines.items():
        path = os.path.join(sys_dir, f"{k}.mp3")
        tasks.append(generate(line, VOICE_TEACHER, RATE_TEACHER, path))
        manifest[f"sys/{k}"] = line

    # ============ 3. Character reading voices (single chars only) ============
    word_dir = os.path.join(VOICE_DIR, "word")
    os.makedirs(word_dir, exist_ok=True)

    js_path = os.path.join(BASE, "js", "data-words.js")
    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()

    match = re.search(r'var\s+WORD_BANK\s*=\s*(\{.*\})\s*;?\s*$', content, re.DOTALL)
    if not match:
        print("ERROR: Could not parse WORD_BANK")
        return

    bank = json.loads(match.group(1))
    char_count = 0
    seen = set()

    for grade_key, grade_data in bank.items():
        if not isinstance(grade_data, dict):
            continue
        # Only process shizi, xiezi sections (single characters)
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
                    # Only generate for single characters
                    if not c or len(c) != 1 or c in seen:
                        continue
                    seen.add(c)
                    words = item.get("w", []) or item.get("d", [])
                    words = [w for w in words if w][:3]
                    if words:
                        reading = f"{c}。{'，'.join(words)}。"
                    else:
                        reading = f"{c}。"
                    safe_name = c.replace("/", "_").replace("\\", "_").replace(":", "_")
                    path = os.path.join(word_dir, f"{safe_name}.mp3")
                    tasks.append(generate(reading, VOICE_TEACHER, RATE_TEACHER, path))
                    manifest[f"word/{safe_name}"] = reading
                    char_count += 1

        # Polyphonic characters (single chars)
        if "poly" in grade_data and isinstance(grade_data["poly"], list):
            for item in grade_data["poly"]:
                if not isinstance(item, dict):
                    continue
                c = item.get("c", "")
                if not c or len(c) != 1 or c in seen:
                    continue
                seen.add(c)
                readings = item.get("r", [])
                all_words = []
                for rd in readings:
                    if isinstance(rd, dict):
                        all_words.extend((rd.get("w") or [])[:2])
                all_words = all_words[:3]
                if all_words:
                    reading = f"{c}。{'，'.join(all_words)}。"
                else:
                    reading = f"{c}。"
                safe_name = c.replace("/", "_").replace("\\", "_").replace(":", "_")
                path = os.path.join(word_dir, f"{safe_name}.mp3")
                tasks.append(generate(reading, VOICE_TEACHER, RATE_TEACHER, path))
                manifest[f"word/{safe_name}"] = reading
                char_count += 1

    print(f"Total voice files to generate: {len(tasks)}")
    print(f"  Incentive: ~55")
    print(f"  System: ~30")
    print(f"  Character readings: {char_count}")

    # Generate in batches of 5 to be gentle on the TTS service
    batch_size = 5
    completed = 0
    failed = 0
    for i in range(0, len(tasks), batch_size):
        batch = tasks[i:i+batch_size]
        results = await asyncio.gather(*batch, return_exceptions=True)
        for r in results:
            if r is True:
                completed += 1
            elif isinstance(r, Exception):
                failed += 1
                completed += 1
            else:
                completed += 1
        if completed % 50 < batch_size:
            print(f"  Progress: {completed}/{len(tasks)} ({completed*100//len(tasks)}%) — failed: {failed}")

    # Save manifest
    manifest_path = os.path.join(VOICE_DIR, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"\nDone! {completed} files processed, {failed} failed.")
    print(f"Manifest saved to {manifest_path}")

if __name__ == "__main__":
    asyncio.run(generate_all())
