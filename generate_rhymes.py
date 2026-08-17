#!/usr/bin/env python3
"""
Generate 45 complete multiplication rhyme voice files (一句一个完整 MP3).
Saves to voice/rhyme/<a>x<b>.mp3 — e.g., 二二得四 → 2x2.mp3.

Uses edge-tts (zh-CN-XiaoxiaoNeural, high-energy standard Mandarin).
"""
import os
import asyncio
import edge_tts

BASE = os.path.dirname(os.path.abspath(__file__))
VOICE = "zh-CN-XiaoxiaoNeural"
RATE = "+12%"
PITCH = "+18Hz"
CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']


def rhyme_num(n):
    """Convert product to Chinese rhyme form:
       10 → 一十, 15 → 一十五, 20 → 二十, 56 → 五十六"""
    if n < 10:
        return CN[n]
    if n == 10:
        return '一十'
    if n < 20:
        return '一十' + CN[n % 10]
    tens = CN[n // 10] + '十'
    if n % 10 == 0:
        return tens
    return tens + CN[n % 10]


def rhyme_text(a, b):
    """a ≤ b, e.g. (2,2) → '二二得四', (3,4) → '三四一十二'"""
    p = a * b
    if p < 10:
        return CN[a] + CN[b] + '得' + CN[p]
    return CN[a] + CN[b] + rhyme_num(p)


async def generate(text, output_path):
    if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
        return True
    try:
        communicate = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH)
        await communicate.save(output_path)
        return True
    except Exception as e:
        print(f"  FAIL: {output_path} — {e}")
        return False


async def main():
    rhyme_dir = os.path.join(BASE, "voice", "rhyme")
    os.makedirs(rhyme_dir, exist_ok=True)

    tasks = []
    for b in range(1, 10):
        for a in range(1, b + 1):
            text = rhyme_text(a, b)
            path = os.path.join(rhyme_dir, f"{a}x{b}.mp3")
            tasks.append(generate(text, path))

    print(f"Generating {len(tasks)} rhyme MP3s...")
    batch_size = 8
    done = 0
    failed = 0
    for i in range(0, len(tasks), batch_size):
        batch = tasks[i:i + batch_size]
        results = await asyncio.gather(*batch, return_exceptions=True)
        for r in results:
            done += 1
            if isinstance(r, Exception) or r is False:
                failed += 1
        print(f"  {done}/{len(tasks)} — failed: {failed}")

    print(f"\nDone! {done - failed}/{done} rhymes generated.")
    # Verify sizes
    for b in range(1, 10):
        for a in range(1, b + 1):
            path = os.path.join(rhyme_dir, f"{a}x{b}.mp3")
            sz = os.path.getsize(path) if os.path.exists(path) else 0
            print(f"  {a}x{b}.mp3  {sz:>7} bytes  |  {rhyme_text(a,b)}")


if __name__ == "__main__":
    asyncio.run(main())
