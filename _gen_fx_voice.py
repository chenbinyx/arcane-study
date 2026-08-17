# -*- coding: utf-8 -*-
"""用 edge-tts（微软神经网络 云扬 zh-CN-YunyangNeural 浑厚男音）预生成
   字词卡牌「答对」激励语音，输出到 voice/fx/。"""
import asyncio, os, sys
import edge_tts

VOICE = "zh-CN-YunyangNeural"   # 云扬：浑厚男声（新闻主播风格，沉稳有厚度）
OUT = os.path.join(os.path.dirname(__file__), "voice", "fx")
os.makedirs(OUT, exist_ok=True)

# 普通答对：随连击递增强度（combo 越高越热烈）
PHRASES = {
    "correct_0": ("正确！", "-6%"),
    "correct_1": ("答对了！", "-6%"),
    "correct_2": ("好！", "-4%"),
    "correct_3": ("不错！", "-5%"),
    "correct_4": ("很好！", "-5%"),
    "correct_5": ("真棒！", "-6%"),
    "correct_6": ("厉害！", "-6%"),
    "correct_7": ("继续！", "-4%"),
    # 里程碑（combo 为 5 的倍数）：更燃
    "milestone_0": ("太棒了！", "-7%"),
    "milestone_1": ("了不起！", "-7%"),
    "milestone_2": ("势如破竹！", "-8%"),
}

async def gen(name, text, rate):
    path = os.path.join(OUT, name + ".mp3")
    if os.path.exists(path) and os.path.getsize(path) > 500:
        print("skip 已存在:", name)
        return
    comm = edge_tts.Communicate(text, VOICE, rate=rate)
    await comm.save(path)
    print("OK", name, text, os.path.getsize(path), "bytes")

async def main():
    for name, (text, rate) in PHRASES.items():
        try:
            await gen(name, text, rate)
        except Exception as e:
            print("FAIL", name, repr(e)); sys.exit(2)

asyncio.run(main())
print("ALL DONE")
