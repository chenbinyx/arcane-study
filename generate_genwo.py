# 生成「跟我念」引导语（乘法口诀纠错教学用，与口诀/成语同音色体系）
import asyncio, sys, os
import edge_tts

async def main():
    out = os.path.join(os.path.dirname(__file__), 'voice', 'sys', 'genwo_nian.mp3')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    tts = edge_tts.Communicate('跟我念', voice='zh-CN-YunyangNeural', rate='-8%', pitch='-2Hz')
    await tts.save(out)
    print('OK', out, os.path.getsize(out), 'bytes')

asyncio.run(main())
