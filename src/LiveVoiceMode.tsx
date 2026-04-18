/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, PhoneOff, Volume2, Sparkles, Heart, AlertCircle } from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "./services/geminiService";

interface LiveVoiceModeProps {
  onClose: () => void;
}

export default function LiveVoiceMode({ onClose }: LiveVoiceModeProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [status, setStatus] = useState('Connecting to Haya...');
  const [errorCount, setErrorCount] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveSessionRef = useRef<any>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [volumeLevel, setVolumeLevel] = useState(0);

  useEffect(() => {
    startVoiceSession();
    return () => stopVoiceSession();
  }, []);

  const startVoiceSession = async () => {
    try {
      setStatus('Initializing Haya...');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioCtx({ sampleRate: 16000 });
      
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.gain.value = 2.2; 
      gainNodeRef.current.connect(audioContextRef.current.destination);
      
      const session = await ai.live.connect({
        model: "gemini-2.0-flash-exp",
        config: {
          generationConfig: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
            },
          },
          systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION + "\n\nCRITICAL: You are Haya, a young Indian girl. Talk fast, be sweet, and speak ONLY in Urdu. Never sound robotic." }]
          }
        }
      } as any); // Use as any to prevent strict type errors during connect

      // Using the event handler pattern which is common in newer Live SDKs
      (session as any).on('open', () => {
        setIsConnected(true);
        setStatus('Haya is here...');
        startMic();
        
        (session as any).sendRealtimeInput({
          text: "Haya, aap abhi user se connect hui hain. Foran unhein bohat pyar se Urdu mein salam karein (Asalam-u-alaikum). Just a quick greeting."
        });
      });

      (session as any).on('content', (content: any) => {
        if (content.modelTurn) {
          content.modelTurn.parts.forEach((part: any) => {
            if (part.inlineData) enqueueAudio(part.inlineData.data);
            if (part.text) setTranscription(part.text);
          });
        }
        if (content.interrupted) stopPlayback();
      });

      (session as any).on('error', (err: any) => {
        console.error('Session error:', err);
        setStatus('Connection glitch. Please retry.');
        setIsConnected(false);
      });

      liveSessionRef.current = session;
    } catch (error) {
      console.error('Initial session failure:', error);
      setStatus('Could not start call. Tap to retry.');
    }
  };

  const startMic = async () => {
    try {
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const source = audioContextRef.current!.createMediaStreamSource(stream);
      const processor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (isMuted || !liveSessionRef.current || !isConnected) {
          setVolumeLevel(0);
          return;
        }
        
        const inputData = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        setVolumeLevel(Math.sqrt(sum / inputData.length));

        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        
        const uint8Array = new Uint8Array(pcmData.buffer);
        let binary = "";
        const chunk = 8192; 
        for (let i = 0; i < uint8Array.byteLength; i += chunk) {
          binary += String.fromCharCode(...uint8Array.slice(i, i + chunk));
        }
        
        (liveSessionRef.current as any).sendRealtimeInput({
          audio: { data: btoa(binary), mimeType: 'audio/pcm;rate=16000' }
        });
      };

      source.connect(processor);
      processor.connect(audioContextRef.current!.destination);
    } catch (error) {
      console.error('Mic error:', error);
      setStatus('Mic permission needed.');
    }
  };

  const enqueueAudio = (base64: string) => {
    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const pcmData = new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2));
      audioQueueRef.current.push(pcmData);
      if (!isPlayingRef.current) playNextInQueue();
    } catch (e) {
      console.error('Audio queue error:', e);
    }
  };

  const playNextInQueue = async () => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current || !gainNodeRef.current) {
      isPlayingRef.current = false;
      currentSourceRef.current = null;
      return;
    }

    isPlayingRef.current = true;
    const pcmData = audioQueueRef.current.shift()!;
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) floatData[i] = pcmData[i] / 0x7FFF;

    const buffer = audioContextRef.current.createBuffer(1, floatData.length, 16000);
    buffer.getChannelData(0).set(floatData);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNodeRef.current);
    source.playbackRate.value = 1.15; // Make the voice slightly faster and more energetic
    source.onended = () => {
      currentSourceRef.current = null;
      playNextInQueue();
    };
    
    currentSourceRef.current = source;
    source.start();
  };

  const stopPlayback = () => {
    audioQueueRef.current = [];
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
        currentSourceRef.current = null;
      } catch (e) {}
    }
    isPlayingRef.current = false;
  };

  const stopVoiceSession = () => {
    if (liveSessionRef.current) try { liveSessionRef.current.close(); } catch(e) {}
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (processorRef.current) processorRef.current.disconnect();
    if (audioContextRef.current) try { audioContextRef.current.close(); } catch(e) {}
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#f8ad9d]/10 backdrop-blur-2xl"
    >
      <div className="w-full max-w-md bg-white/60 p-10 rounded-[40px] border border-white/40 shadow-2xl flex flex-col items-center gap-8 relative overflow-hidden">
        {/* Animated background circles */}
        <div className="absolute inset-0 -z-10 bg-radial-gradient from-[#f8ad9d]/20 to-transparent blur-3xl opacity-50 animate-pulse" />
        
        <div className="relative">
          <div className={`w-36 h-36 rounded-full border-4 border-[#f8ad9d] p-1 flex items-center justify-center transition-all duration-500 ${!isMuted && isConnected ? 'scale-110 shadow-[0_0_40px_rgba(248,173,157,0.5)]' : ''}`}>
             <div className="w-full h-full rounded-full bg-white/80 flex items-center justify-center text-5xl text-[#f8ad9d] relative overflow-hidden">
               H
               {/* Visualizer rings */}
               {isConnected && !isMuted && (
                 <motion.div 
                   animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                   transition={{ repeat: Infinity, duration: 1, ease: "easeOut" }}
                   style={{ width: `${60 + volumeLevel * 400}%`, height: `${60 + volumeLevel * 400}%` }}
                   className="absolute border-2 border-[#f8ad9d] rounded-full pointer-events-none"
                 />
               )}
             </div>
          </div>
          {isConnected && !isMuted && (
            <motion.div 
              animate={{ scale: [1, 1.2, 1] }} 
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-rose-400 flex items-center justify-center text-white shadow-lg"
            >
              <Mic size={16} />
            </motion.div>
          )}
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-[#4a4a4a]">Call with Haya</h2>
          <p className="text-sm font-medium text-[#7c7c7c] animate-pulse">{status}</p>
        </div>

        <div className="w-full bg-white/40 p-6 rounded-3xl min-h-[100px] flex items-center justify-center text-center italic text-[#4a4a4a] text-sm leading-relaxed overflow-hidden">
          {transcription || "Listening to your voice..."}
        </div>

        <div className="flex items-center gap-6">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-stone-200 text-stone-500' : 'bg-white text-[#f8ad9d] border border-[#f8ad9d]/20'}`}
          >
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
          
          <button 
            onClick={onClose}
            className="w-20 h-20 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-xl shadow-rose-500/30 hover:bg-rose-600 transition-all active:scale-95"
          >
            <PhoneOff size={32} />
          </button>

          <button className="w-16 h-16 rounded-full bg-white text-[#f8ad9d] border border-[#f8ad9d]/20 flex items-center justify-center">
            <Volume2 size={24} />
          </button>
        </div>

        <p className="text-[10px] uppercase tracking-[0.2em] text-[#7c7c7c] font-bold opacity-60">
          Intimate Voice Session
        </p>
      </div>
    </motion.div>
  );
}
