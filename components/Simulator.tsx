import React, { useEffect, useRef, useState } from 'react';
import { GCodeCommand, SimulationState, MachineState, ToolConfig } from '../types';
import { TOOLS } from '../constants';

interface SimulatorProps {
  commands: GCodeCommand[];
  machineState: MachineState;
  currentLine: number;
  feedOverride: number;
  onError: (msg: string) => void;
}

const STOCK_DIAMETER = 80; // mm
const STOCK_LENGTH = 150; // mm
const ORIGIN_X_OFFSET = 50; // Canvas pixels from right
const SCALE = 3; // Pixels per mm

// Added 32 and 33 for threading lessons
const VALID_G_CODES = [0, 1, 2, 3, 4, 20, 21, 28, 32, 33, 40, 41, 42, 43, 44, 49, 70, 71, 72, 73, 74, 75, 76, 90, 91, 96, 97, 98, 99];
const VALID_M_CODES = [0, 1, 3, 4, 5, 8, 9, 30];

export const Simulator: React.FC<SimulatorProps> = ({ commands, machineState, currentLine, feedOverride, onError }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const [tooltip, setTooltip] = useState<{x: number, y: number, tool: ToolConfig} | null>(null);
  
  // State for the simulation (tool position, settings)
  const [simState, setSimState] = useState<SimulationState>({
    x: 100, // Safe position
    z: 50,  // Safe position
    feedRate: 0,
    spindleSpeed: 0,
    spindleDirection: 'STOP',
    tool: 1,
    activeToolOffset: 0,
    toolRadiusComp: 'OFF',
    positioningMode: 'ABS',
    coolant: false,
    path: []
  });

  // 1. Interpreter Engine: Calculates the state based on lines up to currentLine
  useEffect(() => {
    if (machineState === MachineState.ALARM) return; // Freeze simulation on alarm

    if (machineState === MachineState.IDLE) {
        setSimState({
            x: 100, z: 50, feedRate: 0, spindleSpeed: 0, spindleDirection: 'STOP',
            tool: 1, activeToolOffset: 0, toolRadiusComp: 'OFF', positioningMode: 'ABS', coolant: false, path: []
        });
        return;
    }

    if (!commands || commands.length === 0) return;

    let tempX = 100;
    let tempZ = 50;
    let tempS = 0;
    let tempTool = 1;
    let tempSpindleDir: 'CW' | 'CCW' | 'STOP' = 'STOP';
    let tempOffset = 0;
    let tempRadiusComp: 'OFF' | 'LEFT' | 'RIGHT' = 'OFF';
    let tempPositioning: 'ABS' | 'INC' = 'ABS';
    const newPath: { x: number; z: number; type: 'cut' | 'rapid' }[] = [];

    // Run through all commands up to current line
    for (let i = 0; i <= currentLine && i < commands.length; i++) {
        const cmd = commands[i];
        
        // --- Validation Logic ---
        if (cmd.type === 'G') {
            if (cmd.code === undefined || !VALID_G_CODES.includes(cmd.code)) {
                onError(`Error de Sintaxis: G${cmd.code ?? '?'} desconocido o no soportado en línea ${cmd.line}`);
                return;
            }
        }
        if (cmd.type === 'M') {
             if (cmd.code === undefined || !VALID_M_CODES.includes(cmd.code)) {
                onError(`Error de Máquina: M${cmd.code ?? '?'} desconocido en línea ${cmd.line}`);
                return;
            }
        }

        // G-Codes Processing
        if (cmd.type === 'G') {
            // Positioning Mode
            if (cmd.code === 90) tempPositioning = 'ABS';
            else if (cmd.code === 91) tempPositioning = 'INC';

            // Tool Length Offset
            if (cmd.code === 43 && cmd.params.H !== undefined) {
                const tool = TOOLS.find(t => t.id === cmd.params.H);
                if (tool) tempOffset = tool.lengthOffset;
            } else if (cmd.code === 44 && cmd.params.H !== undefined) {
                const tool = TOOLS.find(t => t.id === cmd.params.H);
                if (tool) tempOffset = -tool.lengthOffset;
            } else if (cmd.code === 49) tempOffset = 0;

            // Tool Radius Compensation
            if (cmd.code === 40) tempRadiusComp = 'OFF';
            else if (cmd.code === 41) tempRadiusComp = 'LEFT';
            else if (cmd.code === 42) tempRadiusComp = 'RIGHT';
        }

        // Coordinates Calculation
        // Apply Absolute or Incremental logic for X/Z
        if (cmd.params.X !== undefined) {
            if (tempPositioning === 'ABS') tempX = cmd.params.X;
            else tempX += cmd.params.X;
        }
        if (cmd.params.U !== undefined) tempX += cmd.params.U; // U is always incremental

        if (cmd.params.Z !== undefined) {
            if (tempPositioning === 'ABS') tempZ = cmd.params.Z;
            else tempZ += cmd.params.Z;
        }
        if (cmd.params.W !== undefined) tempZ += cmd.params.W; // W is always incremental

        // Spindle Speed
        if (cmd.params.S !== undefined) tempS = cmd.params.S;

        // Tool Change
        if (cmd.type === 'T' && cmd.code) {
             const toolIdStr = cmd.code.toString();
             // Simple logic: T0101 -> ID 1. T1 -> ID 1.
             let id = parseInt(toolIdStr);
             if (toolIdStr.length >= 2) {
                // If T0101, extract first 2 digits usually
                id = parseInt(toolIdStr.substring(0, 2)); 
             }
             if (id > 0) tempTool = id;
        }

        // M Codes (Spindle)
        if (cmd.type === 'M') {
            if (cmd.code === 3) tempSpindleDir = 'CW';
            else if (cmd.code === 4) tempSpindleDir = 'CCW';
            else if (cmd.code === 5) tempSpindleDir = 'STOP';
        }

        // Path generation
        let type: 'cut' | 'rapid' = 'rapid';
        // Treat 32 (threading) as a cut
        if (cmd.type === 'G' && (cmd.code === 1 || cmd.code === 2 || cmd.code === 3 || cmd.code === 32 || cmd.code === 33 || cmd.code === 71 || cmd.code === 70 || cmd.code === 74 || cmd.code === 75 || cmd.code === 76 || cmd.code === 72)) {
            type = 'cut';
        }

        if (cmd.type === 'G' && (cmd.code === 0 || cmd.code === 1 || cmd.code === 2 || cmd.code === 3 || cmd.code === 32 || cmd.code === 33)) {
             newPath.push({ x: tempX, z: tempZ, type });
        }
    }

    setSimState(prev => ({ 
        ...prev, 
        x: tempX, z: tempZ, spindleSpeed: tempS, spindleDirection: tempSpindleDir,
        activeToolOffset: tempOffset, toolRadiusComp: tempRadiusComp, positioningMode: tempPositioning,
        path: newPath, tool: tempTool
    }));

  }, [commands, currentLine, machineState, onError]);

  // Handle Mouse Interactions for Tooltip
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if(!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const width = canvas.width;
    const height = canvas.height;
    const zZeroPixel = width - ORIGIN_X_OFFSET;
    const centerY = height / 2;
    
    // Calculate current tool position in pixels
    const toolZPixel = zZeroPixel + (simState.z * SCALE);
    const toolXPixel = centerY - ((simState.x / 2) * SCALE);

    // Simple distance check (within 60px of tool tip)
    // The tool holder extends upwards (-Y) and backwards (-Z), so we check a rough area
    const dist = Math.sqrt(Math.pow(mx - toolZPixel, 2) + Math.pow(my - toolXPixel, 2));
    
    // Also check if mouse is "above" the tool tip where the holder is
    const isOverHolder = (mx > toolZPixel - 50 && mx < toolZPixel + 20) && (my < toolXPixel && my > toolXPixel - 100);

    if (dist < 40 || isOverHolder) {
        const tool = TOOLS.find(t => t.id === simState.tool) || TOOLS[0];
        setTooltip({ x: mx, y: my, tool });
    } else {
        setTooltip(null);
    }
  };

  const handleMouseLeave = () => setTooltip(null);

  // 2. Render Loop (Animation)
  const animate = (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // Coordinates setup
    const zZeroPixel = width - ORIGIN_X_OFFSET;
    const centerY = height / 2;
    const stockPixelLen = STOCK_LENGTH * SCALE;
    const stockPixelDia = STOCK_DIAMETER * SCALE;
    const chuckX = zZeroPixel - stockPixelLen; // Left end of stock

    // Clear
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);

    // --- Draw Grid ---
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i=0; i<width; i+=20) { ctx.moveTo(i,0); ctx.lineTo(i, height); }
    for(let i=0; i<height; i+=20) { ctx.moveTo(0,i); ctx.lineTo(width, i); }
    ctx.stroke();

    // --- Draw Axes ---
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, centerY); ctx.lineTo(width, centerY); // Z Axis
    ctx.moveTo(zZeroPixel, 0); ctx.lineTo(zZeroPixel, height); // X Axis
    ctx.stroke();

    // --- Draw Chuck (Animated) ---
    const chuckHeight = stockPixelDia + 40;
    const chuckWidth = 60;
    
    ctx.save();
    ctx.translate(chuckX - (chuckWidth/2), centerY); // Center of chuck

    // Calculate rotation
    let rotation = 0;
    // Apply visual rotation speed based on override (purely visual effect for smooth animation)
    const effectiveSpindleSpeed = simState.spindleSpeed * (feedOverride / 100); 
    
    if (simState.spindleDirection === 'CW') {
        rotation = (time / 1000) * (effectiveSpindleSpeed / 60) * 2 * Math.PI; 
    } else if (simState.spindleDirection === 'CCW') {
        rotation = -(time / 1000) * (effectiveSpindleSpeed / 60) * 2 * Math.PI;
    }
    
    // Draw Chuck Body (Static part, maybe the housing)
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(-chuckWidth/2 - 20, -chuckHeight/2 - 10, chuckWidth + 20, chuckHeight + 20);

    // Rotating Part
    ctx.rotate(rotation);
    
    // Chuck Face
    const chuckGradient = ctx.createRadialGradient(0,0, 10, 0,0, chuckHeight/2);
    chuckGradient.addColorStop(0, '#555');
    chuckGradient.addColorStop(1, '#333');
    
    ctx.beginPath();
    ctx.arc(0, 0, chuckHeight/2, 0, Math.PI * 2);
    ctx.fillStyle = chuckGradient;
    ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.stroke();

    // Jaws (3-jaw chuck)
    for(let j=0; j<3; j++) {
        ctx.rotate((Math.PI * 2) / 3);
        ctx.fillStyle = '#666';
        ctx.fillRect(-10, -chuckHeight/2 + 5, 20, 30);
        
        // Jaw details
        ctx.fillStyle = '#222';
        ctx.fillRect(-10, -chuckHeight/2 + 10, 20, 2);
        ctx.fillRect(-10, -chuckHeight/2 + 20, 20, 2);
    }

    ctx.restore();

    // --- Draw Stock ---
    // Metallic Gradient for stock
    const stockGradient = ctx.createLinearGradient(0, centerY - (stockPixelDia/2), 0, centerY + (stockPixelDia/2));
    if (simState.spindleDirection === 'STOP') {
        stockGradient.addColorStop(0, '#444');
        stockGradient.addColorStop(0.5, '#777');
        stockGradient.addColorStop(1, '#444');
    } else {
        stockGradient.addColorStop(0, '#555');
        stockGradient.addColorStop(0.5, '#888');
        stockGradient.addColorStop(1, '#555');
    }

    // Upper half
    ctx.fillStyle = stockGradient;
    ctx.fillRect(chuckX, centerY - (stockPixelDia/2), stockPixelLen, stockPixelDia);

    // Motion lines if spinning (Horizontal blur)
    if (simState.spindleDirection !== 'STOP') {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        for(let i=0; i<3; i++) {
             const y = centerY - (stockPixelDia/2) + 5 + (i * 20);
             ctx.fillRect(chuckX, y, stockPixelLen, 2);
             ctx.fillRect(chuckX, centerY + 5 + (i * 20), stockPixelLen, 2);
        }
    }

    // --- Draw Path ---
    if (simState.path.length > 0) {
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        
        // Rapid (Cyan dashed)
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
        ctx.setLineDash([5, 5]);
        let lastX = 100; let lastZ = 50;
        simState.path.forEach(p => {
            if (p.type === 'rapid') {
                const cx = zZeroPixel + (p.z * SCALE); 
                const cy = centerY - ((p.x / 2) * SCALE);
                const lx = zZeroPixel + (lastZ * SCALE);
                const ly = centerY - ((lastX / 2) * SCALE);
                ctx.moveTo(lx, ly); ctx.lineTo(cx, cy);
            }
            lastX = p.x; lastZ = p.z;
        });
        ctx.stroke();

        // Cut (Orange solid)
        ctx.beginPath();
        ctx.strokeStyle = '#ff9900';
        ctx.setLineDash([]);
        lastX = 100; lastZ = 50;
        simState.path.forEach(p => {
            const cx = zZeroPixel + (p.z * SCALE); 
            const cy = centerY - ((p.x / 2) * SCALE);
            const lx = zZeroPixel + (lastZ * SCALE);
            const ly = centerY - ((lastX / 2) * SCALE);

            if (p.type === 'cut') {
                ctx.moveTo(lx, ly); ctx.lineTo(cx, cy);
                // Mirror
                ctx.moveTo(lx, centerY + ((lastX / 2) * SCALE));
                ctx.lineTo(cx, centerY + ((p.x / 2) * SCALE));
            }
            lastX = p.x; lastZ = p.z;
        });
        ctx.stroke();
    }

    // --- Draw Tool ---
    const toolZPixel = zZeroPixel + (simState.z * SCALE);
    const toolXPixel = centerY - ((simState.x / 2) * SCALE);
    const activeToolConfig = TOOLS.find(t => t.id === simState.tool) || TOOLS[0];
    const noseRadPixel = activeToolConfig.noseRadius * SCALE;

    ctx.save();
    ctx.translate(toolZPixel, toolXPixel);
    
    // Drop Shadow for tool
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;

    // Draw Tool based on type
    const insertColor = activeToolConfig.color;
    
    // Gradient for the holder (Steel look)
    const holderGradient = ctx.createLinearGradient(0, -60, 20, 0);
    holderGradient.addColorStop(0, '#2b2b2b');
    holderGradient.addColorStop(0.5, '#4a4a4a');
    holderGradient.addColorStop(1, '#333');

    // Gradient for Turret Block
    const blockGradient = ctx.createLinearGradient(0, -100, 40, -50);
    blockGradient.addColorStop(0, '#1a1a1a');
    blockGradient.addColorStop(1, '#2a2a2a');
    
    const clampColor = '#111';

    if (activeToolConfig.type === 'grooving') {
        const w = activeToolConfig.width * SCALE;
        const h = 40; 
        
        // Holder Block (Main Body) extending up
        ctx.fillStyle = blockGradient;
        ctx.fillRect(-10, -h - 60, w + 20, 50);
        
        // Bolt heads on block
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(0, -h - 50, 3, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(w, -h - 35, 3, 0, Math.PI*2); ctx.fill();

        // Blade Holder
        ctx.fillStyle = holderGradient;
        ctx.fillRect(0, -h - 20, w, 20);

        // Insert (Tip)
        ctx.fillStyle = insertColor;
        // Beveled top for chip breaker look
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(w, 0);
        ctx.lineTo(w, -h);
        ctx.bezierCurveTo(w - 2, -h + 5, 2, -h + 5, 0, -h);
        ctx.closePath();
        ctx.fill();
        
        // Tip highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
    } 
    else if (activeToolConfig.type === 'threading') {
        // Threading Tool: 60 deg triangle tip
        const h = 12 * SCALE;
        const hw = h * Math.tan(30 * Math.PI / 180);
        
        // Shank
        ctx.fillStyle = holderGradient;
        ctx.beginPath();
        ctx.moveTo(hw + 2, -h + 2); // Right of tip
        ctx.lineTo(hw + 2, -h - 20); // Go up
        ctx.lineTo(-hw - 10, -h - 20); // Go left (back)
        ctx.lineTo(-hw - 10, -h + 2); // Go down
        ctx.fill();

        // Main Block
        ctx.fillStyle = blockGradient;
        ctx.fillRect(0, -h - 50, 40, 30);
        // Bolts
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(20, -h - 35, 4, 0, Math.PI*2); ctx.fill();

        // Insert
        ctx.fillStyle = insertColor;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(hw, -h);
        // Chip breaker groove
        ctx.lineTo(0, -h + 5); 
        ctx.lineTo(-hw, -h);
        ctx.closePath();
        ctx.fill();
    } 
    else {
        // General Turning Tool (Diamond shape CNMG)
        const size = 15 * SCALE; // approx size of insert
        const r = noseRadPixel;
        
        // --- Holder Shank (Seat) ---
        ctx.fillStyle = holderGradient;
        ctx.beginPath();
        // Shape wrapping the back of the insert
        ctx.moveTo(r, -5); 
        ctx.lineTo(size + 5, -5);
        ctx.lineTo(size + 5, -size - 5);
        ctx.lineTo(-5, -size - 5);
        ctx.lineTo(-5, -r - 5); 
        ctx.fill();

        // --- Turret Block (Stem) ---
        ctx.fillStyle = blockGradient;
        ctx.fillRect(5, -size - 5, 40, -80); 
        
        // Detail lines on block
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(10, -size - 5); ctx.lineTo(10, -size - 85); ctx.stroke();

        // --- Insert ---
        // Create a gradient for the insert to look 3D
        const insertGrad = ctx.createLinearGradient(0, 0, size, -size);
        insertGrad.addColorStop(0, insertColor);
        insertGrad.addColorStop(1, '#d4af37'); // Gold-ish highlight for coated inserts

        ctx.fillStyle = insertGrad;
        
        // Draw Nose Circle
        ctx.beginPath();
        ctx.arc(r, -r, r, 0, Math.PI * 2);
        ctx.fill();

        // Draw Insert Body
        ctx.beginPath();
        ctx.moveTo(r, 0); 
        ctx.lineTo(size, -2);
        ctx.lineTo(size, -size);
        ctx.lineTo(0, -size);
        ctx.lineTo(0, -r);
        ctx.fill();
        
        // Chip Breaker Detail (Inner shape)
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.moveTo(r + 2, -r - 2);
        ctx.lineTo(size - 4, -4);
        ctx.lineTo(size - 4, -size + 4);
        ctx.lineTo(4, -size + 4);
        ctx.fill();
        
        // --- Clamp/Screw ---
        ctx.fillStyle = clampColor;
        ctx.beginPath();
        ctx.arc(size/2, -size/2, 4 * SCALE, 0, Math.PI * 2);
        ctx.fill();
        // Torx/Hex pattern
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for(let k=0; k<6; k++) {
           const angle = (Math.PI * k) / 3;
           ctx.moveTo(size/2, -size/2);
           ctx.lineTo(size/2 + Math.cos(angle)*3*SCALE, -size/2 + Math.sin(angle)*3*SCALE);
        }
        ctx.stroke();
    }
    
    // Tool Label
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.shadowBlur = 0; // Remove shadow for text
    ctx.fillText(`T${simState.tool}`, 15, -60);
    
    ctx.restore();

    // --- Info Overlay on Canvas ---
    ctx.fillStyle = '#fff';
    ctx.font = '12px JetBrains Mono';
    ctx.fillText(`X${simState.x.toFixed(3)} Z${simState.z.toFixed(3)}`, 10, height - 10);
    
    // Spindle Visual Indicator Text near chuck
    if (simState.spindleDirection !== 'STOP') {
        ctx.fillStyle = '#00ff00';
        ctx.textAlign = 'center';
        ctx.fillText(`${simState.spindleDirection} ${simState.spindleSpeed}`, chuckX, centerY - chuckHeight/2 - 10);
        ctx.textAlign = 'left';
    }

    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [simState, feedOverride]);

  // Helper for rendering TRC status color
  const getTrcColor = (status: string) => {
      if (status === 'LEFT') return 'text-orange-400';
      if (status === 'RIGHT') return 'text-purple-400';
      return 'text-gray-500';
  };

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden border border-cnc-700 shadow-xl">
        <canvas 
            ref={canvasRef} 
            width={800} 
            height={400} 
            className="w-full h-full object-cover"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        />
        
        {/* Tool Tip Overlay */}
        {tooltip && (
            <div 
                style={{ top: tooltip.y + 15, left: tooltip.x + 15 }} 
                className="absolute bg-zinc-900/95 border border-cnc-accent p-3 rounded shadow-2xl z-50 pointer-events-none text-xs backdrop-blur min-w-[150px]"
            >
                <div className="font-bold text-cnc-accent text-sm mb-2 border-b border-zinc-700 pb-1">{tooltip.tool.name}</div>
                
                <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-zinc-400">
                    <span>Holder:</span>
                    <span className="text-white font-mono">{tooltip.tool.holderType}</span>
                    
                    <span>Material:</span>
                    <span className="text-white">{tooltip.tool.holderMaterial}</span>
                    
                    <span>Offset:</span>
                    <span className="text-white font-mono">{tooltip.tool.lengthOffset}mm</span>
                    
                    <span>Radius:</span>
                    <span className="text-white font-mono">{tooltip.tool.noseRadius}mm</span>
                    
                    <span className="self-center">Insert:</span>
                    <div className="flex items-center gap-2">
                         <span className="w-3 h-3 rounded-sm shadow-inner" style={{backgroundColor: tooltip.tool.color, boxShadow: 'inset 0 0 2px rgba(0,0,0,0.5)'}}></span>
                         <span className="text-xs text-zinc-500">Coated</span>
                    </div>
                </div>
            </div>
        )}

        {/* ALARM Overlay */}
        {machineState === MachineState.ALARM && (
            <div className="absolute inset-0 bg-red-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-pulse">
                 <div className="text-4xl font-black text-red-500 tracking-widest border-4 border-red-500 px-8 py-4 rounded rotate-[-5deg]">
                    ALARM
                 </div>
            </div>
        )}

        <div className="absolute top-2 right-2 bg-black/50 text-cnc-accent text-xs p-2 rounded font-mono border border-cnc-700 w-48 pointer-events-none">
            <div className="font-bold border-b border-cnc-700 pb-1 mb-1">NAVIOR 5-AXIS SIM</div>
            <div className="flex justify-between">
                <span>MODE:</span> 
                <span className={machineState === MachineState.ALARM ? 'text-red-500 font-bold animate-pulse' : 'text-white'}>
                    {machineState}
                </span>
            </div>
            
            {/* Positioning Mode Display */}
            <div className="flex justify-between">
                <span>POS:</span> 
                <span className={`font-bold ${simState.positioningMode === 'ABS' ? 'text-blue-400' : 'text-yellow-400'}`}>
                    {simState.positioningMode === 'ABS' ? 'G90 (ABS)' : 'G91 (INC)'}
                </span>
            </div>

            <div className="flex justify-between">
                <span>TOOL:</span> <span className="text-white">T{simState.tool < 10 ? '0'+simState.tool : simState.tool}</span>
            </div>
            <div className="flex justify-between items-center mt-1 pt-1 border-t border-cnc-700/50">
                <span className={simState.spindleDirection === 'STOP' ? 'text-red-500' : 'text-green-400 font-bold'}>
                   {simState.spindleDirection === 'STOP' ? 'SPINDLE STOP' : `SPINDLE ${simState.spindleDirection} S${simState.spindleSpeed}`}
                </span>
            </div>
            <div className={`text-right ${simState.activeToolOffset !== 0 ? 'text-yellow-400' : 'text-gray-500'}`}>
                TLO: {simState.activeToolOffset > 0 ? '+' : ''}{simState.activeToolOffset.toFixed(3)}
            </div>
            
            {/* TRC Display */}
            <div className="flex justify-between items-center mt-1">
                <span>TRC:</span>
                <span className={`font-bold ${getTrcColor(simState.toolRadiusComp)}`}>
                    {simState.toolRadiusComp}
                    {simState.toolRadiusComp !== 'OFF' && (
                       <span className="text-xs font-normal ml-1 text-gray-400">
                          (R{(TOOLS.find(t => t.id === simState.tool)?.noseRadius || 0).toFixed(2)})
                       </span>
                    )}
                </span>
            </div>
            
            <div className="flex justify-between items-center mt-1 pt-1 border-t border-cnc-700/50">
                <span>FEED:</span> 
                <span className={feedOverride !== 100 ? 'text-yellow-400' : 'text-white'}>
                    {feedOverride}%
                </span>
            </div>
        </div>
    </div>
  );
};