import React from 'react';

interface EditorProps {
  code: string;
  onChange: (val: string) => void;
  activeLine: number;
}

export const Editor: React.FC<EditorProps> = ({ code, onChange, activeLine }) => {
  const lines = code.split('\n');

  return (
    <div className="flex flex-col h-full bg-cnc-900 border border-cnc-700 font-mono text-sm rounded-lg overflow-hidden">
      <div className="bg-cnc-800 text-gray-400 px-4 py-2 text-xs font-bold border-b border-cnc-700 flex justify-between">
        <span>PROGRAM EDITOR</span>
        <span className="text-cnc-text">O1001.NC</span>
      </div>
      <div className="flex-1 overflow-auto relative flex">
        {/* Line Numbers */}
        <div className="bg-cnc-800 text-gray-500 py-4 px-2 text-right select-none border-r border-cnc-700 w-12">
          {lines.map((_, i) => (
            <div key={i} className="leading-6">{i + 1}</div>
          ))}
        </div>
        {/* Code Input */}
        <textarea
          className="bg-transparent text-gray-300 p-4 leading-6 flex-1 outline-none resize-none whitespace-pre"
          value={code}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
        {/* Active Line Highlight Overlay */}
        <div className="absolute top-4 left-12 right-0 pointer-events-none">
             {lines.map((_, i) => (
                <div key={i} className={`h-6 w-full ${i === activeLine ? 'bg-cnc-accent/20 border-l-2 border-cnc-accent' : ''}`}></div>
            ))}
        </div>
      </div>
    </div>
  );
};