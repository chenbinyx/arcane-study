#!/usr/bin/env python3
"""
Fix inc/ voice files — regenerate all incentive voices using zh-CN-XiaoyiNeural
(the original zh-CN-XiaomoNeural voice is unavailable via edge-tts).
"""
import os
import asyncio
import edge_tts

BASE = os.path.dirname(os.path.abspath(__file__))
INC_DIR = os.path.join(BASE, "voice", "inc")
os.makedirs(INC_DIR, exist_ok=True)

VOICE = "zh-CN-XiaoyiNeural"  # 晓依 — lively female, best alternative to broken Xiaomo
RATE = "+2%"                  # Slightly faster for motivational tone
PITCH = "+3Hz"                # Slightly higher pitch for excitement

async def generate(text, path, rate=None, pitch=None):
    """Generate a single voice file, overwriting any existing 0-byte file."""
    try:
        communicate = edge_tts.Communicate(
            text,
            voice=VOICE,
            rate=rate or RATE,
            pitch=pitch or PITCH
        )
        await communicate.save(path)
        size = os.path.getsize(path)
        if size == 0:
            print(f"  FAIL (0 bytes): {os.path.basename(path)}")
            return False
        print(f"  OK: {os.path.basename(path)} -> {size} bytes")
        return True
    except Exception as e:
        print(f"  FAIL: {os.path.basename(path)} -> {e}")
        return False

async def main():
    tasks = []
    total = 0
    ok = 0

    # --- Tier lines (4 tiers × 4 lines each) ---
    tier_lines = {
        1: ["不错，稳稳的。", "答对了，继续。", "有进步，很好。", "稳扎稳打，很好。"],
        2: ["漂亮！状态起来了！", "妙极了，行云流水！", "好一个乘胜追击！", "文思如泉涌，好！"],
        3: ["气势如虹，好！", "才华横溢，佩服！", "这手笔，颇有大家风范！", "挡不住了，继续！"],
        4: ["盖世之姿，从容不迫。", "巅峰之上，云淡风轻。", "高手风范，不过如此。", "百炼成钢，自成一派。"],
    }
    for tier, lines in tier_lines.items():
        for i, line in enumerate(lines):
            path = os.path.join(INC_DIR, f"tier{tier}_{i}.mp3")
            total += 1
            tasks.append(generate(line, path))

    # --- Fail lines ---
    fail_lines = ["无妨，人非圣贤。", "这一题无妨，下一题再来。", "错了就错了，练熟就好。", "别急，慢慢来。"]
    for i, line in enumerate(fail_lines):
        path = os.path.join(INC_DIR, f"fail_{i}.mp3")
        total += 1
        tasks.append(generate(line, path, rate="-3%", pitch="-2Hz"))

    # --- Announcement lines (combo milestones) ---
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
        path = os.path.join(INC_DIR, f"ann_{k}.mp3")
        r = "+5%" if k <= 10 else ("+2%" if k <= 20 else "-2%")
        total += 1
        tasks.append(generate(line, path, rate=r))

    # --- Quiz opening lines ---
    quiz_lines = {
        "quiz_card": "准备好了吗？我们开始吧。",
        "quiz_poly": "多音字挑战，请做好准备。",
        "quiz_dict": "写字表听写测试，请做好准备。",
    }
    for k, line in quiz_lines.items():
        path = os.path.join(INC_DIR, f"{k}.mp3")
        total += 1
        tasks.append(generate(line, path))

    # --- Settle lines ---
    settle_lines = {
        "settle_win_high": "恭喜过关！字正腔圆，好不痛快！",
        "settle_win_mid": "恭喜过关！这一局，行云流水！",
        "settle_win_low": "过关啦！再接再厉，更上层楼！",
        "settle_fail": "无妨。错字已入熔炉，我们一同再练。",
    }
    for k, line in settle_lines.items():
        path = os.path.join(INC_DIR, f"{k}.mp3")
        r = "-2%" if "fail" in k else RATE
        total += 1
        tasks.append(generate(line, path, rate=r))

    # --- Summary lines ---
    summary_lines = {
        "sum_card_high": "太出色了，这一局几乎全对！",
        "sum_card_mid": "不错，继续加油！",
        "sum_card_low": "别灰心，去熔炉把错字练熟就好。",
        "sum_dict_full": "全部写对，非常棒！",
        "sum_dict_good": "听写完成，表现不错，继续保持。",
        "sum_dict_low": "听写完成，把错字再练几遍就好了。",
    }
    for k, line in summary_lines.items():
        path = os.path.join(INC_DIR, f"{k}.mp3")
        total += 1
        tasks.append(generate(line, path))

    print(f"Total inc files to regenerate: {total}")

    # Generate in batches
    batch_size = 3
    for i in range(0, len(tasks), batch_size):
        batch = tasks[i:i+batch_size]
        results = await asyncio.gather(*batch, return_exceptions=True)
        for r in results:
            if r is True:
                ok += 1
        if (i // batch_size) % 10 == 0:
            print(f"  Progress: {i}/{len(tasks)} — ok: {ok}")

    print(f"\nDone! {ok}/{total} files regenerated successfully.")

if __name__ == "__main__":
    asyncio.run(main())
