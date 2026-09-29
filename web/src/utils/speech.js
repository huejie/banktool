/**
 * 浏览器语音识别封装（Web Speech API）。
 * 注意：仅在安全上下文（HTTPS 或 localhost）可用；
 * 手机经 http://局域网IP 访问时浏览器不提供麦克风与识别能力。
 */
export function speechSupported() {
  return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createRecognizer({ onFinal, onPartial, onEnd, onError } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR();
  rec.lang = 'zh-CN';
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (e) => {
    let interim = '';
    let finalText = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t;
      else interim += t;
    }
    if (finalText) onFinal?.(finalText);
    else if (interim) onPartial?.(interim);
  };
  rec.onerror = (e) => {
    // no-speech / aborted 属正常结束，不当作错误提示
    if (e.error && e.error !== 'no-speech' && e.error !== 'aborted') onError?.(e.error);
  };
  rec.onend = () => onEnd?.();
  return rec;
}
