import React, { useEffect, useRef, useState } from 'react';
import { GCodeCommand, SimulationState, MachineState, ToolConfig } from '../types';
import { TOOLS } from '../constants';

interface SimulatorProps {
  commands: GCodeCommand[];
  machineState: MachineState;
  currentLine: number;
  feedOverride: number;
  onError: (msg: string) => void;
  onStateChange?: (state: SimulationState) => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const STOCK_DIAMETER = 80; // mm
const STOCK_LENGTH = 150; // mm
const ORIGIN_X_OFFSET = 50; // Canvas pixels from right
const SCALE = 3; // Pixels per mm

const VALID_G_CODES = [0, 1, 2, 3, 4, 20, 21, 28, 32, 33, 40, 41, 42, 43, 44, 49, 50, 70, 71, 72, 73, 74, 75, 76, 90, 91, 96, 97, 98, 99];

export const Simulator: React.FC<SimulatorProps> = ({ commands, machineState, currentLine, feedOverride, onError, onStateChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);
  const [tooltip, setTooltip] = useState<{x: number, y: number, tool: ToolConfig} | null>(null);
  
  // State for the simulation
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

  // Previous position ref to detect movement for sparks
  const prevPosRef = useRef({ x: 100, z: 50 });

  // 1. Interpreter Engine
  useEffect(() => {
    if (machineState === MachineState.ALARM) return;

    if (machineState === MachineState.IDLE) {
        const idleState: SimulationState = {
            x: 100, z: 50, feedRate: 0, spindleSpeed: 0, spindleDirection: 'STOP',
            tool: 1, activeToolOffset: 0, toolRadiusComp: 'OFF', positioningMode: 'ABS', coolant: false, path: []
        };
        setSimState(idleState);
        if (onStateChange) onStateChange(idleState);
        prevPosRef.current = { x: 100, z: 50 };
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

    // Run interpreter
    for (let i = 0; i <= currentLine && i < commands.length; i++) {
        const cmd = commands[i];
        
        // Basic Validation
        if (cmd.type === 'G' && cmd.code !== undefined && !VALID_G_CODES.includes(cmd.code)) {
            onError(`Error Sintaxis: G${cmd.code} no soportado en línea ${cmd.line}`);
            return;
        }

        // Logic (Same as before)
        if (cmd.type === 'G') {
            if (cmd.code === 90) tempPositioning = 'ABS';
            else if (cmd.code === 91) tempPositioning = 'INC';
            if (cmd.code === 43 && cmd.params.H !== undefined) {
                const tool = TOOLS.find(t => t.id === cmd.params.H);
                if (tool) tempOffset = tool.lengthOffset;
            } else if (cmd.code === 49) tempOffset = 0;
            if (cmd.code === 40) tempRadiusComp = 'OFF';
            else if (cmd.code === 41) tempRadiusComp = 'LEFT';
            else if (cmd.code === 42) tempRadiusComp = 'RIGHT';
        }

        if (cmd.params.X !== undefined) tempX = tempPositioning === 'ABS' ? cmd.params.X : tempX + cmd.params.X;
        if (cmd.params.U !== undefined) tempX += cmd.params.U;
        if (cmd.params.Z !== undefined) tempZ = tempPositioning === 'ABS' ? cmd.params.Z : tempZ + cmd.params.Z;
        if (cmd.params.W !== undefined) tempZ += cmd.params.W;
        
        // Spindle Speed
        if (cmd.params.S !== undefined && !(cmd.type === 'G' && cmd.code === 50)) {
            tempS = cmd.params.S;
        }

        if (cmd.type === 'T' && cmd.code) {
             const toolIdStr = cmd.code.toString();
             let id = parseInt(toolIdStr);
             if (toolIdStr.length >= 2) id = parseInt(toolIdStr.substring(0, 2)); 
             if (id > 0) tempTool = id;
        }

        if (cmd.type === 'M') {
            if (cmd.code === 3) tempSpindleDir = 'CW';
            else if (cmd.code === 4) tempSpindleDir = 'CCW';
            else if (cmd.code === 5) tempSpindleDir = 'STOP';
        }

        let type: 'cut' | 'rapid' = 'rapid';
        if (cmd.type === 'G' && (cmd.code === 1 || cmd.code === 2 || cmd.code === 3 || cmd.code === 32 || cmd.code === 33 || cmd.code === 71 || cmd.code === 72 || cmd.code === 74 || cmd.code === 75 || cmd.code === 76)) {
            type = 'cut';
        }

        if (cmd.type === 'G' && [0,1,2,3,32,33].includes(cmd.code || -1)) {
             newPath.push({ x: tempX, z: tempZ, type });
        }
    }

    const newState: SimulationState = { 
        x: tempX, z: tempZ, spindleSpeed: tempS, spindleDirection: tempSpindleDir,
        activeToolOffset: tempOffset, toolRadiusComp: tempRadiusComp, positioningMode: tempPositioning,
        path: newPath, tool: tempTool, feedRate: 0, coolant: false
    };

    setSimState(newState);
    if (onStateChange) onStateChange(newState);

  }, [commands, currentLine, machineState, onError, onStateChange]);

  // Handle Tooltip
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
    const toolZPixel = zZeroPixel + (simState.z * SCALE);
    const toolXPixel = centerY - ((simState.x / 2) * SCALE);
    
    // Hit detection relative to tool tip
    const isOverHolder = (mx > toolZPixel - 10 && mx < toolZPixel + 100) && (my < toolXPixel && my > toolXPixel - 80);
    const dist = Math.sqrt(Math.pow(mx - toolZPixel, 2) + Math.pow(my - toolXPixel, 2));

    if (dist < 40 || isOverHolder) {
        const tool = TOOLS.find(t => t.id === simState.tool) || TOOLS[0];
        setTooltip({ x: mx, y: my, tool });
    } else {
        setTooltip(null);
    }
  };
  const handleMouseLeave = () => setTooltip(null);

  // 2. Render & Physics Loop
  const animate = (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const zZeroPixel = width - ORIGIN_X_OFFSET;
    const centerY = height / 2;
    const stockPixelLen = STOCK_LENGTH * SCALE;
    const stockPixelDia = STOCK_DIAMETER * SCALE;
    const chuckX = zZeroPixel - stockPixelLen;

    // --- Particle Logic (Sparks) ---
    const isCutting = simState.spindleDirection !== 'STOP' && 
                      simState.path.length > 0 && 
                      simState.path[simState.path.length - 1].type === 'cut';
    
    const dx = simState.x - prevPosRef.current.x;
    const dz = simState.z - prevPosRef.current.z;
    const isMoving = Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001;

    if (isCutting && isMoving && simState.x <= STOCK_DIAMETER + 1) {
        for(let i=0; i<3; i++) {
            const toolZPixel = zZeroPixel + (simState.z * SCALE);
            const toolXPixel = centerY - ((simState.x / 2) * SCALE);
            particlesRef.current.push({
                x: toolZPixel,
                y: toolXPixel,
                vx: (Math.random() - 0.2) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 1.0,
                color: Math.random() > 0.5 ? '#ffaa00' : '#ffff00'
            });
        }
    }
    prevPosRef.current = { x: simState.x, z: simState.z };

    particlesRef.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
        p.life -= 0.05;
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);

    // --- Drawing ---
    
    ctx.fillStyle = '#0f1115';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#1a1f26';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i=0; i<width; i+=40) { ctx.moveTo(i,0); ctx.lineTo(i, height); }
    for(let i=0; i<height; i+=40) { ctx.moveTo(0,i); ctx.lineTo(width, i); }
    ctx.stroke();

    ctx.strokeStyle = '#333';
    ctx.setLineDash([20, 5, 5, 5]);
    ctx.beginPath(); ctx.moveTo(0, centerY); ctx.lineTo(width, centerY); ctx.stroke();
    ctx.setLineDash([]);

    // --- Chuck ---
    const chuckHeight = stockPixelDia + 40;
    const chuckWidth = 60;
    ctx.save();
    ctx.translate(chuckX - (chuckWidth/2), centerY); 
    
    const effectiveSpindleSpeed = simState.spindleSpeed * (feedOverride / 100); 
    let rotation = 0;
    if (simState.spindleDirection === 'CW') rotation = (time / 1000) * (effectiveSpindleSpeed / 60) * 2 * Math.PI; 
    else if (simState.spindleDirection === 'CCW') rotation = -(time / 1000) * (effectiveSpindleSpeed / 60) * 2 * Math.PI;

    const housingGrad = ctx.createLinearGradient(0, -chuckHeight/2, 0, chuckHeight/2);
    housingGrad.addColorStop(0, '#222'); housingGrad.addColorStop(0.5, '#444'); housingGrad.addColorStop(1, '#222');
    ctx.fillStyle = housingGrad;
    ctx.fillRect(-chuckWidth/2 - 20, -chuckHeight/2 - 10, chuckWidth + 20, chuckHeight + 20);

    ctx.rotate(rotation);
    const faceGrad = ctx.createRadialGradient(0,0, 5, 0,0, chuckHeight/2);
    faceGrad.addColorStop(0, '#555'); faceGrad.addColorStop(1, '#111');
    ctx.beginPath(); ctx.arc(0, 0, chuckHeight/2, 0, Math.PI * 2);
    ctx.fillStyle = faceGrad; ctx.fill();
    
    for(let j=0; j<3; j++) {
        ctx.rotate((Math.PI * 2) / 3);
        ctx.fillStyle = '#666'; ctx.fillRect(-10, -chuckHeight/2 + 5, 20, 30);
    }
    ctx.restore();

    // --- Stock ---
    const stockGradient = ctx.createLinearGradient(0, centerY - (stockPixelDia/2), 0, centerY + (stockPixelDia/2));
    if (simState.spindleDirection === 'STOP') {
        stockGradient.addColorStop(0, '#2d3748');
        stockGradient.addColorStop(0.2, '#718096');
        stockGradient.addColorStop(0.5, '#a0aec0');
        stockGradient.addColorStop(0.8, '#718096');
        stockGradient.addColorStop(1, '#2d3748');
    } else {
        stockGradient.addColorStop(0, '#4a5568');
        stockGradient.addColorStop(0.5, '#cbd5e0');
        stockGradient.addColorStop(1, '#4a5568');
    }

    ctx.fillStyle = stockGradient;
    ctx.fillRect(chuckX, centerY - (stockPixelDia/2), stockPixelLen, stockPixelDia/2);
    ctx.fillRect(chuckX, centerY, stockPixelLen, stockPixelDia/2);
    
    const endX = chuckX + stockPixelLen;
    ctx.fillStyle = '#718096';
    ctx.fillRect(endX, centerY - (stockPixelDia/2), 2, stockPixelDia);


    // --- Path Visualization ---
    if (simState.path.length > 0) {
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
        ctx.setLineDash([4, 4]);
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

        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)';
        ctx.setLineDash([]);
        lastX = 100; lastZ = 50;
        simState.path.forEach(p => {
            const cx = zZeroPixel + (p.z * SCALE); 
            const cy = centerY - ((p.x / 2) * SCALE);
            const lx = zZeroPixel + (lastZ * SCALE);
            const ly = centerY - ((lastX / 2) * SCALE);

            if (p.type === 'cut') {
                ctx.moveTo(lx, ly); ctx.lineTo(cx, cy);
                ctx.moveTo(lx, centerY + ((lastX / 2) * SCALE));
                ctx.lineTo(cx, centerY + ((p.x / 2) * SCALE));
            }
            lastX = p.x; lastZ = p.z;
        });
        ctx.stroke();
    }

    // --- Draw Particles ---
    particlesRef.current.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });

    // --- Tool Drawing ---
    const toolZPixel = zZeroPixel + (simState.z * SCALE);
    const toolXPixel = centerY - ((simState.x / 2) * SCALE);
    const activeToolConfig = TOOLS.find(t => t.id === simState.tool) || TOOLS[0];
    
    ctx.save();
    ctx.translate(toolZPixel, toolXPixel);
    // Add shadow
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;

    // --- Tool Holder Colors based on type ---
    let holderColorStart = '#333';
    let holderColorMid = '#444';
    let holderColorEnd = '#222';

    if (activeToolConfig.type === 'grooving') {
        // Dark Blue/Grey tint for Grooving
        holderColorStart = '#172554'; // blue-950
        holderColorMid = '#1e3a8a';   // blue-900
        holderColorEnd = '#172554';
    } else if (activeToolConfig.type === 'threading') {
        // Dark Red/Brown tint for Threading
        holderColorStart = '#450a0a'; // red-950
        holderColorMid = '#7f1d1d';   // red-900
        holderColorEnd = '#450a0a';
    } else {
        // Standard Grey for General
        holderColorStart = '#27272a'; // zinc-800
        holderColorMid = '#3f3f46';   // zinc-700
        holderColorEnd = '#27272a';
    }
    
    // Function to create gradient for a given vertical range
    const createHolderGradient = (y1: number, y2: number) => {
        const grad = ctx.createLinearGradient(0, y1, 0, y2);
        grad.addColorStop(0, holderColorStart);
        grad.addColorStop(0.5, holderColorMid);
        grad.addColorStop(1, holderColorEnd);
        return grad;
    };

    const insertColor = activeToolConfig.color;

    // 1. Draw Turret Block (Background, moves with tool)
    // Positioned to right (Z+) and above (Y-) to simulate tool post
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(50, -60, 80, 100); 
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
    ctx.strokeRect(50, -60, 80, 100);
    // Bolt heads
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(65, -40, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(65, 30, 3, 0, Math.PI*2); ctx.fill();

    // 2. Specific Tool Holders
    if (activeToolConfig.type === 'grooving') {
        const width = 4 * SCALE; // Visual width of holder blade
        const insertW = activeToolConfig.width * SCALE;
        const length = 45;

        // Block
        ctx.fillStyle = createHolderGradient(-35, 25);
        ctx.fillRect(20, -35, 50, 60);

        // Blade
        ctx.fillStyle = holderColorStart;
        ctx.beginPath();
        ctx.moveTo(5, -insertW); // Start above insert
        ctx.lineTo(5, -length); // Go up to block
        ctx.lineTo(20, -length); // Wider at block
        ctx.lineTo(20, -insertW);
        ctx.fill();

        // Insert
        ctx.fillStyle = insertColor;
        ctx.fillRect(0, -insertW, insertW, insertW); 
        
        // Clamp screw
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(35, -15, 4, 0, Math.PI*2); ctx.fill();

    } else if (activeToolConfig.type === 'threading') {
        const shankH = 18;
        
        // Shank
        ctx.fillStyle = createHolderGradient(-shankH, 0);
        ctx.fillRect(10, -shankH, 80, shankH); 
        
        // Head offset
        ctx.beginPath();
        ctx.moveTo(10, -shankH);
        ctx.lineTo(0, -shankH + 2);
        ctx.lineTo(0, -2);
        ctx.lineTo(10, 0);
        ctx.fill();

        // Insert (Triangle)
        ctx.fillStyle = insertColor;
        ctx.beginPath();
        ctx.moveTo(0, 0); // Tip
        ctx.lineTo(5, -3);
        ctx.lineTo(5, 0);
        ctx.closePath();
        ctx.fill();

        // Clamp
        ctx.fillStyle = '#000';
        ctx.fillRect(5, -shankH + 4, 4, 4);

    } else {
        // General Turning
        // Shank (Rectangular Block)
        ctx.fillStyle = createHolderGradient(-25, 0);
        ctx.fillRect(10, -25, 100, 25); // Y -25 to 0.

        // Draw Insert (Diamond shape)
        ctx.fillStyle = insertColor;
        ctx.beginPath();
        ctx.moveTo(0, 0); 
        ctx.lineTo(5, -8); 
        ctx.lineTo(15, -8); 
        ctx.lineTo(10, 0);
        ctx.fill();

        // Seat/Clamp
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(12, -8, 3, 0, Math.PI*2); ctx.fill();
    }
    
    // Tool Label
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; 
    ctx.font = 'bold 10px monospace';
    ctx.fillText(activeToolConfig.name.split(' - ')[0], 55, -45);
    
    ctx.restore();

    // --- Draw Axis Gizmo (Bottom Left) ---
    const gizmoSize = 40;
    const gizmoX = 40;
    const gizmoY = height - 40;
    
    ctx.lineWidth = 2;
    ctx.font = 'bold 12px monospace';

    // Z Axis (Blue - Horizontal)
    ctx.beginPath(); ctx.strokeStyle = '#0066ff';
    ctx.moveTo(gizmoX, gizmoY); ctx.lineTo(gizmoX + gizmoSize, gizmoY); ctx.stroke();
    ctx.fillStyle = '#0066ff'; ctx.fillText('Z', gizmoX + gizmoSize + 5, gizmoY + 4);

    // X Axis (Red - Vertical)
    ctx.beginPath(); ctx.strokeStyle = '#ff3333';
    ctx.moveTo(gizmoX, gizmoY); ctx.lineTo(gizmoX, gizmoY - gizmoSize); ctx.stroke();
    ctx.fillStyle = '#ff3333'; ctx.fillText('X', gizmoX - 3, gizmoY - gizmoSize - 8);

    // Y Axis (Green - Diagonal/Depth)
    ctx.beginPath(); ctx.strokeStyle = '#33cc33';
    ctx.moveTo(gizmoX, gizmoY); ctx.lineTo(gizmoX - 20, gizmoY + 20); ctx.stroke();
    ctx.fillStyle = '#33cc33'; ctx.fillText('Y', gizmoX - 28, gizmoY + 25);
    
    // Origin dot
    ctx.beginPath(); ctx.fillStyle = '#fff'; ctx.arc(gizmoX, gizmoY, 3, 0, Math.PI*2); ctx.fill();

    // --- Spindle Status Indicator (Top Left) ---
    ctx.save();
    
    let statusText = 'SPINDLE STOP';
    let statusColor = '#ef4444'; // Red

    if (simState.spindleDirection === 'CW') {
        statusText = 'SPINDLE CW';
        statusColor = '#22c55e'; // Green
    } else if (simState.spindleDirection === 'CCW') {
        statusText = 'SPINDLE CCW';
        statusColor = '#eab308'; // Yellow
    }

    const indicatorX = 10;
    const indicatorY = 10;
    const indicatorW = 120;
    const indicatorH = 26;

    // Box Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(indicatorX, indicatorY, indicatorW, indicatorH);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#333';
    ctx.strokeRect(indicatorX, indicatorY, indicatorW, indicatorH);

    // Status Dot
    ctx.beginPath();
    ctx.arc(indicatorX + 15, indicatorY + 13, 4, 0, Math.PI * 2);
    ctx.fillStyle = statusColor;
    ctx.fill();
    // Glow
    if (simState.spindleDirection !== 'STOP') {
        ctx.shadowColor = statusColor;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // Text
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(statusText, indicatorX + 28, indicatorY + 17);

    ctx.restore();

    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [simState, feedOverride]);

  return (
    <div className="relative w-full h-full bg-cnc-950 rounded-lg overflow-hidden border border-cnc-700 shadow-2xl crt-screen">
        <canvas 
            ref={canvasRef} 
            width={800} 
            height={400} 
            className="w-full h-full object-cover"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        />
        <div className="crt-scanline"></div>
        
        {/* Tool Tip */}
        {tooltip && (
            <div 
                style={{ top: tooltip.y + 15, left: tooltip.x + 15 }} 
                className="absolute bg-zinc-900/95 border border-cnc-accent p-3 rounded shadow-2xl z-50 pointer-events-none text-xs backdrop-blur min-w-[150px]"
            >
                <div className="font-bold text-cnc-accent text-sm mb-2 border-b border-zinc-700 pb-1">{tooltip.tool.name}</div>
                <div className="text-zinc-400">
                    <div>Holder: <span className="text-white">{tooltip.tool.holderType}</span></div>
                    <div>Mat: <span className="text-white">{tooltip.tool.holderMaterial}</span></div>
                </div>
            </div>
        )}
    </div>
  );
};