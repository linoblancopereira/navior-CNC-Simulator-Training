import React, { useState, useEffect } from 'react';
import { LESSONS } from './constants';
import { parseGCode } from './services/gcodeParser';
import { Editor } from './components/Editor';
import { Simulator } from './components/Simulator';
import { GeminiTutor } from './components/GeminiTutor';
import { MachineState } from './types';
import { Play, Pause, RotateCcw, BookOpen, Layout, Settings } from 'lucide-react';

export default function App() {
  const [currentLessonId, setCurrentLessonId] = useState(LESSONS[0].id);
  const [code, setCode] = useState(LESSONS[0].defaultCode);
  const [machineState, setMachineState] = useState<MachineState>(MachineState.IDLE);
  const [currentLine, setCurrentLine] = useState(0);

  const currentLesson = LESSONS.find(l => l.id === currentLessonId) || LESSONS[0];
  const parsedCommands = parseGCode(code);

  // Lesson Switcher Logic
  useEffect(() => {
    const lesson = LESSONS.find(l => l.id === currentLessonId);
    if (lesson) {
        setCode(lesson.defaultCode);
        setMachineState(MachineState.IDLE);
        setCurrentLine(0);
    }
  }, [currentLessonId]);

  // Execution Timer Logic
  useEffect(() => {
    let interval: any;
    if (machineState === MachineState.RUNNING) {
        interval = setInterval(() => {
            setCurrentLine(prev => {
                if (prev >= parsedCommands.length - 1) {
                    setMachineState(MachineState.IDLE);
                    return prev;
                }
                return prev + 1;
            });
        }, 500); // Speed of simulation
    }
    return () => clearInterval(interval);
  }, [machineState, parsedCommands.length]);

  const handlePlay = () => {
    if (machineState === MachineState.IDLE || machineState === MachineState.PAUSED) {
        if (currentLine >= parsedCommands.length - 1) setCurrentLine(0);
        setMachineState(MachineState.RUNNING);
    }
  };

  const handlePause = () => setMachineState(MachineState.PAUSED);
  const handleReset = () => {
    setMachineState(MachineState.IDLE);
    setCurrentLine(0);
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
        
        {/* Top Control Bar */}
        <header className="h-14 bg-cnc-900 border-b border-cnc-700 flex items-center justify-between px-6">
            <div className="flex items-center gap-4">
                <button 
                    onClick={handlePlay}
                    className="flex items-center gap-2 bg-green-700 hover:bg-green-600 px-4 py-1.5 rounded text-sm font-bold shadow-lg shadow-green-900/20 transition-all"
                >
                    <Play size={16} /> CYCLE START
                </button>
                <button 
                    onClick={handlePause}
                    className="flex items-center gap-2 bg-yellow-700 hover:bg-yellow-600 px-4 py-1.5 rounded text-sm font-bold transition-all"
                >
                    <Pause size={16} /> FEED HOLD
                </button>
                <button 
                    onClick={handleReset}
                    className="flex items-center gap-2 bg-red-800 hover:bg-red-700 px-4 py-1.5 rounded text-sm font-bold transition-all"
                >
                    <RotateCcw size={16} /> RESET
                </button>
            </div>
            
            <div className="flex items-center gap-4 text-xs font-mono text-cnc-text">
                <div className="bg-black/50 px-3 py-1 rounded border border-cnc-700">
                    STATUS: {machineState}
                </div>
                <div className="bg-black/50 px-3 py-1 rounded border border-cnc-700">
                    LINE: N{currentLine * 10}
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
                <div className="flex-1 min-h-0">
                    <Simulator 
                        commands={parsedCommands} 
                        machineState={machineState} 
                        currentLine={currentLine}
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