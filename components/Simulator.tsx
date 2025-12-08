import React, { useEffect, useRef, useState } from 'react';
import { GCodeCommand, SimulationState, MachineState } from '../types';
import { TOOLS } from '../constants';

interface SimulatorProps {
  commands: GCodeCommand[];
  machineState: MachineState;
  currentLine: number;
}

const STOCK_DIAMETER = 80; // mm
const STOCK_LENGTH = 150; // mm
const ORIGIN_X_OFFSET = 50; // Canvas pixels from right
const SCALE = 3; // Pixels per mm

export const Simulator: React.FC<SimulatorProps> = ({ commands, machineState, currentLine }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [simState, setSimState] = useState<SimulationState>({
    x: 100, // Safe position
    z: 50,  // Safe position
    feedRate: 0,
    spindleSpeed: 0,
    spindleDirection: 'STOP',
    tool: 1,
    activeToolOffset: 0,
    toolRadiusComp: 'OFF',
    coolant: false,
    path: []
  });

  // Simulator Engine Loop
  useEffect(() => {
    if (machineState === MachineState.IDLE) {
        // Reset state
        setSimState({
            x: 100, 
            z: 50, 
            feedRate: 0, 
            spindleSpeed: 0, 
            spindleDirection: 'STOP',
            tool: 1, 
            activeToolOffset: 0,
            toolRadiusComp: 'OFF',
            coolant: false, 
            path: []
        });
        return;
    }

    if (!commands || commands.length === 0) return;

    // Process commands up to currentLine to build the path
    // This is a simplified "instant" simulator. A real one would animate over time.
    let tempX = 100;
    let tempZ = 50;
    let tempS = 0;
    let tempSpindleDir: 'CW' | 'CCW' | 'STOP' = 'STOP';
    let tempOffset = 0;
    let tempRadiusComp: 'OFF' | 'LEFT' | 'RIGHT' = 'OFF';
    const newPath: { x: number; z: number; type: 'cut' | 'rapid' }[] = [];

    // Simple Interpreter
    for (let i = 0; i < currentLine && i < commands.length; i++) {
        const cmd = commands[i];
        
        // Update Coordinates
        if (cmd.params.X !== undefined) tempX = cmd.params.X;
        if (cmd.params.U !== undefined) tempX += cmd.params.U; // Incremental X
        
        if (cmd.params.Z !== undefined) tempZ = cmd.params.Z;
        if (cmd.params.W !== undefined) tempZ += cmd.params.W; // Incremental Z

        // Update Spindle Speed Parameter (can be set by G97/G96 or M03 line)
        if (cmd.params.S !== undefined) tempS = cmd.params.S;

        // Tool Length Compensation (G43/G44/G49) & Radius Comp (G40/G41/G42)
        if (cmd.type === 'G') {
            // Length Comp
            if (cmd.code === 43 && cmd.params.H !== undefined) {
                const tool = TOOLS.find(t => t.id === cmd.params.H);
                if (tool) tempOffset = tool.lengthOffset;
            } else if (cmd.code === 44 && cmd.params.H !== undefined) {
                const tool = TOOLS.find(t => t.id === cmd.params.H);
                if (tool) tempOffset = -tool.lengthOffset;
            } else if (cmd.code === 49) {
                tempOffset = 0;
            }

            // Radius Comp
            if (cmd.code === 40) tempRadiusComp = 'OFF';
            else if (cmd.code === 41) tempRadiusComp = 'LEFT';
            else if (cmd.code === 42) tempRadiusComp = 'RIGHT';
        }

        // M Codes (Spindle)
        if (cmd.type === 'M') {
            if (cmd.code === 3) {
                tempSpindleDir = 'CW';
            } else if (cmd.code === 4) {
                tempSpindleDir = 'CCW';
            } else if (cmd.code === 5) {
                tempSpindleDir = 'STOP';
            }
        }

        // Determine movement type
        let type: 'cut' | 'rapid' = 'rapid';
        if (cmd.type === 'G' && (cmd.code === 1 || cmd.code === 2 || cmd.code === 3 || cmd.code === 71)) {
            type = 'cut';
        }

        if (cmd.type === 'G' && (cmd.code === 0 || cmd.code === 1 || cmd.code === 2 || cmd.code === 3)) {
             newPath.push({ x: tempX, z: tempZ, type });
        }
    }

    setSimState(prev => ({ 
        ...prev, 
        x: tempX, 
        z: tempZ, 
        spindleSpeed: tempS, 
        spindleDirection: tempSpindleDir,
        activeToolOffset: tempOffset,
        toolRadiusComp: tempRadiusComp,
        path: newPath 
    }));

  }, [commands, currentLine, machineState]);

  // Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width - ORIGIN_X_OFFSET - (STOCK_LENGTH * SCALE);
    const centerY = height / 2;

    // Clear Screen
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);

    // Draw Grid
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i=0; i<width; i+=20) { ctx.moveTo(i,0); ctx.lineTo(i, height); }
    for(let i=0; i<height; i+=20) { ctx.moveTo(0,i); ctx.lineTo(width, i); }
    ctx.stroke();

    // Draw Coordinate Axis (Z and X)
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Z Axis (Horizontal)
    ctx.moveTo(0, centerY); ctx.lineTo(width, centerY);
    // X Axis (Vertical, at Z=0)
    const zZeroPixel = width - ORIGIN_X_OFFSET;
    ctx.moveTo(zZeroPixel, 0); ctx.lineTo(zZeroPixel, height);
    ctx.stroke();

    // Draw Stock Material
    // Stock is anchored at Z=0 (right side) and goes left
    ctx.fillStyle = simState.spindleDirection === 'STOP' ? '#333' : '#3a3a3a';
    
    const stockPixelLen = STOCK_LENGTH * SCALE;
    const stockPixelDia = STOCK_DIAMETER * SCALE;
    // Upper half
    ctx.fillRect(zZeroPixel - stockPixelLen, centerY - (stockPixelDia/2), stockPixelLen, stockPixelDia/2);
    // Lower half
    ctx.fillRect(zZeroPixel - stockPixelLen, centerY, stockPixelLen, stockPixelDia/2);
    
    // Simple motion blur lines if spinning
    if (simState.spindleDirection !== 'STOP') {
        ctx.fillStyle = '#444';
        for(let i=0; i<5; i++) {
             const y = centerY - (stockPixelDia/2) + Math.random() * stockPixelDia;
             ctx.fillRect(zZeroPixel - stockPixelLen, y, stockPixelLen, 1);
        }
    }

    // Render Path (The "Cut")
    // Note: Lathe coordinates: X is Diameter. So distance from center is X/2.
    if (simState.path.length > 0) {
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        
        // Draw Rapid moves
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)'; // Cyan faint
        ctx.setLineDash([5, 5]);
        let lastX = 100; 
        let lastZ = 50;

        simState.path.forEach(p => {
            if (p.type === 'rapid') {
                // Convert CNC coords to Canvas Coords
                // Z+ is Right. X+ is Up (Diameter).
                const cx = zZeroPixel + (p.z * SCALE); // Z is usually negative into part
                const cy = centerY - ((p.x / 2) * SCALE); // X is Diameter, convert to Radius
                
                // Move from last pos
                const lx = zZeroPixel + (lastZ * SCALE);
                const ly = centerY - ((lastX / 2) * SCALE);
                
                ctx.moveTo(lx, ly);
                ctx.lineTo(cx, cy);
            }
            lastX = p.x;
            lastZ = p.z;
        });
        ctx.stroke();

        // Draw Cuts
        ctx.beginPath();
        ctx.strokeStyle = '#ff9900'; // Bright Orange
        ctx.setLineDash([]);
        lastX = 100; 
        lastZ = 50;
        
        simState.path.forEach(p => {
             // Convert CNC coords to Canvas Coords
            const cx = zZeroPixel + (p.z * SCALE); 
            const cy = centerY - ((p.x / 2) * SCALE);
            const lx = zZeroPixel + (lastZ * SCALE);
            const ly = centerY - ((lastX / 2) * SCALE);

            if (p.type === 'cut') {
                ctx.moveTo(lx, ly);
                ctx.lineTo(cx, cy);
                // Mirror for bottom half of lathe view
                const cy_mirror = centerY + ((p.x / 2) * SCALE);
                const ly_mirror = centerY + ((lastX / 2) * SCALE);
                 ctx.moveTo(lx, ly_mirror);
                ctx.lineTo(cx, cy_mirror);
            }
            lastX = p.x;
            lastZ = p.z;
        });
        ctx.stroke();
    }

    // Draw Tool Head
    const toolZPixel = zZeroPixel + (simState.z * SCALE);
    const toolXPixel = centerY - ((simState.x / 2) * SCALE);
    
    ctx.fillStyle = '#0f0';
    ctx.beginPath();
    ctx.moveTo(toolZPixel, toolXPixel);
    ctx.lineTo(toolZPixel + 10, toolXPixel - 15);
    ctx.lineTo(toolZPixel - 10, toolXPixel - 15);
    ctx.fill();

    // Info Text overlay
    ctx.fillStyle = '#fff';
    ctx.font = '12px JetBrains Mono';
    ctx.fillText(`POS: X${simState.x.toFixed(3)} Z${simState.z.toFixed(3)}`, 10, 20);

  }, [simState]);

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden border border-cnc-700 shadow-xl">
        <canvas 
            ref={canvasRef} 
            width={800} 
            height={400} 
            className="w-full h-full object-cover"
        />
        <div className="absolute top-2 right-2 bg-black/50 text-cnc-accent text-xs p-2 rounded font-mono border border-cnc-700 w-48">
            <div className="font-bold border-b border-cnc-700 pb-1 mb-1">NAVIOR 5-AXIS SIM</div>
            <div className="flex justify-between">
                <span>MODE:</span> <span className="text-white">{machineState}</span>
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
            <div className={`text-right ${simState.toolRadiusComp !== 'OFF' ? 'text-blue-400' : 'text-gray-500'}`}>
                TRC: {simState.toolRadiusComp}
            </div>
        </div>
    </div>
  );
};