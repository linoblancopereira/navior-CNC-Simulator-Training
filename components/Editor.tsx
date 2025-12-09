import React, { useRef, useEffect } from 'react';

interface EditorProps {
  code: string;
  onChange: (val: string) => void;
  activeLine: number;
}

const highlightGCode = (text: string) => {
  return text.split('\n').map((line, i) => (
    <div key={i} className="min-h-[1.5rem]">{renderLine(line)}</div>
  ));
};

const renderLine = (line: string) => {
  if (line.length === 0) return <span><br/></span>;

  const elements: React.ReactNode[] = [];
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

  const regex = /([A-Z])([-+]?[0-9]*\.?[0-9]*)/gi;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(codePart)) !== null) {
    if (match.index > lastIndex) {
      elements.push(<span key={`pre-${match.index}`} className="text-zinc-600">{codePart.substring(lastIndex, match.index)}</span>);
    }
    
    const letter = match[1].toUpperCase();
    const value = match[2];
    
    let colorClass = 'text-gray-300';
    if (letter === 'G') colorClass = 'text-yellow-400 font-bold';
    else if (letter === 'M') colorClass = 'text-pink-500 font-bold';
    else if (['X', 'Z', 'U', 'W', 'I', 'K', 'R'].includes(letter)) colorClass = 'text-cyan-400';
    else if (['F', 'S', 'T'].includes(letter)) colorClass = 'text-green-400';
    else if (letter === 'N') colorClass = 'text-zinc-500';

    elements.push(
      <span key={`tok-${match.index}`}>
        <span className={colorClass}>{match[1]}</span>
        <span className="text-zinc-200 font-mono">{value}</span>
      </span>
    );
    lastIndex = regex.lastIndex;
  }
  
  if (lastIndex < codePart.length) {
    elements.push(<span key="post-code" className="text-zinc-600">{codePart.substring(lastIndex)}</span>);
  }
  
  if (commentPart) {
    elements.push(<span key="comment" className="text-zinc-500 italic">{commentPart}</span>);
  }

  return <>{elements}</>;
};

export const Editor: React.FC<EditorProps> = ({ code, onChange, activeLine }) => {
  const lines = code.split('\n');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active line
  useEffect(() => {
    if (lineRef.current) {
        lineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeLine]);

  return (
    <div className="flex flex-col h-full bg-cnc-900 border border-cnc-700 font-mono text-sm rounded-lg overflow-hidden shadow-inner">
      <div className="bg-cnc-850 text-cnc-accent px-4 py-2 text-xs font-bold border-b border-cnc-700 flex justify-between items-center shadow-sm">
        <span className="tracking-widest">EDIT MODE</span>
        <span className="text-zinc-500">O1001.NC</span>
      </div>
      
      <div className="flex-1 overflow-auto relative flex bg-[#0c0c0c]">
        {/* Line Numbers */}
        <div className="bg-cnc-900 text-zinc-600 py-4 px-3 text-right select-none border-r border-cnc-800 min-h-full font-mono text-xs">
          {lines.map((_, i) => (
            <div key={i} className={`leading-6 h-6 ${i === activeLine ? 'text-yellow-500 font-bold' : ''}`}>{i + 1}</div>
          ))}
        </div>

        {/* Editor Area */}
        <div className="flex-1 relative min-w-0 grid place-items-start">
             <div className="absolute top-4 left-0 right-0 pointer-events-none z-0">
                {lines.map((_, i) => (
                    <div 
                        key={i} 
                        ref={i === activeLine ? lineRef : null}
                        className={`h-6 w-full transition-colors duration-100 ${i === activeLine ? 'bg-zinc-800/60 border-l-2 border-yellow-500' : ''}`}
                    ></div>
                ))}
            </div>

            <pre className="p-4 m-0 font-mono text-sm leading-6 whitespace-pre pointer-events-none row-start-1 col-start-1 z-10 w-full font-inherit">
                {highlightGCode(code)}
                <br /> 
            </pre>

            <textarea
                ref={textareaRef}
                className="p-4 m-0 font-mono text-sm leading-6 whitespace-pre bg-transparent text-transparent caret-yellow-500 outline-none resize-none overflow-hidden row-start-1 col-start-1 z-20 w-full h-full block"
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