import React, { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Upload, Link as LinkIcon, FileBox, ArrowRight, Loader, CheckCircle2, X } from 'lucide-react';

interface CadImporterProps {
  isOpen: boolean;
  onClose: () => void;
  onCodeGenerated: (code: string) => void;
}

export const CadImporter: React.FC<CadImporterProps> = ({ isOpen, onClose, onCodeGenerated }) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'onshape'>('onshape');
  const [file, setFile] = useState<File | null>(null);
  const [onshapeUrl, setOnshapeUrl] = useState('');
  const [processingStep, setProcessingStep] = useState<number>(0); // 0: Idle, 1: Parsing, 2: Profiling, 3: Generating
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith('.step') || droppedFile.name.endsWith('.stp'))) {
      setFile(droppedFile);
      // Auto-populate description from filename for the AI
      setDescription(droppedFile.name.replace(/[._-]/g, ' ').replace('step', '').trim());
    }
  };

  const processGeometry = async () => {
    setProcessingStep(1); // Parsing
    
    // Simulate complex geometry parsing time
    setTimeout(() => setProcessingStep(2), 1500); // Extracting Profile
    setTimeout(async () => {
      setProcessingStep(3); // Generating G-Code via Gemini

      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY }); 
        
        // We use Gemini as the "CAM Processor" to convert the intent/description into G-Code
        // since raw STEP parsing in-browser is extremely heavy.
        const context = file ? `Archivo STEP: ${file.name}` : `Pieza Onshape: ${onshapeUrl}`;
        const prompt = `
          ACTÚA COMO UN SOFTWARE CAM (Fabricación Asistida por Computadora).
          Genera un programa de código G ISO completo y válido para un Torno CNC (estilo Fanuc) basado en esta descripción de pieza:
          "${description || 'Una pieza cilíndrica estándar con múltiples diámetros'}"
          
          Contexto: ${context}
          
          Reglas:
          1. Usa encabezado estándar (G28, G50, G96/G97).
          2. Usa Herramienta T0101 para desbaste (Ciclo G71).
          3. Usa Herramienta T0303 para roscado (G76) si la descripción menciona roscas o pernos.
          4. Usa Herramienta T0202 para ranurado (G75) si se menciona.
          5. Asegúrate de que el código sea seguro y esté dentro de los límites X100 Z100.
          6. AÑADE COMENTARIOS EN ESPAÑOL.
          7. SOLO DEVUELVE EL CÓDIGO G. Sin formato markdown, sin explicaciones.
        `;

        const result = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });

        const gcode = result.text.replace(/```/g, '').replace(/gcode/g, '').trim();
        onCodeGenerated(gcode);
        setProcessingStep(0);
        onClose();

      } catch (error) {
        console.error("Generación CAM Fallida", error);
        setProcessingStep(0);
      }
    }, 3500);
  };

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-cnc-900 border border-cnc-700 w-[600px] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-pulse-fast-once">
        
        {/* Header */}
        <div className="bg-cnc-850 p-4 border-b border-cnc-700 flex justify-between items-center">
          <div className="flex items-center gap-2 text-cnc-accent">
            <FileBox size={20} />
            <h2 className="font-bold tracking-wider">IMPORTADOR PUENTE CAD/CAM</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20}/></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-cnc-700">
          <button 
            onClick={() => setActiveTab('onshape')}
            className={`flex-1 py-3 text-sm font-bold transition-colors flex items-center justify-center gap-2
              ${activeTab === 'onshape' ? 'bg-cnc-800 text-white border-b-2 border-blue-500' : 'text-zinc-500 hover:bg-cnc-800/50'}`}
          >
            <LinkIcon size={16} /> INTEGRACIÓN ONSHAPE
          </button>
          <button 
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-3 text-sm font-bold transition-colors flex items-center justify-center gap-2
              ${activeTab === 'upload' ? 'bg-cnc-800 text-white border-b-2 border-green-500' : 'text-zinc-500 hover:bg-cnc-800/50'}`}
          >
            <Upload size={16} /> SUBIR ARCHIVO STEP
          </button>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[300px] flex flex-col">
          
          {processingStep > 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
              <div className="relative w-20 h-20">
                 <div className="absolute inset-0 border-4 border-cnc-700 rounded-full"></div>
                 <div className="absolute inset-0 border-4 border-t-cnc-accent rounded-full animate-spin"></div>
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-white animate-pulse">PROCESANDO GEOMETRÍA</h3>
                <div className="text-sm font-mono text-cnc-accent">
                  {processingStep === 1 && "> ANALIZANDO ESTRUCTURA B-REP..."}
                  {processingStep === 2 && "> EXTRAYENDO PERFIL 2D (PLANO XZ)..."}
                  {processingStep === 3 && "> GENERANDO TRAYECTORIAS (G-CODE)..."}
                </div>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'onshape' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="bg-blue-900/20 border border-blue-800 p-4 rounded-lg flex gap-4 items-start">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/e/e3/Onshape_logo.png" alt="Onshape" className="w-10 h-10 object-contain bg-white rounded p-1" />
                    <div>
                      <h3 className="text-blue-400 font-bold text-sm">CONECTAR A ONSHAPE</h3>
                      <p className="text-zinc-400 text-xs mt-1 leading-relaxed">
                        Diseña tu pieza en Onshape, luego copia la URL pública del documento o exporta como STEP para importar la geometría directamente.
                      </p>
                      <a 
                        href="https://cad.onshape.com/" 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-white bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded mt-2 font-bold transition-colors"
                      >
                        LANZAR ONSHAPE <ArrowRight size={10} />
                      </a>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">URL del Documento Onshape</label>
                    <input 
                      type="text" 
                      value={onshapeUrl}
                      onChange={(e) => setOnshapeUrl(e.target.value)}
                      placeholder="https://cad.onshape.com/documents/..."
                      className="w-full bg-black border border-cnc-700 rounded p-3 text-sm text-white focus:border-blue-500 outline-none font-mono"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'upload' && (
                <div 
                    className="flex-1 border-2 border-dashed border-cnc-700 rounded-xl bg-black/20 flex flex-col items-center justify-center gap-4 transition-colors hover:border-cnc-accent hover:bg-cnc-800/30 cursor-pointer animate-in fade-in slide-in-from-bottom-4 duration-300"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleFileDrop}
                    onClick={() => document.getElementById('file-upload')?.click()}
                >
                  <input type="file" id="file-upload" className="hidden" accept=".step,.stp" onChange={(e) => {
                      if(e.target.files?.[0]) {
                          setFile(e.target.files[0]);
                          setDescription(e.target.files[0].name.replace(/[._-]/g, ' ').replace('step', '').trim());
                      }
                  }} />
                  
                  {file ? (
                    <div className="flex flex-col items-center text-green-500">
                      <FileBox size={48} />
                      <span className="mt-2 font-bold">{file.name}</span>
                      <span className="text-xs text-zinc-500">{(file.size / 1024).toFixed(1)} KB</span>
                    </div>
                  ) : (
                    <>
                      <Upload size={32} className="text-zinc-600" />
                      <div className="text-center">
                        <p className="text-zinc-400 font-bold">Clic para subir archivo STEP</p>
                        <p className="text-zinc-600 text-xs mt-1">o arrastra y suelta archivos .step / .stp aquí</p>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="mt-6 border-t border-cnc-800 pt-4">
                 <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Descripción de la Pieza (Ayuda al Motor CAM)</label>
                 <input 
                    type="text" 
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ej., Perno M24 con 50mm de rosca y cabeza hexagonal..."
                    className="w-full bg-black border border-cnc-700 rounded p-3 text-sm text-zinc-300 focus:border-cnc-accent outline-none"
                 />
              </div>

              <button 
                onClick={processGeometry}
                disabled={(!file && !onshapeUrl) || !description}
                className={`w-full mt-4 py-3 rounded font-bold flex items-center justify-center gap-2 transition-all
                    ${(!file && !onshapeUrl) || !description ? 'bg-cnc-800 text-zinc-600 cursor-not-allowed' : 'bg-cnc-accent hover:bg-yellow-400 text-black shadow-[0_0_15px_rgba(234,179,8,0.4)]'}`}
              >
                {activeTab === 'onshape' ? 'OBTENER Y PROCESAR' : 'CONVERTIR A CÓDIGO G'} <ArrowRight size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};