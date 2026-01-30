import asyncio
import edge_tts

async def test_tts():
    print("Testing TTS generation...")
    text = "你好，这是一个测试。"
    voice = "zh-CN-XiaoxiaoNeural"
    communicate = edge_tts.Communicate(text, voice)
    
    data_len = 0
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            data_len += len(chunk["data"])
            
    print(f"TTS Generated {data_len} bytes of audio.")

if __name__ == "__main__":
    asyncio.run(test_tts())
