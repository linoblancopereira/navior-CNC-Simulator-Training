import React, { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Send, Bot, Loader } from 'lucide-react';

export const GeminiTutor: React.FC = () => {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResponse(null);

    try {
      // Using the latest Gemini API pattern
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY }); 
      
      const modelResp = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are an expert CNC instructor named "Navior Bot". 
        Explain the following CNC concept or G-code to a beginner student strictly based on ISO standards. 
        Keep it concise (under 100 words) and encouraging.
        User Query: ${query}`,
      });

      setResponse(modelResp.text);
    } catch (e) {
      setResponse("Error connecting to AI Tutor. Please check API Key configuration.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-cnc-900 border border-cnc-700 rounded-lg p-4 flex flex-col gap-4 h-full">
        <div className="flex items-center gap-2 text-cnc-accent border-b border-cnc-700 pb-2">
            <Bot size={20} />
            <h3 className="font-bold">AI Tutor (Gemini)</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto min-h-[100px] text-sm text-gray-300">
            {loading ? (
                <div className="flex items-center gap-2 text-cnc-text animate-pulse">
                    <Loader size={16} className="animate-spin" /> Thinking...
                </div>
            ) : response ? (
                <div className="prose prose-invert prose-sm max-w-none">
                    <p>{response}</p>
                </div>
            ) : (
                <p className="text-gray-500 italic">Ask me about G-codes, Cycles, or Tooling...</p>
            )}
        </div>

        <div className="flex gap-2">
            <input 
                type="text" 
                className="flex-1 bg-cnc-800 border border-cnc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cnc-accent"
                placeholder="Ex: What does G71 do?"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
            />
            <button 
                onClick={handleAsk}
                className="bg-cnc-accent text-black p-2 rounded hover:bg-yellow-500 transition-colors"
            >
                <Send size={18} />
            </button>
        </div>
    </div>
  );
};