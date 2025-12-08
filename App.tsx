import React, { useState, useEffect } from 'react';
import { LESSONS } from './constants';
import { parseGCode } from './services/gcodeParser';
import { Editor } from './components/Editor';
import { Simulator } from './components/Simulator';
import { GeminiTutor } from './components/GeminiTutor';
import { MachineState } from './types';
import { Play, Pause, RotateCcw, BookOpen, Layout, Settings, Gauge, AlertTriangle, XCircle } from 'lucide-react';

export default function App() {
  const [currentLessonId, setCurrentLessonId] = useState(LESSONS[0].id);
  const [code, setCode] = useState(LESSONS[0].defaultCode);
  const [machineState, setMachineState] = useState<MachineState>(MachineState.IDLE);
  const [currentLine, setCurrentLine] = useState(0);
  const [feedOverride, setFeedOverride] = useState(100);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentLesson = LESSONS.find(l => l.id === currentLessonId) || LESSONS[0];
  const parsedCommands = parseGCode(code);

  // Lesson Switcher Logic
  useEffect(() => {
    const lesson = LESSONS.find(l => l.id === currentLessonId);
    if (lesson) {
        setCode(lesson.defaultCode);
        handleReset(); // Reset machine when changing lesson
    }
  }, [currentLessonId]);

  // Execution Timer Logic
  useEffect(() => {
    let interval: any;
    if (machineState === MachineState.RUNNING) {
        // Base speed is 500ms per line.
        // Higher override % means lower delay (faster speed).
        // 0% override should technically pause, but we'll clamp to max delay.
        const baseDelay = 500;
        const delay = feedOverride > 0 
            ? baseDelay * (100 / feedOverride) 
            : 100000; // Effectively paused if 0%

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

  const handlePause = () => {
      if (machineState !== MachineState.ALARM) {
          setMachineState(MachineState.PAUSED);
      }
  };

  const handleReset = () => {
    setMachineState(MachineState.IDLE);
    setCurrentLine(0);
    setErrorMessage(null);
  };

  const handleAlarm = (msg: string) => {
      // Only set alarm if not already in alarm to avoid loops
      if (machineState !== MachineState.ALARM) {
          setMachineState(MachineState.ALARM);
          setErrorMessage(msg);
      }
  };

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-cnc-900 border-r border-cnc-700 flex flex-col">
        <div className="p-4 border-b border-cnc-700 flex items-center gap-2">
            <Layout className="text-cnc-accent" />
            <h1 className="font-bold text-lg tracking-wider">NAVIOR CNC</h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
            <div className="text-xs font-bold text-gray-500 mb-2 px-2 uppercase">Training Modules</div>
            {LESSONS.map(lesson => (
                <button
                    key={lesson.id}
                    onClick={() => setCurrentLessonId(lesson.id)}
                    className={`w-full text-left px-3 py-2 rounded mb-1 text-sm flex items-center gap-2 transition-colors
                        ${currentLessonId === lesson.id ? 'bg-cnc-800 text-cnc-accent border border-cnc-700' : 'text-gray-400 hover:bg-cnc-800'}`}
                >
                    <BookOpen size={14} />
                    {lesson.title}
                </button>
            ))}
        </div>

        <div className="p-4 border-t border-cnc-700 text-xs text-gray-600 text-center">
            Powered by Rust Core (Simulated) & Gemini AI
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative">
        
        {/* Error Banner */}
        {machineState === MachineState.ALARM && errorMessage && (
            <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-[100] w-2/3 max-w-2xl animate-bounce-in">
                <div className="bg-red-900/90 border-2 border-red-500 rounded-lg shadow-2xl p-4 flex items-start gap-4 backdrop-blur-md">
                    <AlertTriangle className="text-red-500 shrink-0" size={32} />
                    <div className="flex-1">
                        <h3 className="text-red-400 font-bold text-lg mb-1">MACHINE ALARM</h3>
                        <p className="text-white font-mono text-sm">{errorMessage}</p>
                    </div>
                    <button 
                        onClick={handleReset} 
                        className="text-gray-400 hover:text-white"
                        title="Reset Alarm"
                    >
                        <XCircle size={24} />
                    </button>
                </div>
            </div>
        )}

        {/* Top Control Bar */}
        <header className="h-14 bg-cnc-900 border-b border-cnc-700 flex items-center justify-between px-6">
            <div className="flex items-center gap-4">
                <button 
                    onClick={handlePlay}
                    disabled={machineState === MachineState.ALARM}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded text-sm font-bold shadow-lg transition-all
                        ${machineState === MachineState.ALARM 
                            ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                            : 'bg-green-700 hover:bg-green-600 shadow-green-900/20'}`}
                >
                    <Play size={16} /> START
                </button>
                <button 
                    onClick={handlePause}
                    disabled={machineState === MachineState.ALARM}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded text-sm font-bold transition-all
                        ${machineState === MachineState.ALARM 
                            ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                            : 'bg-yellow-700 hover:bg-yellow-600'}`}
                >
                    <Pause size={16} /> HOLD
                </button>
                <button 
                    onClick={handleReset}
                    className="flex items-center gap-2 bg-red-800 hover:bg-red-700 px-4 py-1.5 rounded text-sm font-bold transition-all"
                >
                    <RotateCcw size={16} /> RESET
                </button>
            </div>

            {/* Feed Rate Override Control */}
            <div className="flex items-center gap-3 bg-black/40 px-4 py-1 rounded border border-cnc-700">
                <Gauge size={16} className="text-gray-400" />
                <div className="flex flex-col w-32">
                    <div className="flex justify-between text-[10px] text-gray-400 uppercase font-bold">
                        <span>Feed Ovrd</span>
                        <span className={feedOverride !== 100 ? 'text-yellow-400' : 'text-gray-200'}>{feedOverride}%</span>
                    </div>
                    <input 
                        type="range" 
                        min="10" 
                        max="200" 
                        step="10" 
                        value={feedOverride}
                        onChange={(e) => setFeedOverride(Number(e.target.value))}
                        className="h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cnc-accent"
                    />
                </div>
            </div>
            
            <div className="flex items-center gap-4 text-xs font-mono text-cnc-text">
                <div className={`px-3 py-1 rounded border border-cnc-700 ${machineState === MachineState.ALARM ? 'bg-red-900/50 text-red-500 font-bold border-red-500 animate-pulse' : 'bg-black/50'}`}>
                    {machineState}
                </div>
                <div className="bg-black/50 px-3 py-1 rounded border border-cnc-700">
                    N{currentLine * 10}
                </div>
            </div>
        </header>

        {/* Workspace Grid */}
        <div className="flex-1 p-4 grid grid-cols-12 gap-4 overflow-hidden">
            
            {/* Left Column: Lesson & Editor */}
            <div className="col-span-5 flex flex-col gap-4 overflow-hidden">
                <div className="h-1/3 bg-cnc-800/50 rounded-lg p-4 border border-cnc-700 overflow-y-auto">
                    <h2 className="text-cnc-accent font-bold mb-2 flex items-center gap-2">
                        <BookOpen size={16} /> {currentLesson.title}
                    </h2>
                    <div className="prose prose-invert prose-sm">
                        {currentLesson.content.split('\n').map((line, i) => (
                            <p key={i} className="mb-2 text-gray-300">{line}</p>
                        ))}
                    </div>
                </div>
                
                <div className="flex-1 min-h-0">
                    <Editor 
                        code={code} 
                        onChange={setCode} 
                        activeLine={currentLine} 
                    />
                </div>
            </div>

            {/* Right Column: Simulator & AI */}
            <div className="col-span-7 flex flex-col gap-4">
                <div className="flex-1 min-h-0 relative">
                    <Simulator 
                        commands={parsedCommands} 
                        machineState={machineState} 
                        currentLine={currentLine}
                        feedOverride={feedOverride}
                        onError={handleAlarm}
                    />
                </div>
                
                <div className="h-1/3">
                    <GeminiTutor />
                </div>
            </div>

        </div>
      </main>
    </div>
  );
}