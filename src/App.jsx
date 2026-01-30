import React, { useState, useEffect, useRef } from 'react'
import { Play, Pause, Square, FileText, Settings, Volume2, FastForward } from 'lucide-react'

function App() {
  const [text, setText] = useState("見證就是神的話在人身上作工達到的果效。\n\n神的話語是生命的糧食，能滋養我們的靈魂。\n\n信心是所望之事的實底，是未見之事的確據。");
  const [paragraphs, setParagraphs] = useState([]);
  const [currentParaIndex, setCurrentParaIndex] = useState(-1);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState(0);
  const [status, setStatus] = useState("就緒");

  const audioRef = useRef(null);
  const abortControllerRef = useRef(null);
  const playbackTimerRef = useRef(null);

  // Load available Chinese voices from browser
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      // Filter for Chinese/Mandarin voices, prioritize Mandarin over Cantonese
      const chineseVoices = voices.filter(v =>
        v.lang.includes('zh') || v.lang.includes('cmn') || v.lang.includes('CN')
      ).sort((a, b) => {
        // Prioritize Mandarin (zh-CN, cmn) over Cantonese (zh-HK, yue)
        const aIsMandarin = a.lang.includes('CN') || a.lang.includes('TW') || a.lang.includes('cmn');
        const bIsMandarin = b.lang.includes('CN') || b.lang.includes('TW') || b.lang.includes('cmn');
        const aIsCantonese = a.lang.includes('HK') || a.lang.includes('yue') || a.name.toLowerCase().includes('cantonese');
        const bIsCantonese = b.lang.includes('HK') || b.lang.includes('yue') || b.name.toLowerCase().includes('cantonese');

        if (aIsMandarin && !bIsMandarin) return -1;
        if (!aIsMandarin && bIsMandarin) return 1;
        if (aIsCantonese && !bIsCantonese) return 1;
        if (!aIsCantonese && bIsCantonese) return -1;
        return 0;
      });

      if (chineseVoices.length > 0) {
        setAvailableVoices(chineseVoices);
        setSelectedVoiceIndex(0);
      }
    };

    // Load voices (may need to wait for them to be available)
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const analyzeText = async () => {
    try {
      setStatus("正在分析文字...");
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (Array.isArray(data)) {
        setParagraphs(data);
        setStatus(`已載入 ${data.length} 個段落`);
      } else {
        console.error("API Error:", data);
        setStatus("載入失敗：伺服器錯誤");
        alert("Server Error: " + JSON.stringify(data));
      }
    } catch (error) {
      console.error(error);
      setStatus("載入失敗");
    }
  };

  const stopPlayback = () => {
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentParaIndex(-1);
    setCurrentWordIndex(-1);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
    }
    // Stop Web Speech API
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setStatus("已停止");
  };

  const playFromParagraph = async (paraIdx, wordIdx = 0) => {
    if (paraIdx >= paragraphs.length) {
      stopPlayback();
      setStatus("播放完成");
      return;
    }

    setIsPlaying(true);
    setIsPaused(false);
    setCurrentParaIndex(paraIdx);

    const paragraph = paragraphs[paraIdx];
    const wordsToSpeak = paragraph.words.slice(wordIdx);
    const textToSpeak = wordsToSpeak.map(w => w.hanzi).join('');

    setStatus(`正在播放第 ${paraIdx + 1} 段...`);

    // Use Web Speech API (works reliably in browser)
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Stop any previous speech

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = 'zh-CN';
      utterance.rate = speed;

      // Use the user-selected voice
      if (availableVoices.length > 0 && availableVoices[selectedVoiceIndex]) {
        utterance.voice = availableVoices[selectedVoiceIndex];
        console.log('Using voice:', availableVoices[selectedVoiceIndex].name, availableVoices[selectedVoiceIndex].lang);
      }

      // Estimate duration and time per word
      const estimatedDuration = textToSpeak.length * 0.3 / speed; // ~0.3s per character
      const timePerWord = (estimatedDuration / wordsToSpeak.length) * 1000;

      // Start highlighting
      let currentIdx = wordIdx;
      setCurrentWordIndex(currentIdx);

      const highlightInterval = setInterval(() => {
        if (currentIdx < paragraph.words.length - 1) {
          currentIdx++;
          setCurrentWordIndex(currentIdx);
        }
      }, timePerWord);

      utterance.onend = () => {
        clearInterval(highlightInterval);
        setCurrentWordIndex(-1);
        // Move to next paragraph
        setTimeout(() => {
          playFromParagraph(paraIdx + 1);
        }, 500);
      };

      utterance.onerror = (e) => {
        console.error("Speech error", e);
        clearInterval(highlightInterval);
        setStatus("播放出錯");
        stopPlayback();
      };

      window.speechSynthesis.speak(utterance);
    } else {
      setStatus("瀏覽器不支援語音合成");
      stopPlayback();
    }
  };

  const togglePause = () => {
    if (!isPlaying) return;

    if (isPaused) {
      setIsPaused(false);
      window.speechSynthesis.resume();
      setStatus("繼續播放");
    } else {
      setIsPaused(true);
      window.speechSynthesis.pause();
      setStatus("已暫停");
    }
  };

  const handleWordClick = (paraIdx, wordIdx) => {
    if (isPlaying) return;
    playFromParagraph(paraIdx, wordIdx);
  };

  return (
    <div className="app-container">
      <div className="left-panel">
        <div className="header">
          <h1>📖 Yuèdú Pro 中文閱讀器</h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>流暢朗讀，精準拼音 <span style={{ marginLeft: '10px', background: '#3b82f6', color: 'white', padding: '2px 8px', borderRadius: '8px', fontSize: '11px' }}>v1.4</span></p>
        </div>

        <div className="reading-area">
          {paragraphs.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
              <FileText size={48} mb={2} />
              <p>請在右側輸入文字並點擊「載入」</p>
            </div>
          ) : (
            paragraphs.map((para, pIdx) => (
              <div key={pIdx} className="paragraph">
                {para.words.map((word, wIdx) => (
                  <div
                    key={wIdx}
                    className={`word-card ${currentParaIndex === pIdx && currentWordIndex === wIdx ? 'active speaking' : ''}`}
                    onClick={() => handleWordClick(pIdx, wIdx)}
                  >
                    <div className="pinyin">{word.pinyin}</div>
                    <div className="hanzi">{word.hanzi}</div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="right-panel">
        <div className="control-group">
          <label className="control-label">文字內容</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="請輸入中文..."
          />
          <button className="primary-btn" onClick={analyzeText}>
            <FileText size={18} /> 載入文字
          </button>
        </div>

        <div className="control-group">
          <label className="control-label">語音設定 ({availableVoices.length} 個可用)</label>
          <select
            value={selectedVoiceIndex}
            onChange={(e) => setSelectedVoiceIndex(parseInt(e.target.value))}
          >
            {availableVoices.length === 0 ? (
              <option value={0}>載入中...</option>
            ) : (
              availableVoices.map((voice, idx) => (
                <option key={idx} value={idx}>
                  {voice.name} ({voice.lang})
                </option>
              ))
            )}
          </select>
        </div>

        <div className="control-group slider-container">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <label className="control-label">朗讀速度</label>
            <span style={{ fontSize: '12px', color: '#64748b' }}>{speed.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
          <button
            className="success-btn"
            onClick={() => playFromParagraph(0)}
            disabled={paragraphs.length === 0 || isPlaying}
          >
            <Play size={18} /> 從頭播放
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="warning-btn"
              style={{ flex: 1 }}
              onClick={togglePause}
              disabled={!isPlaying}
            >
              {isPaused ? <Play size={18} /> : <Pause size={18} />} {isPaused ? '繼續' : '暫停'}
            </button>
            <button
              className="danger-btn"
              style={{ flex: 1 }}
              onClick={stopPlayback}
              disabled={!isPlaying}
            >
              <Square size={18} /> 停止
            </button>
          </div>
        </div>

        <div className="stats">
          狀態：{status}
        </div>

        <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: '1.4' }}>
          💡 提示：<br />
          • 點擊字詞可從該處開始播放<br />
          • 播放中請先停止再切換位置
        </div>
      </div>
    </div>
  )
}

export default App
