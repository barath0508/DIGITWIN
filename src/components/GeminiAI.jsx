import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Send, Bot, AlertTriangle, Loader2, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

const SYSTEM_PROMPT = `You are TwinSense AI, an intelligent building monitoring assistant for a smart building digital twin system.
You analyze real-time sensor data and alert about anomalies. Sensors monitored:
- Temperature (°C): Safe <28, Warning 28-32, Danger >32
- Humidity (%): Safe 40-60, Warning 30-40 or 60-70, Danger <30 or >70
- Pressure (hPa): Safe 1000-1020, Warning 980-1000 or 1020-1040, Danger <980 or >1040
- CO₂ (ppm): Safe 400-800, Warning 800-1000, Danger >1000
- CO (ppm): Safe 0-9, Warning 9-35, Danger >35 (evacuation required)
- Noise (mV): Safe 0-500, Warning 500-700, Danger >700
- Flow Rate (L/min): Safe 1-8, Warning 0.5-1 or 8-10, Danger <0.5 or >10

Be concise, use emojis for status (✅ safe, ⚠️ warning, 🚨 danger). When asked about history, reference the provided data snapshots.`;

const callGemini = async (messages) => {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
};

const formatSensorSnapshot = (data) => {
  if (!data) return 'No sensor data available.';
  return `Sensor Reading [${new Date(data.timestamp).toLocaleTimeString()}]:
• Temperature: ${data.dht11.temp?.toFixed(1)}°C
• Humidity: ${data.dht11.humidity?.toFixed(1)}%
• Pressure: ${data.bmp180.pressure?.toFixed(2)} hPa
• CO₂: ${data.co2} ppm
• CO: ${data.co} ppm
• Noise: ${data.noise} mV
• Flow Rate: ${data.flow?.toFixed(1)} L/min`;
};

const getAlertLevel = (data) => {
  if (!data) return null;
  const dangers = [];
  const warnings = [];
  if (data.dht11.temp > 32) dangers.push('Temperature critical');
  else if (data.dht11.temp > 28) warnings.push('Temperature elevated');
  if (data.co > 35) dangers.push('CO level — EVACUATE');
  else if (data.co > 9) warnings.push('CO elevated');
  if (data.co2 > 1000) dangers.push('CO₂ critical');
  else if (data.co2 > 800) warnings.push('CO₂ elevated');
  if (data.dht11.humidity < 30 || data.dht11.humidity > 70) dangers.push('Humidity critical');
  if (data.noise > 700) dangers.push('Noise critical');
  else if (data.noise > 500) warnings.push('Noise elevated');
  if (dangers.length) return { level: 'danger', issues: dangers };
  if (warnings.length) return { level: 'warning', issues: warnings };
  return { level: 'safe', issues: [] };
};

export default function GeminiAI({ data, dataHistory }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const bottomRef = useRef(null);
  const prevDataRef = useRef(null);
  const analyzedRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Auto-analyze on new data (only when values change meaningfully)
  useEffect(() => {
    if (!data || !API_KEY || API_KEY === 'your_gemini_api_key_here') return;
    const key = `${data.dht11.temp}-${data.co2}-${data.co}`;
    if (analyzedRef.current === key) return;
    analyzedRef.current = key;

    const alert = getAlertLevel(data);
    if (alert && alert.level !== 'safe') {
      setAlerts(prev => [
        { id: Date.now(), level: alert.level, issues: alert.issues, time: new Date().toLocaleTimeString() },
        ...prev.slice(0, 4),
      ]);

      // Auto-send alert analysis to chat
      const prompt = `Analyze this sensor reading and provide a brief alert summary:\n${formatSensorSnapshot(data)}`;
      const newMsg = { role: 'user', content: prompt, hidden: true };
      setMessages(prev => {
        const updated = [...prev, newMsg];
        callGemini(updated).then(reply => {
          setMessages(p => [...p, { role: 'assistant', content: reply, auto: true }]);
        }).catch(console.error);
        return updated;
      });
    }
    prevDataRef.current = data;
  }, [data]);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || loading) return;
    if (!API_KEY || API_KEY === 'your_gemini_api_key_here') {
      setMessages(prev => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '⚠️ Please set your VITE_GEMINI_API_KEY in the .env file.' }]);
      setInput('');
      return;
    }

    // Inject context: current data + last 5 history snapshots
    const historyContext = dataHistory?.slice(-5).map(formatSensorSnapshot).join('\n\n') || '';
    const currentContext = data ? `\nCurrent reading:\n${formatSensorSnapshot(data)}` : '';
    const contextualText = historyContext || currentContext
      ? `${text}\n\n[Context - Recent sensor history:\n${historyContext}${currentContext}]`
      : text;

    const userMsg = { role: 'user', content: text };
    const contextMsg = { role: 'user', content: contextualText };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.filter(m => !m.hidden);
      const reply = await callGemini([...history, contextMsg]);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, data, dataHistory]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const alertLevel = getAlertLevel(data);
  const hasAlert = alertLevel && alertLevel.level !== 'safe';

  const quickPrompts = [
    'Analyze current sensor readings',
    'Any dangerous conditions right now?',
    'Show trend from last readings',
    'What actions should I take?',
  ];

  return (
    <>
      {/* Alert Banner */}
      <AnimatePresence>
        {hasAlert && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 text-sm font-semibold ${
              alertLevel.level === 'danger'
                ? 'bg-red-600/95 text-white'
                : 'bg-yellow-500/95 text-slate-900'
            } backdrop-blur-sm`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="animate-pulse" />
              <span>{alertLevel.issues.join(' · ')}</span>
            </div>
            <button onClick={() => { setOpen(true); sendMessage('Explain the current alerts and recommended actions'); }}
              className="underline text-xs opacity-80 hover:opacity-100">
              Ask AI →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Button */}
      <motion.button
        onClick={() => setOpen(o => !o)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-colors ${
          hasAlert
            ? 'bg-red-500 animate-[pulse_1.5s_infinite]'
            : 'bg-gradient-to-br from-blue-500 to-emerald-500'
        }`}
      >
        {open ? <ChevronDown size={22} className="text-white" /> : <Bot size={22} className="text-white" />}
        {alerts.length > 0 && !open && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
            {alerts.length}
          </span>
        )}
      </motion.button>

      {/* Chat Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-24px)] flex flex-col rounded-2xl border border-slate-700/60 bg-slate-900/95 backdrop-blur-xl shadow-2xl overflow-hidden"
            style={{ height: '520px' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-gradient-to-r from-blue-500/10 to-emerald-500/10">
              <div className="flex items-center gap-2">
                <Bot size={18} className="text-blue-400" />
                <span className="font-semibold text-slate-200 text-sm">TwinSense AI</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Gemini 2.0
                </span>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X size={18} />
              </button>
            </div>

            {/* Alert summary */}
            {alerts.length > 0 && (
              <div className="px-3 py-2 border-b border-slate-700/40 space-y-1 max-h-24 overflow-y-auto">
                {alerts.map(a => (
                  <div key={a.id} className={`text-[11px] flex items-center gap-1.5 px-2 py-1 rounded-lg ${
                    a.level === 'danger' ? 'bg-red-500/15 text-red-400' : 'bg-yellow-500/15 text-yellow-400'
                  }`}>
                    <AlertTriangle size={11} />
                    <span>{a.issues.join(', ')}</span>
                    <span className="ml-auto opacity-60">{a.time}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="text-center text-slate-500 text-xs mt-8 space-y-3">
                  <Bot size={32} className="mx-auto text-slate-600" />
                  <p>Ask me about your building's sensor data, trends, or alerts.</p>
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    {quickPrompts.map(q => (
                      <button key={q} onClick={() => sendMessage(q)}
                        className="text-left text-[11px] px-2 py-2 rounded-lg border border-slate-700/60 bg-slate-800/50 text-slate-400 hover:text-slate-200 hover:border-blue-500/40 transition-colors">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.filter(m => !m.hidden).map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-blue-600/80 text-white rounded-br-sm'
                      : m.auto
                        ? 'bg-slate-800/80 text-slate-200 border border-yellow-500/20 rounded-bl-sm'
                        : 'bg-slate-800/80 text-slate-200 rounded-bl-sm'
                  }`}>
                    {m.auto && <span className="text-[10px] text-yellow-400 block mb-1">🤖 Auto-analysis</span>}
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-slate-800/80 px-3 py-2 rounded-2xl rounded-bl-sm flex items-center gap-2 text-slate-400">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-xs">Analyzing...</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-3 border-t border-slate-700/50">
              <div className="flex gap-2 items-end">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Ask about sensors, alerts, trends..."
                  rows={1}
                  className="flex-1 bg-slate-800/60 border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-blue-500/60 transition-colors"
                  style={{ maxHeight: 80 }}
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 text-white disabled:opacity-40 hover:opacity-90 transition-opacity flex-shrink-0"
                >
                  <Send size={15} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
