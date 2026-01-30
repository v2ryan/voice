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
        # Use subprocess to call edge-tts CLI directly
        # This isolates the async loop and avoids Vercel environment issues
        import subprocess
        
        # Run as python module to ensure we find it
        import sys
        
        cmd = [
            sys.executable, "-m", "edge_tts",
            "--text", text,
            "--voice", voice,
            "--rate", rate,
            "--write-media", "-" 
        ]
        
        # Run command and capture binary output
        result = subprocess.run(cmd, capture_output=True, check=True)
        
        return Response(
            content=result.stdout,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "inline",
                "Cache-Control": "no-cache"
            }
        )
    except subprocess.CalledProcessError as e:
        error_msg = f"Subprocess Error: {e.stderr.decode('utf-8') if e.stderr else str(e)}"
        print(error_msg)
        return Response(content=error_msg, status_code=400)
    except Exception as e:
        import traceback
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        print(f"TTS Error: {error_msg}")
        return Response(content=f"Error generating audio: {str(e)}", status_code=400)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
