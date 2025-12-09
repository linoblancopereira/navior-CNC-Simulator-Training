import React, { useState, useEffect } from 'react';
import { LESSONS, TOOLS } from './constants';
import { parseGCode } from './services/gcodeParser';
import { Editor } from './components/Editor';
import { Simulator } from './components/Simulator';
import { GeminiTutor } from './components/GeminiTutor';
import { CadImporter } from './components/CadImporter';
import { MachineState, SimulationState, MaterialType, ToolConfig } from './types';
import { Play, Pause, RotateCcw, RotateCw, Layout, Gauge, AlertTriangle, XCircle, Terminal, Layers, Octagon, Ban, Droplets, Ruler, Settings, Wrench, RefreshCw, CloudDownload } from 'lucide-react';

export default function App() {
  const [currentLessonId, setCurrentLessonId] = useState(LESSONS[0].id);
  const [code, setCode] = useState(LESSONS[0].defaultCode);
  const [machineState, setMachineState] = useState<MachineState>(MachineState.IDLE);
  const [currentLine, setCurrentLine] = useState(0);
  const [feedOverride, setFeedOverride] = useState(100);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // CAD Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Tool State Management (Dynamic Wear)
  const [tools, setTools] = useState<ToolConfig[]>(TOOLS);

  // Lifted state from Simulator
  const [stockMaterial, setStockMaterial] = useState<MaterialType>('Steel');
  const [tolerance, setTolerance] = useState<number>(0.05); // Default +/- 0.05mm
  const [manualSpindle, setManualSpindle] = useState<{dir: 'CW' | 'CCW' | 'STOP', speed: number}>({
      dir: 'STOP',
      speed: 1000
  });

  const [simState, setSimState] = useState<SimulationState>({
    x: 0, z: 0, feedRate: 0, spindleSpeed: 0, spindleDirection: 'STOP',
    tool: 1, activeToolOffset: 0, toolRadiusComp: 'OFF', positioningMode: 'ABS', coolant: 'OFF', path: []
  });

  const currentLesson = LESSONS.find(l => l.id === currentLessonId) || LESSONS[0];
  const parsedCommands = parseGCode(code);

  useEffect(() => {
    const lesson = LESSONS.find(l => l.id === currentLessonId);
    if (lesson) {
        setCode(lesson.defaultCode);
        handleReset();
    }
  }, [currentLessonId]);

  useEffect(() => {
    let interval: any;
    if (machineState === MachineState.RUNNING) {
        const baseDelay = 500;
        const delay = feedOverride > 0 ? baseDelay * (100 / feedOverride) : 100000;

        interval = setInterval(() => {
            setCurrentLine(prev => {
                if (prev >= parsedCommands.length - 1) {
                    setMachineState(MachineState.IDLE);
                    return prev;
                }
                return prev + 1;
            });
        }, delay); 
    }
    return () => clearInterval(interval);
  }, [machineState, parsedCommands.length, feedOverride]);

  const handlePlay = () => {
    if (machineState === MachineState.ALARM) return;
    if (machineState === MachineState.IDLE || machineState === MachineState.PAUSED) {
        if (currentLine >= parsedCommands.length - 1) setCurrentLine(0);
        setMachineState(MachineState.RUNNING);
    }
  };

  const handlePause = () => machineState !== MachineState.ALARM && setMachineState(MachineState.PAUSED);
  const handleReset = () => { setMachineState(MachineState.IDLE); setCurrentLine(0); setErrorMessage(null); };
  const handleAlarm = (msg: string) => { 
      if (machineState !== MachineState.ALARM) { 
          setMachineState(MachineState.ALARM); 
          setErrorMessage(msg); 
          setManualSpindle({dir: 'STOP', speed: 0}); // Safety stop
      } 
  };
  
  const updateToolWear = (toolId: number, wearAmount: number) => {
    setTools(prev => prev.map(t => {
        if (t.id === toolId) {
            return { ...t, wear: Math.min(100, Math.max(0, wearAmount)) };
        }
        return t;
    }));
  };

  const handleResetWear = () => {
     updateToolWear(simState.tool, 0);
  };

  const activeToolConfig = tools.find(t => t.id === simState.tool) || tools[0];

  return (
    <div className="flex h-screen bg-black text-zinc-300 font-sans overflow-hidden">
      
      {/* CAD Importer Modal */}
      <CadImporter 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)}
        onCodeGenerated={(generatedCode) => {
            setCode(generatedCode);
            handleReset();
        }}
      />

      {/* Sidebar */}
      <aside className="w-64 bg-zinc-900/80 backdrop-blur-sm border-r border-zinc-800 flex flex-col z-10">
        <div className="p-4 border-b border-zinc-800 flex items-center gap-2 bg-gradient-to-r from-zinc-900 to-zinc-800">
            <div className="bg-cnc-accent text-black p-1 rounded"><Layout size={18} /></div>
            <h1 className="font-bold text-lg tracking-wider text-white">NAVIOR CNC</h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
            <div className="text-[10px] font-bold text-zinc-500 mb-2 px-3 uppercase tracking-widest mt-2">Training Modules</div>
            {LESSONS.map(lesson => (
                <button
                    key={lesson.id}
                    onClick={() => setCurrentLessonId(lesson.id)}
                    className={`w-full text-left px-3 py-3 rounded-lg mb-1 text-sm flex items-center gap-3 transition-all duration-200 group
                        ${currentLessonId === lesson.id 
                            ? 'bg-zinc-800/80 text-white border-l-2 border-cnc-accent shadow-lg' 
                            : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
                >
                    <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-mono 
                        ${currentLessonId === lesson.id ? 'bg-cnc-accent text-black' : 'bg-zinc-800 group-hover:bg-zinc-700'}`}>
                        {lesson.module}
                    </span>
                    <span className="truncate">{lesson.title.split('. ')[1]}</span>
                </button>
            ))}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative bg-radial-gradient">
        
        {/* Error Banner */}
        {machineState === MachineState.ALARM && errorMessage && (
            <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-[100] w-2/3 max-w-2xl animate-bounce-in">
                <div className="bg-red-950/90 border-l-4 border-red-500 rounded-r shadow-2xl p-4 flex items-start gap-4 backdrop-blur-md">
                    <AlertTriangle className="text-red-500 shrink-0" size={32} />
                    <div className="flex-1">
                        <h3 className="text-red-400 font-bold text-lg mb-1 tracking-wider">SYSTEM ALARM</h3>
                        <p className="text-white font-mono text-sm">{errorMessage}</p>
                    </div>
                    <button onClick={handleReset} className="text-gray-400 hover:text-white"><XCircle size={24} /></button>
                </div>
            </div>
        )}

        {/* Top Control Bar (Hero Section) */}
        <header className="h-20 bg-zinc-900/50 backdrop-blur-md border-b border-zinc-800 flex items-center justify-between px-4 z-20 gap-4">
            
            {/* 1. Cycle Controls */}
            <div className="flex items-center gap-2">
                <button 
                    onClick={handlePlay} disabled={machineState === MachineState.ALARM}
                    className={`flex items-center justify-center w-10 h-10 rounded-full shadow-lg transition-all transform active:scale-95
                        ${machineState === MachineState.ALARM ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500 text-white shadow-green-900/30'}`}
                    title="Cycle Start"
                >
                    <Play size={16} fill="currentColor" />
                </button>
                <button 
                    onClick={handlePause} disabled={machineState === MachineState.ALARM}
                    className={`flex items-center justify-center w-10 h-10 rounded-full transition-all border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white`}
                    title="Feed Hold"
                >
                    <Pause size={16} fill="currentColor" />
                </button>
                <button 
                    onClick={handleReset}
                    className="flex items-center justify-center w-10 h-10 rounded-full transition-all text-zinc-400 hover:text-white hover:bg-red-900/20"
                    title="Reset"
                >
                    <RotateCcw size={16} />
                </button>

                <div className="h-8 w-px bg-zinc-700 mx-2"></div>

                {/* Import / CAM Button */}
                <button 
                    onClick={() => setIsImportModalOpen(true)}
                    className="flex items-center gap-2 px-3 py-2 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-zinc-700 transition-all text-xs font-bold"
                >
                    <CloudDownload size={16} className="text-blue-400" />
                    <span className="hidden xl:inline">IMPORT CAD/CAM</span>
                </button>
            </div>

            {/* 2. Manual Spindle Controls, Material & Tolerance */}
            <div className="flex items-center gap-0 bg-black/40 border border-zinc-800 rounded-lg p-0 overflow-hidden">
                 {/* Spindle */}
                 <div className="flex gap-1 p-1.5 border-r border-zinc-800 bg-zinc-900/50">
                     <button
                        title="Spindle CW (M03)"
                        onClick={() => setManualSpindle({dir: 'CW', speed: 1000})}
                        className={`p-1.5 rounded transition-all ${manualSpindle.dir === 'CW' ? 'bg-green-600 text-white shadow-[0_0_8px_#16a34a]' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                    >
                        <RotateCw size={14} />
                    </button>
                    <button
                        title="Spindle Stop (M05)"
                        onClick={() => setManualSpindle({dir: 'STOP', speed: 0})}
                        className={`p-1.5 rounded transition-all ${manualSpindle.dir === 'STOP' ? 'bg-red-600 text-white shadow-[0_0_8px_#dc2626]' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                    >
                        <Ban size={14} />
                    </button>
                    <button
                        title="Spindle CCW (M04)"
                        onClick={() => setManualSpindle({dir: 'CCW', speed: 1000})}
                        className={`p-1.5 rounded transition-all ${manualSpindle.dir === 'CCW' ? 'bg-yellow-600 text-black shadow-[0_0_8px_#ca8a04]' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                    >
                        <RotateCcw size={14} />
                    </button>
                </div>
                
                {/* Material */}
                <div className="flex items-center gap-2 px-3 py-1.5 border-r border-zinc-800">
                    <Layers size={14} className="text-zinc-500"/>
                    <div className="flex flex-col">
                        <span className="text-[8px] text-zinc-500 font-bold uppercase">Material</span>
                        <select 
                            value={stockMaterial}
                            onChange={(e) => setStockMaterial(e.target.value as MaterialType)}
                            className="bg-transparent text-xs font-bold text-zinc-300 focus:outline-none cursor-pointer w-24"
                        >
                            <option value="Steel">Steel</option>
                            <option value="Aluminum">Aluminum</option>
                            <option value="Wood">Wood</option>
                            <option value="Carbon Fiber">Carbon Fiber</option>
                            <option value="Epoxi">Epoxi</option>
                            <option value="POM">POM</option>
                        </select>
                    </div>
                </div>

                {/* Tolerance */}
                <div className="flex items-center gap-2 px-3 py-1.5">
                    <Ruler size={14} className="text-zinc-500" />
                    <div className="flex flex-col">
                         <span className="text-[8px] text-zinc-500 font-bold uppercase">Tolerance (mm)</span>
                         <div className="flex items-center gap-1">
                             <span className="text-xs text-zinc-400">±</span>
                             <input 
                                type="number" 
                                step="0.01" 
                                min="0.001" 
                                max="1.0"
                                value={tolerance}
                                onChange={(e) => setTolerance(parseFloat(e.target.value))}
                                className="bg-transparent text-xs font-bold text-cnc-accent focus:outline-none w-12 border-b border-zinc-700 focus:border-cnc-accent text-center"
                             />
                         </div>
                    </div>
                </div>
            </div>

            {/* 3. Combined Status Display */}
            <div className="bg-black border border-zinc-800 rounded px-4 py-1.5 flex items-center gap-4 font-lcd shadow-inner flex-1 min-w-0 max-w-2xl justify-between">
                {/* Visual Indicators (Mini) */}
                <div className="flex gap-3">
                     <div className={`flex flex-col items-center justify-center w-8 h-8 rounded border border-white/10 ${simState.spindleDirection !== 'STOP' ? 'bg-zinc-800' : 'bg-red-900/20'}`}>
                        {simState.spindleDirection === 'STOP' && <Octagon size={14} className="text-red-500" />}
                        {simState.spindleDirection === 'CW' && <RotateCw size={14} className="text-green-500 animate-spin" />}
                        {simState.spindleDirection === 'CCW' && <RotateCcw size={14} className="text-yellow-500 animate-spin" />}
                        <span className="text-[8px] font-bold text-zinc-500 mt-0.5">SPN</span>
                     </div>
                     <div className={`flex flex-col items-center justify-center w-8 h-8 rounded border border-white/10 ${simState.coolant !== 'OFF' ? 'bg-blue-900/20' : 'bg-zinc-800'}`}>
                        <Droplets size={14} className={simState.coolant === 'FLOOD' ? "text-blue-500" : simState.coolant === 'MIST' ? "text-cyan-300" : "text-zinc-600"} />
                        <span className="text-[8px] font-bold text-zinc-500 mt-0.5">
                            {simState.coolant === 'OFF' ? 'OFF' : simState.coolant === 'MIST' ? 'MST' : 'FLD'}
                        </span>
                     </div>
                </div>

                <div className="h-8 w-px bg-zinc-800"></div>

                {/* Coordinates */}
                <div className="flex flex-col justify-center">
                    <div className="flex items-center gap-2">
                        <span className="text-cnc-accent font-bold text-xs w-3">X</span>
                        <span className="text-zinc-100 text-sm tracking-widest bg-zinc-900/50 px-1 rounded min-w-[70px] text-right">{simState.x.toFixed(3)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-cnc-accent font-bold text-xs w-3">Z</span>
                        <span className="text-zinc-100 text-sm tracking-widest bg-zinc-900/50 px-1 rounded min-w-[70px] text-right">{simState.z.toFixed(3)}</span>
                    </div>
                </div>

                 <div className="h-8 w-px bg-zinc-800"></div>

                 {/* Machine Data */}
                 <div className="grid grid-cols-4 gap-x-4 text-[10px]">
                    <div className="flex flex-col">
                         <span className="text-zinc-600 font-bold">MODE</span>
                         <span className={`font-bold ${machineState === MachineState.ALARM ? 'text-red-500 animate-pulse' : 'text-cnc-accent'}`}>{machineState}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-zinc-600 font-bold">TOOL</span>
                        <span className="text-white">T{simState.tool < 10 ? '0'+simState.tool : simState.tool}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-zinc-600 font-bold">SPEED</span>
                        <span className="text-white">{simState.spindleSpeed}</span>
                    </div>
                     <div className="flex flex-col relative group cursor-pointer" onClick={handleResetWear}>
                        <span className="text-zinc-600 font-bold flex items-center gap-1">WEAR <RefreshCw size={8}/></span>
                        <span className={`${activeToolConfig.wear > 80 ? 'text-red-500 animate-pulse' : activeToolConfig.wear > 50 ? 'text-yellow-500' : 'text-green-500'} font-bold`}>
                            {activeToolConfig.wear.toFixed(1)}%
                        </span>
                    </div>
                 </div>
            </div>

            {/* 4. Feed Control & E-STOP */}
            <div className="flex items-center gap-3">
                 <div className="flex items-center gap-3 bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800">
                    <Gauge size={16} className="text-zinc-500" />
                    <div className="flex flex-col w-20">
                        <div className="flex justify-between text-[8px] text-zinc-500 uppercase font-bold mb-0.5">
                            <span>Rapid</span>
                            <span className="text-cnc-accent">{feedOverride}%</span>
                        </div>
                        <input 
                            type="range" min="0" max="150" step="10" value={feedOverride}
                            onChange={(e) => setFeedOverride(Number(e.target.value))}
                            className="h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cnc-accent"
                        />
                    </div>
                </div>

                 <button
                    onClick={() => handleAlarm("EMERGENCY STOP TRIGGERED")}
                    className="flex items-center justify-center w-10 h-10 rounded-full bg-red-600 border-2 border-red-800 shadow-[0_0_10px_rgba(220,38,38,0.5)] hover:shadow-[0_0_15px_rgba(220,38,38,0.8)] active:scale-95 transition-all overflow-hidden"
                    title="EMERGENCY STOP"
                >
                    <Octagon size={20} className="text-white animate-pulse" fill="currentColor" strokeWidth={3} />
                </button>
            </div>
        </header>

        {/* Workspace */}
        <div className="flex-1 p-4 grid grid-cols-12 gap-4 overflow-hidden relative">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-5 pointer-events-none"></div>

            {/* Left: Code & Lesson */}
            <div className="col-span-4 flex flex-col gap-4 overflow-hidden z-10">
                <div className="h-2/5 bg-zinc-900/80 backdrop-blur rounded-xl p-0 border border-zinc-800 overflow-hidden flex flex-col shadow-lg">
                    <div className="px-4 py-3 bg-zinc-800/50 border-b border-zinc-800 flex items-center gap-2">
                         <Terminal size={14} className="text-cnc-accent" />
                         <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Lesson Brief</span>
                    </div>
                    <div className="p-4 overflow-y-auto custom-scrollbar">
                        <h2 className="text-white font-bold text-lg mb-2">{currentLesson.title}</h2>
                        <div className="prose prose-invert prose-sm text-zinc-400">
                            {currentLesson.content.split('\n').map((line, i) => (
                                <p key={i} className="mb-2 leading-relaxed">{line}</p>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex-1 min-h-0 shadow-lg rounded-xl overflow-hidden">
                    <Editor code={code} onChange={setCode} activeLine={currentLine} />
                </div>
            </div>

            {/* Right: Sim & AI */}
            <div className="col-span-8 flex flex-col gap-4 z-10">
                <div className="flex-1 min-h-0 relative rounded-xl overflow-hidden border border-zinc-700 shadow-2xl">
                    <Simulator 
                        commands={parsedCommands} 
                        machineState={machineState} 
                        currentLine={currentLine} 
                        feedOverride={feedOverride} 
                        stockMaterial={stockMaterial}
                        manualSpindle={manualSpindle}
                        onError={handleAlarm}
                        onStateChange={setSimState}
                        onRequestPause={handlePause}
                        onRequestResume={handlePlay}
                        tools={tools}
                        onToolWear={updateToolWear}
                    />
                </div>
                <div className="h-48 shadow-lg">
                    <GeminiTutor />
                </div>
            </div>

        </div>
      </main>
    </div>
  );
}