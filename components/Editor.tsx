import React, { useRef } from 'react';

interface EditorProps {
  code: string;
  onChange: (val: string) => void;
  activeLine: number;
}

const highlightGCode = (text: string) => {
  // We process line by line to keep it simple and synchronized with the textarea lines
  return text.split('\n').map((line, i) => (
    <div key={i} className="min-h-[1.5rem]">{renderLine(line)}</div>
  ));
};

const renderLine = (line: string) => {
  if (line.length === 0) return <span><br/></span>; // Render empty line as br to ensure height

  const elements: React.ReactNode[] = [];
  
  // 1. Separate Comment from Code
  // Comments start with '(' or ';'
  const parenIdx = line.indexOf('(');
  const semiIdx = line.indexOf(';');
  let commentStart = -1;
  
  if (parenIdx !== -1 && semiIdx !== -1) commentStart = Math.min(parenIdx, semiIdx);
  else if (parenIdx !== -1) commentStart = parenIdx;
  else if (semiIdx !== -1) commentStart = semiIdx;
  
  let codePart = line;
  let commentPart = '';
  
  if (commentStart !== -1) {
    codePart = line.substring(0, commentStart);
    commentPart = line.substring(commentStart);
  }

  // 2. Tokenize Code Part
  // We look for [Letter][Value] patterns, capturing whitespace in between
  // Regex: ([A-Z])([-+]?[0-9]*\.?[0-9]*) with global flag
  const regex = /([A-Z])([-+]?[0-9]*\.?[0-9]*)/gi;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(codePart)) !== null) {
    // Render text between matches (whitespace or unrecognized)
    if (match.index > lastIndex) {
      elements.push(
        <span key={`pre-${match.index}`} className="text-gray-500">
          {codePart.substring(lastIndex, match.index)}
        </span>
      );
    }
    
    const letter = match[1].toUpperCase();
    const value = match[2];
    
    let colorClass = 'text-gray-200'; // Default
    if (letter === 'G') colorClass = 'text-yellow-400 font-bold';
    else if (letter === 'M') colorClass = 'text-pink-400 font-bold';
    else if (['X', 'Z', 'U', 'W', 'I', 'K', 'R'].includes(letter)) colorClass = 'text-cyan-400';
    else if (['F', 'S', 'T'].includes(letter)) colorClass = 'text-green-400';
    else if (letter === 'N') colorClass = 'text-gray-500'; // Line numbers inside code

    elements.push(
      <span key={`tok-${match.index}`}>
        <span className={colorClass}>{match[1]}</span>
        <span className="text-white">{value}</span>
      </span>
    );
    
    lastIndex = regex.lastIndex;
  }
  
  // Render remaining code part
  if (lastIndex < codePart.length) {
    elements.push(
      <span key="post-code" className="text-gray-500">
        {codePart.substring(lastIndex)}
      </span>
    );
  }
  
  // 3. Render Comment Part
  if (commentPart) {
    elements.push(
      <span key="comment" className="text-gray-500 italic">
        {commentPart}
      </span>
    );
  }

  return <>{elements}</>;
};

export const Editor: React.FC<EditorProps> = ({ code, onChange, activeLine }) => {
  const lines = code.split('\n');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  return (
    <div className="flex flex-col h-full bg-cnc-900 border border-cnc-700 font-mono text-sm rounded-lg overflow-hidden">
      <div className="bg-cnc-800 text-gray-400 px-4 py-2 text-xs font-bold border-b border-cnc-700 flex justify-between">
        <span>PROGRAM EDITOR</span>
        <span className="text-cnc-text">O1001.NC</span>
      </div>
      
      {/* Scrollable Container */}
      <div className="flex-1 overflow-auto relative flex">
        
        {/* Line Numbers Column */}
        <div className="bg-cnc-800 text-gray-500 py-4 px-2 text-right select-none border-r border-cnc-700 w-12 z-20 sticky left-0 min-h-full">
          {lines.map((_, i) => (
            <div key={i} className="leading-6 h-6">{i + 1}</div>
          ))}
        </div>

        {/* Editor Stack Container */}
        <div className="flex-1 relative min-w-0 grid place-items-start">
            
            {/* 1. Active Line Highlight Layer (Background) */}
             <div className="absolute top-4 left-0 right-0 pointer-events-none z-0">
                {lines.map((_, i) => (
                    <div key={i} className={`h-6 w-full ${i === activeLine ? 'bg-cnc-accent/10 border-l-2 border-cnc-accent' : ''}`}></div>
                ))}
            </div>

            {/* 2. Syntax Highlighter Layer (Middle) */}
            <pre 
                ref={preRef}
                className="p-4 m-0 font-mono text-sm leading-6 whitespace-pre pointer-events-none row-start-1 col-start-1 z-10 w-full font-inherit"
                aria-hidden="true"
            >
                {highlightGCode(code)}
                {/* Add an extra newline character visualization if needed */}
                <br /> 
            </pre>

            {/* 3. Textarea Layer (Foreground - Transparent Text) */}
            <textarea
                ref={textareaRef}
                className="p-4 m-0 font-mono text-sm leading-6 whitespace-pre bg-transparent text-transparent caret-white outline-none resize-none overflow-hidden row-start-1 col-start-1 z-20 w-full h-full block"
                value={code}
                onChange={(e) => onChange(e.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
            />
        </div>
      </div>
    </div>
  );
};