from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
import jieba
from pypinyin import pinyin, Style
import edge_tts
import asyncio
import tempfile
import os
import uuid
from typing import List, Optional

# Configure Jieba to use /tmp for caching (required for Vercel)
if os.environ.get('VERCEL'):
    jieba.dt.tmp_dir = '/tmp'
else:
    jieba.dt.tmp_dir = tempfile.gettempdir()

app = FastAPI()

# Enable CORS for development
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
        # Buffer audio in memory to avoid disk issues on Vercel
        import io
        from fastapi.responses import Response
        
        buff = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buff.write(chunk["data"])
        
        # Get the full binary content
        audio_data = buff.getvalue()
        
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
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        print(f"TTS Error: {error_msg}") # Logs to Vercel console
        # Return 400 so frontend can read the error text
        return Response(content=f"Error generating audio: {str(e)}", status_code=400)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
