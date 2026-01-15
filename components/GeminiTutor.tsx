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
        contents: `Eres un experto instructor de CNC llamado "Navior Bot".
        Explica el siguiente concepto de CNC o código G a un estudiante principiante basándote estrictamente en normas ISO.
        Responde SIEMPRE en Español.
        Mantén la respuesta concisa (menos de 100 palabras) y alentadora.
        Consulta del usuario: ${query}`,
      });

      setResponse(modelResp.text);
    } catch (e) {
      setResponse("Error conectando con el Tutor IA. Por favor verifica la configuración de la API Key.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-cnc-900 border border-cnc-700 rounded-lg p-4 flex flex-col gap-4 h-full">
        <div className="flex items-center gap-2 text-cnc-accent border-b border-cnc-700 pb-2">
            <Bot size={20} />
            <h3 className="font-bold">Tutor IA (Gemini)</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto min-h-[100px] text-sm text-gray-300">
            {loading ? (
                <div className="flex items-center gap-2 text-cnc-text animate-pulse">
                    <Loader size={16} className="animate-spin" /> Pensando...
                </div>
            ) : response ? (
                <div className="prose prose-invert prose-sm max-w-none">
                    <p>{response}</p>
                </div>
            ) : (
                <p className="text-gray-500 italic">Pregúntame sobre códigos G, ciclos o herramientas...</p>
            )}
        </div>

        <div className="flex gap-2">
            <input 
                type="text" 
                className="flex-1 bg-cnc-800 border border-cnc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cnc-accent"
                placeholder="Ej: ¿Qué hace el G71?"
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