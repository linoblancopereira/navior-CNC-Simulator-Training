import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { GCodeCommand, SimulationState, MachineState, ToolConfig, MaterialType } from '../types';

interface SimulatorProps {
  commands: GCodeCommand[];
  machineState: MachineState;
  currentLine: number;
  feedOverride: number;
  stockMaterial: MaterialType;
  manualSpindle: {dir: 'CW' | 'CCW' | 'STOP', speed: number};
  tools: ToolConfig[];
  onError: (msg: string) => void;
  onStateChange?: (state: SimulationState) => void;
  onRequestPause?: () => void;
  onRequestResume?: () => void;
  onToolWear: (toolId: number, wear: number) => void;
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

export const Simulator: React.FC<SimulatorProps> = ({ 
  commands, 
  machineState, 
  currentLine, 
  feedOverride, 
  stockMaterial,
  manualSpindle,
  tools,
  onError, 
  onStateChange,
  onRequestPause,
  onRequestResume,
  onToolWear
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);
  const [tooltip, setTooltip] = useState<{x: number, y: number, tool: ToolConfig} | null>(null);
  
  // Animation Physics Refs
  const lastTimeRef = useRef<number>(0);
  const rotationRef = useRef<number>(0);
  
  // Tool Change Prompt State
  const [pendingToolChange, setPendingToolChange] = useState<GCodeCommand | null>(null);
  const lastHandledToolLine = useRef<number>(-1);

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
    coolant: 'OFF',
    path: []
  });

  // Previous position ref to detect movement for sparks and wear calculation
  const prevPosRef = useRef({ x: 100, z: 50 });
  const accumWearRef = useRef<number>(0);

  // Handle Reset / Rewind logic for Tool Change tracking
  useEffect(() => {
    if (machineState === MachineState.IDLE || currentLine < lastHandledToolLine.current) {
        setPendingToolChange(null);
        lastHandledToolLine.current = -1;
    }
  }, [machineState, currentLine]);

  // 1. Interpreter Engine
  useEffect(() => {
    if (machineState === MachineState.ALARM) return;

    if (machineState === MachineState.IDLE) {
        // In IDLE mode, reflect manual controls passed via props
        const idleState: SimulationState = {
            x: 100, z: 50, feedRate: 0, 
            spindleSpeed: manualSpindle.dir !== 'STOP' ? manualSpindle.speed : 0, 
            spindleDirection: manualSpindle.dir,
            tool: 1, activeToolOffset: 0, toolRadiusComp: 'OFF', positioningMode: 'ABS', coolant: 'OFF', path: []
        };
        setSimState(idleState);
        if (onStateChange) onStateChange(idleState);
        prevPosRef.current = { x: 100, z: 50 };
        return;
    }

    if (!commands || commands.length === 0) return;

    // Check for Tool Change Request at current line
    const activeCmd = commands[currentLine];
    if (activeCmd && activeCmd.type === 'T' && machineState === MachineState.RUNNING) {
        // Only trigger if we haven't handled this line yet
        if (lastHandledToolLine.current !== currentLine) {
            if (onRequestPause) onRequestPause();
            setPendingToolChange(activeCmd);
            lastHandledToolLine.current = currentLine;
        }
    }

    // Handle M100 - Reset Wear Command
    if (activeCmd && activeCmd.type === 'M' && activeCmd.code === 100 && machineState === MachineState.RUNNING) {
        // We do this check to avoid repeated calls in the loop
        onToolWear(simState.tool, 0);
    }

    let tempX = 100;
    let tempZ = 50;
    let tempS = 0;
    let tempTool = 1;
    let tempSpindleDir: 'CW' | 'CCW' | 'STOP' = 'STOP';
    let tempOffset = 0;
    let tempRadiusComp: 'OFF' | 'LEFT' | 'RIGHT' = 'OFF';
    let tempPositioning: 'ABS' | 'INC' = 'ABS';
    let tempCoolant: 'OFF' | 'MIST' | 'FLOOD' = 'OFF';
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
                const tool = tools.find(t => t.id === cmd.params.H);
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
            else if (cmd.code === 7) tempCoolant = 'MIST';
            else if (cmd.code === 8) tempCoolant = 'FLOOD';
            else if (cmd.code === 9) tempCoolant = 'OFF';
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
        path: newPath, tool: tempTool, feedRate: 0, coolant: tempCoolant
    };

    setSimState(newState);
    if (onStateChange) onStateChange(newState);

  }, [commands, currentLine, machineState, onError, onStateChange, onRequestPause, manualSpindle, tools]); // Added tools dependency

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
        const tool = tools.find(t => t.id === simState.tool) || tools[0];
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

    // Delta Time Calculation for Smooth Animation
    if (lastTimeRef.current === 0) lastTimeRef.current = time;
    const deltaTime = (time - lastTimeRef.current) / 1000; // seconds
    lastTimeRef.current = time;

    const width = canvas.width;
    const height = canvas.height;
    const zZeroPixel = width - ORIGIN_X_OFFSET;
    const centerY = height / 2;
    const stockPixelLen = STOCK_LENGTH * SCALE;
    const stockPixelDia = STOCK_DIAMETER * SCALE;
    const chuckX = zZeroPixel - stockPixelLen;

    // --- Particle Logic (Sparks/Chips) & WEAR LOGIC ---
    const isCutting = simState.spindleDirection !== 'STOP' && 
                      simState.path.length > 0 && 
                      simState.path[simState.path.length - 1].type === 'cut';
    
    const dx = simState.x - prevPosRef.current.x;
    const dz = simState.z - prevPosRef.current.z;
    const distTraveled = Math.sqrt(dx*dx + dz*dz);
    const isMoving = distTraveled > 0.001;

    // Material Hardness Factor (Base=Steel=1.0)
    let hardness = 1.0;
    if (stockMaterial === 'Aluminum') hardness = 0.5;
    else if (stockMaterial === 'Wood') hardness = 0.1;
    else if (stockMaterial === 'Epoxi') hardness = 0.2;
    else if (stockMaterial === 'POM') hardness = 0.2;
    else if (stockMaterial === 'Carbon Fiber') hardness = 1.5;

    if (isCutting && isMoving && simState.x <= STOCK_DIAMETER + 1) {
        let pColor1 = '#ffaa00';
        let pColor2 = '#ffff00';
        
        if (stockMaterial === 'Aluminum') {
            pColor1 = '#e2e8f0';
            pColor2 = '#ffffff';
        } else if (stockMaterial === 'Wood') {
            pColor1 = '#d97706';
            pColor2 = '#92400e';
        } else if (stockMaterial === 'Carbon Fiber') {
            pColor1 = '#111111';
            pColor2 = '#333333';
        } else if (stockMaterial === 'Epoxi') {
            pColor1 = '#fef08a'; // Yellow 200
            pColor2 = '#facc15'; // Yellow 400
        } else if (stockMaterial === 'POM') {
            pColor1 = '#f8fafc'; // White/Slate 50
            pColor2 = '#cbd5e1'; // Slate 300
        }

        for(let i=0; i<3; i++) {
            const toolZPixel = zZeroPixel + (simState.z * SCALE);
            const toolXPixel = centerY - ((simState.x / 2) * SCALE);
            particlesRef.current.push({
                x: toolZPixel,
                y: toolXPixel,
                vx: (Math.random() - 0.2) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 1.0,
                color: Math.random() > 0.5 ? pColor1 : pColor2
            });
        }

        // --- Wear Calculation ---
        // Wear accumulates based on distance traveled * hardness
        // We limit update frequency to avoid React render spam
        // Wear rate: arbitrary value to make it visible in demo
        const currentTool = tools.find(t => t.id === simState.tool);
        if (currentTool && currentTool.wear < 100) {
            const wearRate = 0.2; // % per mm traveled (high for demo purposes)
            const increment = distTraveled * hardness * wearRate;
            accumWearRef.current += increment;

            // Only update parent state if significant change to avoid jitter
            if (accumWearRef.current > 0.5) {
                onToolWear(simState.tool, currentTool.wear + accumWearRef.current);
                accumWearRef.current = 0;
            }
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

    // --- Chuck (Mandril) Rendering ---
    const effectiveSpindleSpeed = simState.spindleSpeed * (feedOverride / 100); 
    const speedRadPerSec = (effectiveSpindleSpeed / 60) * 2 * Math.PI;

    if (simState.spindleDirection === 'CW') {
        rotationRef.current += speedRadPerSec * deltaTime;
    } else if (simState.spindleDirection === 'CCW') {
        rotationRef.current -= speedRadPerSec * deltaTime;
    }

    const chuckBodyDia = 160; // Pixels
    const chuckXPosition = chuckX - 10; // Slightly left of stock start

    ctx.save();
    ctx.translate(chuckXPosition, centerY);
    
    // Draw Chuck Body (Side View - Static/Rotating Cylinder)
    const bodyGrad = ctx.createLinearGradient(0, -chuckBodyDia/2, 0, chuckBodyDia/2);
    bodyGrad.addColorStop(0, '#27272a'); 
    bodyGrad.addColorStop(0.3, '#52525b'); 
    bodyGrad.addColorStop(0.5, '#71717a'); 
    bodyGrad.addColorStop(0.7, '#52525b');
    bodyGrad.addColorStop(1, '#27272a');
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(-60, -chuckBodyDia/2, 60, chuckBodyDia); // Main body
    
    // Chuck Backplate
    ctx.fillStyle = '#18181b';
    ctx.fillRect(-70, -(chuckBodyDia/2) + 10, 10, chuckBodyDia - 20);

    // Draw Rotating Face Elements
    ctx.beginPath();
    ctx.rect(-10, -chuckBodyDia/2, 40, chuckBodyDia);
    ctx.clip();

    const jawHeight = 25;
    const jawWidth = 30;
    
    // Draw 3 Jaws
    for(let j=0; j<3; j++) {
        const angleOffset = (Math.PI * 2 / 3) * j;
        const currentAngle = rotationRef.current + angleOffset;
        
        const radius = chuckBodyDia / 3.5;
        const jawY = Math.sin(currentAngle) * radius;
        const jawZ = Math.cos(currentAngle); 

        const isFront = jawZ > 0;
        const jawColor = isFront ? '#d4d4d8' : '#52525b'; 
        
        ctx.fillStyle = jawColor;
        ctx.strokeStyle = '#18181b';
        ctx.lineWidth = 1;

        ctx.fillRect(-5, jawY - (jawHeight/2), jawWidth, jawHeight);
        ctx.strokeRect(-5, jawY - (jawHeight/2), jawWidth, jawHeight);
        
        ctx.fillStyle = isFront ? '#a1a1aa' : '#3f3f46';
        ctx.fillRect(10, jawY - (jawHeight/2) + 5, 10, jawHeight - 10);
    }
    
    ctx.restore();


    // --- Stock (Dynamic Material) ---
    const stockGradient = ctx.createLinearGradient(0, centerY - (stockPixelDia/2), 0, centerY + (stockPixelDia/2));
    
    if (stockMaterial === 'Wood') {
        if (simState.spindleDirection === 'STOP') {
            stockGradient.addColorStop(0, '#3f2c22'); 
            stockGradient.addColorStop(0.4, '#8d5a36'); 
            stockGradient.addColorStop(0.6, '#a67c52'); 
            stockGradient.addColorStop(1, '#3f2c22');
        } else {
             stockGradient.addColorStop(0, '#5c3a2e');
             stockGradient.addColorStop(0.5, '#d4a373');
             stockGradient.addColorStop(1, '#5c3a2e');
        }
    } else if (stockMaterial === 'Aluminum') {
         if (simState.spindleDirection === 'STOP') {
            stockGradient.addColorStop(0, '#718096');
            stockGradient.addColorStop(0.3, '#e2e8f0');
            stockGradient.addColorStop(0.5, '#edf2f7'); 
            stockGradient.addColorStop(0.7, '#e2e8f0');
            stockGradient.addColorStop(1, '#718096');
         } else {
            stockGradient.addColorStop(0, '#a0aec0');
            stockGradient.addColorStop(0.5, '#ffffff'); 
            stockGradient.addColorStop(1, '#a0aec0');
         }
    } else if (stockMaterial === 'Carbon Fiber') {
        if (simState.spindleDirection === 'STOP') {
            stockGradient.addColorStop(0, '#0a0a0a');
            stockGradient.addColorStop(0.3, '#1f1f1f');
            stockGradient.addColorStop(0.5, '#2e2e2e');
            stockGradient.addColorStop(0.7, '#1f1f1f');
            stockGradient.addColorStop(1, '#0a0a0a');
        } else {
            stockGradient.addColorStop(0, '#111');
            stockGradient.addColorStop(0.5, '#333');
            stockGradient.addColorStop(1, '#111');
        }
    } else if (stockMaterial === 'Epoxi') {
        if (simState.spindleDirection === 'STOP') {
            stockGradient.addColorStop(0, '#854d0e'); 
            stockGradient.addColorStop(0.3, '#eab308'); 
            stockGradient.addColorStop(0.5, '#fef08a'); 
            stockGradient.addColorStop(0.7, '#eab308'); 
            stockGradient.addColorStop(1, '#854d0e');
        } else {
            stockGradient.addColorStop(0, '#ca8a04');
            stockGradient.addColorStop(0.5, '#fef9c3'); 
            stockGradient.addColorStop(1, '#ca8a04');
        }
    } else if (stockMaterial === 'POM') {
        if (simState.spindleDirection === 'STOP') {
            stockGradient.addColorStop(0, '#94a3b8'); 
            stockGradient.addColorStop(0.2, '#e2e8f0'); 
            stockGradient.addColorStop(0.5, '#f8fafc'); 
            stockGradient.addColorStop(0.8, '#e2e8f0'); 
            stockGradient.addColorStop(1, '#94a3b8');
        } else {
            stockGradient.addColorStop(0, '#cbd5e1');
            stockGradient.addColorStop(0.5, '#ffffff');
            stockGradient.addColorStop(1, '#cbd5e1');
        }
    } else {
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
    }

    ctx.fillStyle = stockGradient;
    ctx.fillRect(chuckX, centerY - (stockPixelDia/2), stockPixelLen, stockPixelDia/2);
    ctx.fillRect(chuckX, centerY, stockPixelLen, stockPixelDia/2);

    // Carbon Fiber Weave Texture
    if (stockMaterial === 'Carbon Fiber' && simState.spindleDirection === 'STOP') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        for(let i=chuckX; i < chuckX + stockPixelLen; i+=6) {
             for(let j=centerY - stockPixelDia/2; j < centerY + stockPixelDia/2; j+=6) {
                 if ((i+j)%12 === 0) ctx.fillRect(i, j, 3, 3);
             }
        }
    }
    
    // Material End Cap
    const endX = chuckX + stockPixelLen;
    let endColor = '#718096';
    if(stockMaterial === 'Aluminum') endColor = '#cbd5e0';
    if(stockMaterial === 'Wood') endColor = '#8d5a36';
    if(stockMaterial === 'Carbon Fiber') endColor = '#1a1a1a';
    if(stockMaterial === 'Epoxi') endColor = '#eab308';
    if(stockMaterial === 'POM') endColor = '#f1f5f9';

    ctx.fillStyle = endColor;
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
    const activeToolConfig = tools.find(t => t.id === simState.tool) || tools[0];
    
    ctx.save();
    ctx.translate(toolZPixel, toolXPixel);
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;

    // --- Tool Holder Colors based on type ---
    let holderColorStart = '#333';
    let holderColorMid = '#444';
    let holderColorEnd = '#222';

    if (activeToolConfig.type === 'grooving') {
        holderColorStart = '#172554'; // blue-950
        holderColorMid = '#1e3a8a';   // blue-900
        holderColorEnd = '#172554';
    } else if (activeToolConfig.type === 'threading') {
        holderColorStart = '#450a0a'; // red-950
        holderColorMid = '#7f1d1d';   // red-900
        holderColorEnd = '#450a0a';
    } else {
        holderColorStart = '#27272a'; // zinc-800
        holderColorMid = '#3f3f46';   // zinc-700
        holderColorEnd = '#27272a';
    }
    
    const createHolderGradient = (y1: number, y2: number) => {
        const grad = ctx.createLinearGradient(0, y1, 0, y2);
        grad.addColorStop(0, holderColorStart);
        grad.addColorStop(0.5, holderColorMid);
        grad.addColorStop(1, holderColorEnd);
        return grad;
    };

    let insertColor = activeToolConfig.color;
    
    // --- Wear Effect on Color ---
    // Shift color towards red/dark based on wear %
    if (activeToolConfig.wear > 0) {
        // Simple visualization: Overlay a red tint or change hex
        // Since manipulating Hex in canvas is annoying, let's just use the wear state to decide drawing logic below
    }

    // 1. Draw Turret Block
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(50, -60, 80, 100); 
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
    ctx.strokeRect(50, -60, 80, 100);
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(65, -40, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(65, 30, 3, 0, Math.PI*2); ctx.fill();

    // 2. Specific Tool Holders
    // WEAR VISUALIZATION: Modify tool tip shape based on wear
    // 100% wear = 2.0 scale increase in radius and redness
    const wearFactor = activeToolConfig.wear / 100;
    const wearRadiusMod = wearFactor * 3; // up to +3px radius

    if (activeToolConfig.type === 'grooving') {
        const width = 4 * SCALE;
        const insertW = activeToolConfig.width * SCALE;
        const length = 45;

        // Block
        ctx.fillStyle = createHolderGradient(-35, 25);
        ctx.fillRect(20, -35, 50, 60);

        // Blade
        ctx.fillStyle = holderColorStart;
        ctx.beginPath();
        ctx.moveTo(5, -insertW);
        ctx.lineTo(5, -length);
        ctx.lineTo(20, -length);
        ctx.lineTo(20, -insertW);
        ctx.fill();

        // Insert
        ctx.fillStyle = activeToolConfig.wear > 50 ? '#b91c1c' : insertColor; // Red if worn
        
        // Draw worn insert (rounded corners)
        if (activeToolConfig.wear > 10) {
             ctx.beginPath();
             ctx.roundRect(0, -insertW, insertW, insertW, wearRadiusMod);
             ctx.fill();
        } else {
             ctx.fillRect(0, -insertW, insertW, insertW); 
        }
        
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
        ctx.fillStyle = activeToolConfig.wear > 50 ? '#b91c1c' : insertColor;
        ctx.beginPath();
        // Worn tip is blunt
        ctx.moveTo(0 + wearRadiusMod, 0); 
        ctx.lineTo(5, -3);
        ctx.lineTo(5, 0);
        ctx.closePath();
        ctx.fill();

        // Clamp
        ctx.fillStyle = '#000';
        ctx.fillRect(5, -shankH + 4, 4, 4);

    } else {
        // General Turning
        // Shank
        ctx.fillStyle = createHolderGradient(-25, 0);
        ctx.fillRect(10, -25, 100, 25); 

        // Draw Insert (Diamond shape)
        ctx.fillStyle = activeToolConfig.wear > 50 ? '#b91c1c' : insertColor;
        ctx.beginPath();
        // Modify tip coordinate based on wear to simulate dulling
        ctx.moveTo(0 + wearRadiusMod, 0); 
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

    // --- Coolant Visual Effects ---
    if (simState.coolant === 'FLOOD') {
        // Draw blue streams (heavy flow)
        ctx.fillStyle = 'rgba(0, 100, 255, 0.15)';
        ctx.fillRect(0, 0, width, height);
        
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.4)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        const offset = (time / 5) % 40;
        for(let k= -40; k<width; k+=30) {
             // Angle the stream slightly
             ctx.moveTo(k + offset, 0); 
             ctx.lineTo(k - 20 + offset, height);
        }
        ctx.stroke();
    } else if (simState.coolant === 'MIST') {
        // Draw mist (random white/cyan particles)
        ctx.fillStyle = 'rgba(200, 240, 255, 0.05)';
        ctx.fillRect(0, 0, width, height);
        
        // Random mist particles
        ctx.fillStyle = 'rgba(220, 255, 255, 0.4)';
        for(let i=0; i<30; i++) {
            const mx = Math.random() * width;
            const my = Math.random() * height;
            const r = Math.random() * 2;
            ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI*2); ctx.fill();
        }
    }

    // --- Active Command Display (Bottom Center) ---
    const activeCmd = commands[currentLine];
    if (activeCmd) {
        ctx.save();
        const cmdText = activeCmd.raw.trim();
        ctx.font = 'bold 14px "Share Tech Mono", monospace';
        const tm = ctx.measureText(cmdText);
        const pad = 16;
        const bgW = tm.width + pad * 2;
        const bgH = 30;
        const bgX = (width / 2) - (bgW / 2);
        const bgY = height - 60; // Just above bottom edge

        // Glassy/CRT background
        ctx.fillStyle = 'rgba(0, 10, 0, 0.85)';
        ctx.fillRect(bgX, bgY, bgW, bgH);
        
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 1;
        ctx.strokeRect(bgX, bgY, bgW, bgH);

        // Text
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#00ff00';
        ctx.shadowColor = 'rgba(0, 255, 0, 0.5)';
        ctx.shadowBlur = 4;
        ctx.fillText(cmdText, width / 2, bgY + (bgH/2) + 1);
        ctx.restore();
    }

    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [simState, feedOverride, stockMaterial, tools]); // Added tools dep to re-render when tools change

  const handleConfirmTool = () => {
    setPendingToolChange(null);
    if (onRequestResume) onRequestResume();
  };

  const getToolInfo = (cmd: GCodeCommand) => {
    if (!cmd.code) return null;
    const toolIdStr = cmd.code.toString();
    let id = parseInt(toolIdStr);
    if (toolIdStr.length >= 2) id = parseInt(toolIdStr.substring(0, 2));
    return tools.find(t => t.id === id);
  };

  return (
    <div className="relative w-full h-full bg-cnc-950 rounded-lg overflow-hidden border border-cnc-700 shadow-2xl crt-screen group">
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
                <div className="text-zinc-400 space-y-1">
                    <div className="flex justify-between">
                        <span>Holder Mat:</span>
                        <span className="text-white font-mono">{tooltip.tool.holderMaterial}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Workpiece:</span>
                        <span className="text-white font-mono">{stockMaterial}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Insert Type:</span>
                        <span className="text-white font-mono">{tooltip.tool.holderType}</span>
                    </div>
                     <div className="flex justify-between">
                        <span>Tool Wear:</span>
                        <span className={`${tooltip.tool.wear > 50 ? 'text-red-500' : 'text-green-500'} font-mono`}>{tooltip.tool.wear.toFixed(1)}%</span>
                    </div>
                </div>
            </div>
        )}

        {/* Tool Change Prompt Overlay */}
        {pendingToolChange && (
            <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-zinc-900 border-2 border-yellow-500 p-8 rounded shadow-2xl max-w-md w-full text-center relative animate-pulse-fast">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-yellow-500 shadow-[0_0_10px_#eab308]"></div>
                    <AlertTriangle className="mx-auto text-yellow-500 mb-4 h-12 w-12" />
                    <h3 className="text-xl font-bold text-yellow-500 tracking-widest mb-1">MANUAL ACTION REQUIRED</h3>
                    <p className="text-zinc-400 text-sm mb-6 uppercase tracking-wide">Please confirm tool change to proceed</p>
                    
                    <div className="bg-black border border-zinc-800 p-4 mb-6 rounded text-left">
                        <div className="text-xs text-zinc-500 font-mono mb-1">REQUESTED TOOL</div>
                        <div className="text-2xl font-bold text-white font-mono flex justify-between items-end">
                            <span>T{pendingToolChange.code}</span>
                            <span className="text-sm text-cnc-accent mb-1">{getToolInfo(pendingToolChange)?.name.split('-')[1].trim()}</span>
                        </div>
                    </div>

                    <button 
                        onClick={handleConfirmTool}
                        className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-3 px-6 rounded transition-all flex items-center justify-center gap-2"
                    >
                        <CheckCircle2 size={20} />
                        CONFIRM & RESUME
                    </button>
                </div>
            </div>
        )}
    </div>
  );
};