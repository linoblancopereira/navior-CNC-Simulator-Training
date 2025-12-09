import React, { useState, useEffect } from 'react';
import { LESSONS } from './constants';
import { parseGCode } from './services/gcodeParser';
import { Editor } from './components/Editor';
import { Simulator } from './components/Simulator';
import { GeminiTutor } from './components/GeminiTutor';
import { MachineState, SimulationState } from './types';
import { Play, Pause, RotateCcw, Layout, Gauge, AlertTriangle, XCircle, Terminal } from 'lucide-react';

export default function App() {
  const [currentLessonId, setCurrentLessonId] = useState(LESSONS[0].id);
  const [code, setCode] = useState(LESSONS[0].defaultCode);
  const [machineState, setMachineState] = useState<MachineState>(MachineState.IDLE);
  const [currentLine, setCurrentLine] = useState(0);
  const [feedOverride, setFeedOverride] = useState(100);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [simState, setSimState] = useState<SimulationState>({
    x: 0, z: 0, feedRate: 0, spindleSpeed: 0, spindleDirection: 'STOP',
    tool: 1, activeToolOffset: 0, toolRadiusComp: 'OFF', positioningMode: 'ABS', coolant: false, path: []
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
  const handleAlarm = (msg: string) => { if (machineState !== MachineState.ALARM) { setMachineState(MachineState.ALARM); setErrorMessage(msg); } };

  return (
    <div className="flex h-screen bg-black text-zinc-300 font-sans overflow-hidden">
      
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
        <header className="h-20 bg-zinc-900/50 backdrop-blur-md border-b border-zinc-800 flex items-center justify-between px-6 z-20">
            <div className="flex items-center gap-3">
                <button 
                    onClick={handlePlay} disabled={machineState === MachineState.ALARM}
                    className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold shadow-lg transition-all transform active:scale-95
                        ${machineState === MachineState.ALARM ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500 text-white shadow-green-900/30'}`}
                >
                    <Play size={16} fill="currentColor" /> CYCLE START
                </button>
                <button 
                    onClick={handlePause} disabled={machineState === MachineState.ALARM}
                    className={`px-4 py-2 rounded-full text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all border border-transparent hover:border-zinc-700`}
                >
                    <Pause size={18} fill="currentColor" />
                </button>
                <button 
                    onClick={handleReset}
                    className="px-4 py-2 rounded-full text-zinc-300 hover:text-red-400 hover:bg-red-900/20 transition-all"
                >
                    <RotateCcw size={18} />
                </button>
            </div>

            {/* Combined Status Display (Transplanted from Simulator) */}
            <div className="bg-black border border-zinc-800 rounded px-5 py-2 flex items-center gap-6 font-lcd shadow-inner min-w-[450px]">
                {/* Group 1: Machine Status */}
                <div className="flex flex-col gap-1 border-r border-zinc-800 pr-4">
                    <div className="flex justify-between w-24">
                        <span className="text-[10px] text-zinc-600 font-bold">MODE</span>
                        <span className={`text-xs font-bold ${machineState === MachineState.ALARM ? 'text-red-500 animate-pulse' : 'text-cnc-accent'}`}>{machineState}</span>
                    </div>
                    <div className="flex justify-between w-24">
                        <span className="text-[10px] text-zinc-600 font-bold">LINE</span>
                        <span className="text-xs text-zinc-300">N{currentLine * 10}</span>
                    </div>
                </div>

                {/* Group 2: Position */}
                <div className="flex flex-col gap-1 border-r border-zinc-800 pr-4">
                    <div className="flex items-center gap-3 w-32">
                        <span className="text-cnc-accent font-bold text-sm w-4">X</span>
                        <span className="text-zinc-100 text-sm tracking-widest bg-zinc-900/50 px-1 rounded">{simState.x.toFixed(3)}</span>
                    </div>
                    <div className="flex items-center gap-3 w-32">
                        <span className="text-cnc-accent font-bold text-sm w-4">Z</span>
                        <span className="text-zinc-100 text-sm tracking-widest bg-zinc-900/50 px-1 rounded">{simState.z.toFixed(3)}</span>
                    </div>
                </div>

                {/* Group 3: Machine Data */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-600 font-bold w-6">F%</span>
                        <span className="text-xs text-white">{feedOverride}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-600 font-bold w-6">T</span>
                        <span className="text-xs text-white">{simState.tool < 10 ? '0'+simState.tool : simState.tool}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-600 font-bold w-6">S</span>
                        <span className="text-xs text-white">{simState.spindleSpeed}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-600 font-bold w-6">H</span>
                        <span className="text-xs text-white">{simState.activeToolOffset}</span>
                    </div>
                </div>
            </div>

            {/* Feed Control Slider (Right) */}
            <div className="flex items-center gap-4 bg-zinc-900 px-4 py-2 rounded-lg border border-zinc-800">
                <Gauge size={18} className="text-zinc-500" />
                <div className="flex flex-col w-24">
                    <div className="flex justify-between text-[10px] text-zinc-500 uppercase font-bold mb-1">
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
                        onError={handleAlarm}
                        onStateChange={setSimState}
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