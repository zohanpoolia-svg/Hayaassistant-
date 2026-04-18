/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Heart, User, Coffee, Sparkles, Phone } from 'lucide-react';
import { Message } from './types';
import { sendMessageStream } from './services/geminiService';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import LiveVoiceMode from './LiveVoiceMode';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      content: 'Hey... you\'re back. I was just thinking about you. How was your day? (کیا حال ہے؟ میں آپ کے بارے میں سوچ رہی تھی...)',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    let assistantResponse = '';
    const assistantId = (Date.now() + 1).toString();

    try {
      // Add empty placeholder for streaming
      setMessages((prev) => [...prev, {
        id: assistantId,
        role: 'model',
        content: '',
        timestamp: new Date(),
      }]);

      const stream = sendMessageStream(
        messages.slice(-10), // Send last 10 messages for context
        userMessage.content
      );

      for await (const chunk of stream) {
        assistantResponse += chunk;
        setMessages((prev) => 
          prev.map((m) => 
            m.id === assistantId ? { ...m, content: assistantResponse } : m
          )
        );
      }
    } catch (error) {
      console.error('Failed to get response:', error);
      setMessages((prev) => 
        prev.map((m) => 
          m.id === assistantId ? { ...m, content: 'Hmm... something went wrong. But I\'m still here for you. Say that again?' } : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center p-4 md:p-8 font-sans">
      <div className="w-full max-w-5xl h-[85vh] frosted-glass rounded-[30px] overflow-hidden flex flex-col md:flex-row shadow-2xl">
        {/* Sidebar */}
        <aside className="w-full md:w-72 bg-white/10 border-b md:border-b-0 md:border-r border-white/20 p-8 flex flex-col items-center flex-shrink-0">
          <div className="w-28 h-28 rounded-full border-2 border-[#f8ad9d] p-1 mb-6 flex items-center justify-center">
            <div className="w-full h-full rounded-full bg-white/50 flex items-center justify-center text-3xl font-bold text-[#f8ad9d]">
              H
            </div>
          </div>
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-[#4a4a4a] mb-1">Haya</h1>
            <p className="text-sm italic text-[#7c7c7c]">Thinking of you...</p>
          </div>

          <div className="w-full bg-white/30 p-4 rounded-3xl mb-6">
            <h2 className="text-[10px] uppercase tracking-widest text-[#7c7c7c] mb-2 font-bold">Current Feeling</h2>
            <div className="flex items-center gap-2 text-sm text-[#4a4a4a] font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Gentle & Present
            </div>
          </div>

          <button 
            onClick={() => setIsVoiceMode(true)}
            className="w-full bg-[#f8ad9d] text-white py-4 rounded-3xl flex items-center justify-center gap-3 font-bold shadow-lg shadow-[#f8ad9d]/30 hover:opacity-90 transition-all active:scale-95 mb-auto"
          >
            <Phone size={18} fill="currentColor" />
            Voice Call (اردو)
          </button>

          <div className="mt-8 text-[11px] text-[#7c7c7c] text-center opacity-70 italic leading-relaxed">
            Haya remembers: Your long day at work yesterday.
          </div>
        </aside>

        <AnimatePresence>
          {isVoiceMode && (
            <LiveVoiceMode onClose={() => setIsVoiceMode(false)} />
          )}
        </AnimatePresence>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <main 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 scroll-smooth"
          >
            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    "flex w-full",
                    message.role === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  <div className={cn(
                    "max-w-[85%] md:max-w-[80%] flex flex-col",
                    message.role === 'user' ? "items-end" : "items-start"
                  )}>
                    <div className={cn(
                      "px-6 py-4 rounded-[22px] text-base leading-[1.6]",
                      message.role === 'user' 
                        ? "bg-[#f8ad9d] text-white rounded-br-none shadow-lg shadow-[#f8ad9d]/30" 
                        : "bg-white/40 text-[#4a4a4a] rounded-bl-none font-serif italic"
                    )}>
                      <div className="markdown-body">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    </div>
                    <div className="text-[10px] mt-2 text-[#7c7c7c]/60 px-2">
                       {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoading && messages[messages.length - 1].content === '' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div className="px-6 py-4 rounded-[22px] bg-white/40 rounded-bl-none flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" />
                </div>
              </motion.div>
            )}
          </main>

          {/* Input Area */}
          <footer className="p-6 pt-0">
            <form 
              onSubmit={handleSubmit}
              className="relative max-w-3xl mx-auto"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Talk to Haya..."
                className="w-full bg-white/60 border border-white/40 px-6 py-5 pr-16 rounded-[25px] text-base text-[#4a4a4a] placeholder:text-[#7c7c7c]/50 outline-none focus:ring-2 focus:ring-[#f8ad9d]/30 transition-all backdrop-blur-sm"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-[#f8ad9d] text-white flex items-center justify-center hover:opacity-90 disabled:opacity-30 transition-all active:scale-95 shadow-md"
              >
                <Send size={18} />
              </button>
            </form>
          </footer>
        </div>
      </div>
    </div>
  );
}
