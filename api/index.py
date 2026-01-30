from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, Response
from pydantic import BaseModel
import jieba
from pypinyin import pinyin, Style
import edge_tts
import asyncio
import tempfile
import os
import uuid
import sys
import io
from typing import List, Optional

# Configure Jieba to use /tmp for caching (required for Vercel)
if os.environ.get('VERCEL'):
    jieba.dt.tmp_dir = '/tmp'
else:
    jieba.dt.tmp_dir = tempfile.gettempdir()

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges"],
)

class TextRequest(BaseModel):
    text: str

class Word(BaseModel):
    hanzi: str
    pinyin: str

class Paragraph(BaseModel):
    words: List[Word]

@app.post("/api/analyze", response_model=List[Paragraph])
@app.post("/analyze", response_model=List[Paragraph])
async def analyze_text(request: TextRequest):
    try:
        lines = request.text.split('\n')
        paragraphs = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            words = []
            segments = jieba.cut(line)
            for seg in segments:
                if not seg.strip():
                    continue
                
                # Check if it contains Chinese characters
                if any('\u4e00' <= char <= '\u9fff' for char in seg):
                    py_list = pinyin(seg, style=Style.TONE)
                    py = ' '.join([p[0] for p in py_list])
                    words.append(Word(hanzi=seg, pinyin=py))
                else:
                    words.append(Word(hanzi=seg, pinyin=""))
            
            if words:
                paragraphs.append(Paragraph(words=words))
        
        return paragraphs
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tts")
@app.get("/tts")
async def get_tts(text: str, voice: str = "zh-CN-XiaoxiaoNeural", rate: str = "+0%"):
    try:
        if not text:
            return Response(content="Error: No text provided", status_code=400)

        # Import and patch asyncio to allow nested loops (Critical for Vercel/FastAPI)
        import nest_asyncio
        nest_asyncio.apply()
        
        # Buffer to store audio
        buff = io.BytesIO()
        
        # Use simple Communicate object
        communicate = edge_tts.Communicate(text, voice, rate=rate)
        
        # Iterate over stream
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buff.write(chunk["data"])
                
        audio_data = buff.getvalue()
        
        if len(audio_data) == 0:
             return Response(content="Error: Generated audio is empty", status_code=500)

        return Response(
            content=audio_data,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "inline",
                "Cache-Control": "no-cache"
            }
        )

    except Exception as e:
        import traceback
        # Capture full traceback
        exc_type, exc_value, exc_traceback = sys.exc_info()
        tb_str = "".join(traceback.format_exception(exc_type, exc_value, exc_traceback))
        
        print(f"CRITICAL TTS ERROR: {tb_str}")
        
        # Returns 400 with detailed error so frontend can read and display it
        return Response(
            content=f"Error: {str(e)}\n\nDetails:\n{tb_str}", 
            status_code=400
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
