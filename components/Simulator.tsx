import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Video, Monitor, Box, Circle, RotateCw, RotateCcw, Octagon, Sliders, Sparkles } from 'lucide-react';
import { GCodeCommand, SimulationState, MachineState, ToolConfig, MaterialType } from '../types';

interface SimulatorProps {
  commands: GCodeCommand[];
  machineState: MachineState;
  currentLine: number;
  feedOverride: number;
  stockMaterial: MaterialType;
  manualSpindle: {dir: 'CW' | 'CCW' | 'STOP', speed: number};
  tools: ToolConfig[];
  showPaths: boolean; 
  showTrace: boolean;
  homePosition: { x: number; z: number };
  onError: (msg: string) => void;
  onStateChange?: (state: SimulationState) => void;
  onRequestPause?: () => void;
  onRequestResume?: () => void;
  onToolWear: (toolId: number, wear: number) => void;
}

interface Particle {
  rx: number; // Relative X position (pixels) from Z-Zero
  y: number;  // Absolute Y position (pixels)
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const STOCK_DIAMETER = 100; // Increased to 100mm as requested
const STOCK_LENGTH = 150; // mm
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
  showPaths,
  showTrace,
  homePosition,
  onError, 
  onStateChange,
  onRequestPause,
  onRequestResume,
  onToolWear
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const [tooltip, setTooltip] = useState<{x: number, y: number, tool: ToolConfig} | null>(null);
  
  // Camera State
  const [viewMode, setViewMode] = useState<'SIDE' | 'FRONT' | 'ISO'>('SIDE');
  const [originOffset, setOriginOffset] = useState(50); // Canvas pixels from right for Z=0
  
  // Particle Configuration State
  const [showSettings, setShowSettings] = useState(false);
  const [particleConfig, setParticleConfig] = useState({
    density: 3,   // Particles per frame
    size: 1.5,    // Radius in pixels
    lifespan: 1.0 // Multiplier (1.0 = normal decay)
  });
  
  // Animation Physics Refs
  const lastTimeRef = useRef<number>(0);
  const rotationRef = useRef<number>(0);
  const toolScreenPosRef = useRef<{x: number, y: number} | null>(null);
  
  // Tool Change Prompt State
  const [pendingToolChange, setPendingToolChange] = useState<GCodeCommand | null>(null);
  const lastHandledToolLine = useRef<number>(-1);

  // State for the simulation
  const [simState, setSimState] = useState<SimulationState>({
    x: homePosition.x,
    z: homePosition.z,
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
  const prevPosRef = useRef({ x: homePosition.x, z: homePosition.z });
  const accumWearRef = useRef<number>(0);

  // Helper to get material color for tooltip
  const getMaterialColor = (mat: MaterialType) => {
    switch(mat) {
      case 'Aluminum': return '#e2e8f0';
      case 'Wood': return '#d97706';
      case 'Carbon Fiber': return '#111111';
      case 'Epoxi': return '#facc15';
      case 'POM': return '#f8fafc';
      case 'Steel': default: return '#718096';
    }
  };

  // Helper to translate material name
  const translateMaterial = (mat: MaterialType) => {
    switch(mat) {
        case 'Steel': return 'Acero';
        case 'Aluminum': return 'Aluminio';
        case 'Wood': return 'Madera';
        case 'Carbon Fiber': return 'Fibra Carbono';
        case 'Epoxi': return 'Epoxi';
        case 'POM': return 'POM';
        default: return mat;
    }
  };

  // Handle Reset / Rewind logic for Tool Change tracking
  useEffect(() => {
    if (machineState === MachineState.IDLE || currentLine < lastHandledToolLine.current) {
        setPendingToolChange(null);
        lastHandledToolLine.current = -1;
    }
  }, [machineState, currentLine]);

  // Handle F9 Center Shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'F9') {
            const canvas = canvasRef.current;
            if (canvas) {
                // Center the stock in the view
                const stockPixelLen = STOCK_LENGTH * SCALE;
                const newOffset = (canvas.width / 2) - (stockPixelLen / 2);
                setOriginOffset(newOffset);
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 1. Interpreter Engine
  useEffect(() => {
    if (machineState === MachineState.ALARM) return;

    if (machineState === MachineState.IDLE) {
        const idleState: SimulationState = {
            x: homePosition.x, z: homePosition.z, feedRate: 0, 
            spindleSpeed: manualSpindle.dir !== 'STOP' ? manualSpindle.speed : 0, 
            spindleDirection: manualSpindle.dir,
            tool: 1, activeToolOffset: 0, toolRadiusComp: 'OFF', positioningMode: 'ABS', coolant: 'OFF', path: []
        };
        setSimState(idleState);
        if (onStateChange) onStateChange(idleState);
        prevPosRef.current = { x: homePosition.x, z: homePosition.z };
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
        onToolWear(simState.tool, 0);
    }

    let tempX = homePosition.x;
    let tempZ = homePosition.z;
    let tempS = 0;
    let tempTool = 1;
    let tempSpindleDir: 'CW' | 'CCW' | 'STOP' = 'STOP';
    let tempOffset = 0;
    let tempRadiusComp: 'OFF' | 'LEFT' | 'RIGHT' = 'OFF';
    let tempPositioning: 'ABS' | 'INC' = 'ABS';
    let tempCoolant: 'OFF' | 'MIST' | 'FLOOD' = 'OFF';
    const newPath: { x: number; z: number; cx?: number; cz?: number; type: 'cut' | 'rapid' }[] = [];

    // Run interpreter
    for (let i = 0; i <= currentLine && i < commands.length; i++) {
        const cmd = commands[i];
        
        // Basic Validation
        if (cmd.type === 'G' && cmd.code !== undefined && !VALID_G_CODES.includes(cmd.code)) {
            onError(`Error Sintaxis: G${cmd.code} no soportado en línea ${cmd.line}`);
            return;
        }

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

        // --- LÓGICA DE G28 (HOME RETURN) ---
        if (cmd.type === 'G' && cmd.code === 28) {
             // 1. Primero registramos el movimiento al punto intermedio (si se especificó en la línea)
             newPath.push({ x: tempX, z: tempZ, cx: tempX, cz: tempZ, type: 'rapid' });
             
             // 2. Determinar qué ejes vuelven a Home (X/U para X, Z/W para Z)
             // En un torno Fanuc, si se especifica G28 U0, solo vuelve el eje X.
             const isSelective = (cmd.params.X !== undefined || cmd.params.U !== undefined || 
                                 cmd.params.Z !== undefined || cmd.params.W !== undefined);

             if (isSelective) {
                 if (cmd.params.X !== undefined || cmd.params.U !== undefined) tempX = homePosition.x;
                 if (cmd.params.Z !== undefined || cmd.params.W !== undefined) tempZ = homePosition.z;
             } else {
                 // Si no hay parámetros, ambos ejes vuelven a Home por defecto
                 tempX = homePosition.x;
                 tempZ = homePosition.z;
             }

             // 3. Registramos el movimiento final al Home
             newPath.push({ x: tempX, z: tempZ, cx: tempX, cz: tempZ, type: 'rapid' });
             continue; 
        }

        if (cmd.type === 'G' && [0,1,2,3,32,33].includes(cmd.code || -1)) {
             // Lógica de Compensación de Radio G41/G42
             let cx = tempX; 
             let cz = tempZ;

             if (tempRadiusComp !== 'OFF' && type === 'cut') {
                const activeTool = tools.find(t => t.id === tempTool);
                const noseR = activeTool ? activeTool.noseRadius : 0;
                
                if (noseR > 0) {
                    let prevX = homePosition.x;
                    let prevZ = homePosition.z;
                    if (newPath.length > 0) {
                        prevX = newPath[newPath.length - 1].x;
                        prevZ = newPath[newPath.length - 1].z;
                    }
                    
                    const dz = tempZ - prevZ;
                    const dx = (tempX - prevX) / 2;
                    const len = Math.sqrt(dz * dz + dx * dx);
                    
                    if (len > 0.001) {
                        const tx = dx / len;
                        const tz = dz / len;
                        let nx = 0; let nz = 0;

                        if (tempRadiusComp === 'RIGHT') { // G42
                            nz = -tx; nx = tz;
                        } else { // G41
                            nz = tx; nx = -tz;
                        }
                        
                        cz = tempZ + (nz * noseR);
                        cx = tempX + (nx * noseR * 2);
                    }
                }
             }

             newPath.push({ x: tempX, z: tempZ, cx, cz, type });
        }
    }

    const newState: SimulationState = { 
        x: tempX, z: tempZ, spindleSpeed: tempS, spindleDirection: tempSpindleDir,
        activeToolOffset: tempOffset, toolRadiusComp: tempRadiusComp, positioningMode: tempPositioning,
        path: newPath, tool: tempTool, feedRate: 0, coolant: tempCoolant
    };

    setSimState(newState);
    if (onStateChange) onStateChange(newState);

  }, [commands, currentLine, machineState, onError, onStateChange, onRequestPause, manualSpindle, tools, homePosition]);

  // Handle Tooltip
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if(!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    if (toolScreenPosRef.current) {
        const tx = toolScreenPosRef.current.x;
        const ty = toolScreenPosRef.current.y;
        const dist = Math.sqrt(Math.pow(mx - tx, 2) + Math.pow(my - ty, 2));
        if (dist < 50) {
            const tool = tools.find(t => t.id === simState.tool) || tools[0];
            setTooltip({ x: mx, y: my, tool });
            return;
        }
    }
    setTooltip(null);
  };
  const handleMouseLeave = () => setTooltip(null);

  // 2. Render & Physics Loop
  const animate = (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (lastTimeRef.current === 0) lastTimeRef.current = time;
    const deltaTime = (time - lastTimeRef.current) / 1000;
    lastTimeRef.current = time;

    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;
    
    ctx.fillStyle = '#0f1115';
    ctx.fillRect(0, 0, width, height);

    const dx = simState.x - prevPosRef.current.x;
    const dz = simState.z - prevPosRef.current.z;
    const distTraveled = Math.sqrt(dx*dx + dz*dz);
    const isMoving = distTraveled > 0.001;
    const isCutting = simState.spindleDirection !== 'STOP' && simState.path.length > 0 && simState.path[simState.path.length - 1].type === 'cut';

    if (isCutting && isMoving && simState.x <= STOCK_DIAMETER + 1) {
        let pColor1 = '#ffaa00'; let pColor2 = '#ffff00';
        if (stockMaterial === 'Aluminum') { pColor1 = '#e2e8f0'; pColor2 = '#ffffff'; } 
        else if (stockMaterial === 'Wood') { pColor1 = '#d97706'; pColor2 = '#92400e'; }
        else if (stockMaterial === 'Carbon Fiber') { pColor1 = '#111111'; pColor2 = '#333333'; }
        else if (stockMaterial === 'Epoxi') { pColor1 = '#fef08a'; pColor2 = '#facc15'; }
        else if (stockMaterial === 'POM') { pColor1 = '#f8fafc'; pColor2 = '#cbd5e1'; }

        for(let i=0; i<particleConfig.density; i++) {
            const rx = (simState.z * SCALE);
            const toolXPixel = centerY - ((simState.x / 2) * SCALE);
            particlesRef.current.push({
                rx: rx, y: toolXPixel, vx: (Math.random() - 0.2) * 4, vy: (Math.random() - 0.5) * 4,
                life: 1.0, color: Math.random() > 0.5 ? pColor1 : pColor2
            });
        }
        
        const currentTool = tools.find(t => t.id === simState.tool);
        let hardness = 1.0;
        if (stockMaterial === 'Aluminum') hardness = 0.5;
        if (stockMaterial === 'Carbon Fiber') hardness = 1.5;

        if (currentTool && currentTool.wear < 100) {
            const wearRate = 0.2; 
            const increment = distTraveled * hardness * wearRate;
            accumWearRef.current += increment;
            if (accumWearRef.current > 0.5) {
                onToolWear(simState.tool, currentTool.wear + accumWearRef.current);
                accumWearRef.current = 0;
            }
        }
    }
    prevPosRef.current = { x: simState.x, z: simState.z };

    particlesRef.current.forEach(p => {
        p.rx += p.vx; p.y += p.vy; p.vy += 0.1;
        p.life -= 0.05 / particleConfig.lifespan;
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
    
    const effectiveSpindleSpeed = simState.spindleSpeed * (feedOverride / 100); 
    const speedRadPerSec = (effectiveSpindleSpeed / 60) * 2 * Math.PI;
    if (simState.spindleDirection === 'CW') rotationRef.current += speedRadPerSec * deltaTime;
    else if (simState.spindleDirection === 'CCW') rotationRef.current -= speedRadPerSec * deltaTime;

    if (viewMode === 'FRONT') {
        renderFrontView(ctx, width, height, deltaTime);
    } else {
        ctx.save();
        if (viewMode === 'ISO') {
            ctx.translate(100, 50); ctx.transform(1, 0.15, -0.4, 0.9, 0, 0); 
        }
        renderSideView(ctx, width, height, deltaTime);
        ctx.restore();
    }

    renderOverlay(ctx, width, height);
    requestRef.current = requestAnimationFrame(animate);
  };

  const renderSideView = (ctx: CanvasRenderingContext2D, width: number, height: number, deltaTime: number) => {
    const zZeroPixel = width - originOffset;
    const centerY = height / 2;
    const stockPixelLen = STOCK_LENGTH * SCALE;
    const stockPixelDia = STOCK_DIAMETER * SCALE;
    const chuckX = zZeroPixel - stockPixelLen;

    ctx.strokeStyle = '#1a1f26'; ctx.lineWidth = 1; ctx.beginPath();
    for(let i=0; i<width; i+=40) { ctx.moveTo(i,0); ctx.lineTo(i, height); }
    for(let i=0; i<height; i+=40) { ctx.moveTo(0,i); ctx.lineTo(width, i); }
    ctx.stroke();

    ctx.strokeStyle = '#333'; ctx.setLineDash([20, 5, 5, 5]); ctx.beginPath();
    ctx.moveTo(0, centerY); ctx.lineTo(width, centerY); ctx.stroke(); ctx.setLineDash([]);

    // Chuck
    const chuckBodyDia = 90; const chuckXPosition = chuckX - 5;
    ctx.save(); ctx.translate(chuckXPosition, centerY);
    const bodyGrad = ctx.createLinearGradient(0, -chuckBodyDia/2, 0, chuckBodyDia/2);
    bodyGrad.addColorStop(0, '#52525b'); bodyGrad.addColorStop(0.2, '#a1a1aa'); bodyGrad.addColorStop(0.5, '#e4e4e7');
    bodyGrad.addColorStop(0.8, '#a1a1aa'); bodyGrad.addColorStop(1, '#52525b');
    ctx.fillStyle = bodyGrad; ctx.beginPath(); ctx.roundRect(-40, -chuckBodyDia/2, 40, chuckBodyDia, 4); ctx.fill();
    ctx.strokeStyle = '#3f3f46'; ctx.stroke();
    ctx.fillStyle = '#27272a'; ctx.fillRect(-5, -chuckBodyDia/2 + 5, 5, chuckBodyDia - 10);
    const jawHeight = 20; const jawWidth = 25;
    ctx.beginPath(); ctx.rect(0, -chuckBodyDia/2, 30, chuckBodyDia); ctx.clip();
    for(let j=0; j<3; j++) {
        const angleOffset = (Math.PI * 2 / 3) * j;
        const currentAngle = rotationRef.current + angleOffset;
        const radius = chuckBodyDia / 2.8; const jawY = Math.sin(currentAngle) * radius;
        const jawGrad = ctx.createLinearGradient(0, jawY - 10, 0, jawY + 10);
        jawGrad.addColorStop(0, '#3f3f46'); jawGrad.addColorStop(0.5, '#71717a'); jawGrad.addColorStop(1, '#3f3f46');
        ctx.fillStyle = jawGrad; ctx.strokeStyle = '#18181b'; ctx.lineWidth = 1;
        ctx.fillRect(-5, jawY - (jawHeight/2), jawWidth, jawHeight);
        ctx.strokeRect(-5, jawY - (jawHeight/2), jawWidth, jawHeight);
        ctx.fillStyle = '#18181b'; ctx.fillRect(5, jawY - 5, 10, 10);
    }
    ctx.restore();

    // Stock
    ctx.save(); ctx.beginPath(); ctx.rect(chuckX, centerY - (stockPixelDia/2), stockPixelLen, stockPixelDia); ctx.clip();
    drawMaterialTexture(ctx, chuckX, centerY - (stockPixelDia/2), stockPixelLen, stockPixelDia, stockMaterial, 'SIDE');
    const lightGrad = ctx.createLinearGradient(0, centerY - (stockPixelDia/2), 0, centerY + (stockPixelDia/2));
    lightGrad.addColorStop(0, 'rgba(0,0,0,0.6)'); lightGrad.addColorStop(0.3, 'rgba(0,0,0,0.1)');
    lightGrad.addColorStop(0.4, 'rgba(255,255,255,0.2)'); lightGrad.addColorStop(0.5, 'rgba(255,255,255,0.0)');
    lightGrad.addColorStop(0.8, 'rgba(0,0,0,0.3)'); lightGrad.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = lightGrad; ctx.fillRect(chuckX, centerY - (stockPixelDia/2), stockPixelLen, stockPixelDia);
    if (simState.spindleDirection !== 'STOP') {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for(let i=0; i<5; i++) {
             const y = centerY - (stockPixelDia/2) + Math.random() * stockPixelDia;
             ctx.fillRect(chuckX, y, stockPixelLen, 1);
        }
    }
    ctx.restore();
    
    // Trace
    if (showTrace && simState.path.length > 0) {
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; ctx.setLineDash([]); ctx.beginPath();
        let lastX = homePosition.x; let lastZ = homePosition.z; 
        const startX = zZeroPixel + (lastZ * SCALE); const startY = centerY - ((lastX / 2) * SCALE);
        ctx.moveTo(startX, startY);
        simState.path.forEach(p => {
            const cx = zZeroPixel + (p.z * SCALE); const cy = centerY - ((p.x / 2) * SCALE);
            ctx.lineTo(cx, cy);
            lastX = p.x; lastZ = p.z;
        });
        ctx.stroke();
    }

    // Paths
    if (showPaths && simState.path.length > 0) {
        const hasComp = simState.path.some(p => p.cx !== undefined && p.cx !== p.x);
        if (hasComp) {
            ctx.lineWidth = 1; ctx.beginPath(); ctx.strokeStyle = '#ff00ff'; ctx.setLineDash([3, 3]);
            let lastCX = homePosition.x; let lastCZ = homePosition.z;
            simState.path.forEach(p => {
                const effectiveCX = p.cx !== undefined ? p.cx : p.x;
                const effectiveCZ = p.cz !== undefined ? p.cz : p.z;
                if (p.type === 'cut') {
                   const cx = zZeroPixel + (effectiveCZ * SCALE); const cy = centerY - ((effectiveCX / 2) * SCALE);
                   const lx = zZeroPixel + (lastCZ * SCALE); const ly = centerY - ((lastCX / 2) * SCALE);
                   ctx.moveTo(lx, ly); ctx.lineTo(cx, cy);
                }
                lastCX = effectiveCX; lastCZ = effectiveCZ;
            });
            ctx.stroke();
        }

        ctx.lineWidth = 1.5; ctx.beginPath(); ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)'; ctx.setLineDash([4, 4]);
        let lastX = homePosition.x; let lastZ = homePosition.z;
        simState.path.forEach(p => {
            if (p.type === 'rapid') {
                const cx = zZeroPixel + (p.z * SCALE); const cy = centerY - ((p.x / 2) * SCALE);
                const lx = zZeroPixel + (lastZ * SCALE); const ly = centerY - ((lastX / 2) * SCALE);
                ctx.moveTo(lx, ly); ctx.lineTo(cx, cy);
            }
            lastX = p.x; lastZ = p.z;
        });
        ctx.stroke();
        
        ctx.beginPath(); ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)'; ctx.setLineDash([]);
        lastX = homePosition.x; lastZ = homePosition.z;
        simState.path.forEach(p => {
            const cx = zZeroPixel + (p.z * SCALE); const cy = centerY - ((p.x / 2) * SCALE);
            const lx = zZeroPixel + (lastZ * SCALE); const ly = centerY - ((lastX / 2) * SCALE);
            if (p.type === 'cut') {
                ctx.moveTo(lx, ly); ctx.lineTo(cx, cy);
                ctx.moveTo(lx, centerY + ((lastX / 2) * SCALE)); ctx.lineTo(cx, centerY + ((p.x / 2) * SCALE));
            }
            lastX = p.x; lastZ = p.z;
        });
        ctx.stroke();
    }

    particlesRef.current.forEach(p => {
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        const screenX = (width - originOffset) + p.rx;
        ctx.beginPath(); ctx.arc(screenX, p.y, particleConfig.size, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1.0;
    });

    const currentPoint = simState.path.length > 0 ? simState.path[simState.path.length - 1] : { x: simState.x, z: simState.z, cx: simState.x, cz: simState.z };
    const displayX = currentPoint.cx !== undefined ? currentPoint.cx : simState.x;
    const displayZ = currentPoint.cz !== undefined ? currentPoint.cz : simState.z;
    const toolZPixel = zZeroPixel + (displayZ * SCALE); const toolXPixel = centerY - ((displayX / 2) * SCALE);
    const transform = ctx.getTransform(); const screenPt = transform.transformPoint(new DOMPoint(toolZPixel, toolXPixel));
    toolScreenPosRef.current = { x: screenPt.x, y: screenPt.y };
    ctx.save(); ctx.translate(toolZPixel, toolXPixel); drawToolGraphics(ctx); ctx.restore();
    if (simState.coolant === 'FLOOD') { ctx.fillStyle = 'rgba(0, 100, 255, 0.15)'; ctx.fillRect(0, 0, width, height); }
  };

  const renderFrontView = (ctx: CanvasRenderingContext2D, width: number, height: number, deltaTime: number) => {
      const cx = width / 2; const cy = height / 2; const stockRadius = (STOCK_DIAMETER / 2) * SCALE;
      ctx.strokeStyle = '#1a1f26'; ctx.lineWidth = 1; ctx.beginPath();
      ctx.arc(cx, cy, stockRadius, 0, Math.PI*2); ctx.arc(cx, cy, stockRadius + 50, 0, Math.PI*2);
      ctx.moveTo(cx - 200, cy); ctx.lineTo(cx + 200, cy); ctx.moveTo(cx, cy - 200); ctx.lineTo(cx, cy + 200); ctx.stroke();
      const chuckRad = 60; const faceGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, chuckRad);
      faceGrad.addColorStop(0, '#e4e4e7'); faceGrad.addColorStop(0.8, '#71717a'); faceGrad.addColorStop(1, '#3f3f46');
      ctx.fillStyle = faceGrad; ctx.beginPath(); ctx.arc(cx, cy, chuckRad, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#27272a'; ctx.lineWidth = 2; ctx.stroke();
      for(let j=0; j<3; j++) {
        const angle = rotationRef.current + (Math.PI * 2 / 3) * j;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle); ctx.fillStyle = '#27272a'; ctx.fillRect(stockRadius + 5, -10, 25, 20);
        ctx.fillStyle = '#18181b'; ctx.beginPath(); ctx.arc(chuckRad - 15, 0, 4, 0, Math.PI*2); ctx.fill(); ctx.restore();
      }
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, stockRadius, 0, Math.PI*2); ctx.clip();
      drawMaterialTexture(ctx, cx - stockRadius, cy - stockRadius, stockRadius*2, stockRadius*2, stockMaterial, 'FACE');
      const radShadow = ctx.createRadialGradient(cx, cy, stockRadius * 0.7, cx, cy, stockRadius);
      radShadow.addColorStop(0, 'rgba(0,0,0,0)'); radShadow.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = radShadow; ctx.fill();
      if (simState.spindleDirection !== 'STOP') {
         ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.arc(cx, cy, stockRadius * 0.5, 0, Math.PI*2); ctx.stroke();
         ctx.beginPath(); ctx.arc(cx, cy, stockRadius * 0.8, 0, Math.PI*2); ctx.stroke();
      }
      ctx.restore();
      const toolDist = (simState.x / 2) * SCALE; const tx = cx; const ty = cy - toolDist;
      toolScreenPosRef.current = { x: tx, y: ty };
      ctx.save(); ctx.translate(tx, ty); ctx.fillStyle = tools.find(t=>t.id===simState.tool)?.color || '#ff0000';
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-10, -20); ctx.lineTo(10, -20); ctx.fill();
      ctx.fillStyle = '#333'; ctx.fillRect(-15, -60, 30, 40); ctx.restore();
  };

  const drawMaterialTexture = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, mat: MaterialType, view: 'SIDE' | 'FACE') => {
      switch(mat) {
          case 'Wood': ctx.fillStyle = '#8d5a36'; break;
          case 'Aluminum': ctx.fillStyle = '#d1d5db'; break;
          case 'Steel': ctx.fillStyle = '#64748b'; break;
          case 'Carbon Fiber': ctx.fillStyle = '#18181b'; break;
          case 'Epoxi': ctx.fillStyle = '#d97706'; break;
          case 'POM': ctx.fillStyle = '#f1f5f9'; break;
          default: ctx.fillStyle = '#9ca3af';
      }
      ctx.fillRect(x, y, w, h);
      ctx.save();
      if (mat === 'Wood') {
          ctx.strokeStyle = '#5c3a2e'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.4;
          if (view === 'SIDE') {
              for (let i = 0; i < h; i += 8) {
                  ctx.beginPath(); ctx.moveTo(x, y + i); ctx.bezierCurveTo(x + w/3, y + i + Math.random()*5, x + 2*w/3, y + i - Math.random()*5, x + w, y + i); ctx.stroke();
              }
          } else {
              for(let r=5; r<w/2; r+=5) {
                 ctx.beginPath(); ctx.arc(x+w/2, y+h/2, r + Math.random(), 0, Math.PI*2); ctx.stroke();
              }
          }
      } else if (mat === 'Aluminum' || mat === 'Steel') {
          ctx.fillStyle = (mat === 'Aluminum') ? '#fff' : '#94a3b8'; ctx.globalAlpha = 0.15;
          if (view === 'SIDE') {
             for(let i=0; i<300; i++) { ctx.fillRect(x + Math.random()*w, y + Math.random()*h, Math.random()*20, 1); }
          } else {
              ctx.strokeStyle = '#fff';
              for(let i=0; i<30; i++) { ctx.beginPath(); ctx.arc(x+w/2, y+h/2, Math.random()*(w/2), 0, Math.PI*2); ctx.stroke(); }
          }
      } else if (mat === 'Carbon Fiber') {
          ctx.fillStyle = '#3f3f46'; ctx.globalAlpha = 0.5;
          const size = 6;
          for(let i=0; i<w; i+=size) {
              for(let j=0; j<h; j+=size) { if ((Math.floor(i/size) + Math.floor(j/size)) % 2 === 0) { ctx.fillRect(x+i, y+j, size, size); } }
          }
      }
      ctx.restore();
  };

  const renderOverlay = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const gizmoSize = 40; const gizmoX = 40; const gizmoY = height - 40;
      ctx.lineWidth = 2; ctx.font = 'bold 12px monospace';
      if (viewMode === 'FRONT') {
          ctx.beginPath(); ctx.strokeStyle = '#ff3333'; ctx.moveTo(gizmoX, gizmoY); ctx.lineTo(gizmoX, gizmoY - gizmoSize); ctx.stroke();
          ctx.fillStyle = '#ff3333'; ctx.fillText('X', gizmoX - 3, gizmoY - gizmoSize - 8);
          ctx.beginPath(); ctx.strokeStyle = '#33cc33'; ctx.moveTo(gizmoX - gizmoSize/2, gizmoY); ctx.lineTo(gizmoX + gizmoSize/2, gizmoY); ctx.stroke();
          ctx.fillStyle = '#33cc33'; ctx.fillText('Y', gizmoX + gizmoSize/2 + 5, gizmoY + 4);
      } else {
          ctx.beginPath(); ctx.strokeStyle = '#0066ff'; ctx.moveTo(gizmoX, gizmoY); ctx.lineTo(gizmoX + gizmoSize, gizmoY); ctx.stroke();
          ctx.fillStyle = '#0066ff'; ctx.fillText('Z', gizmoX + gizmoSize + 5, gizmoY + 4);
          ctx.beginPath(); ctx.strokeStyle = '#ff3333'; ctx.moveTo(gizmoX, gizmoY); ctx.lineTo(gizmoX, gizmoY - gizmoSize); ctx.stroke();
          ctx.fillStyle = '#ff3333'; ctx.fillText('X', gizmoX - 3, gizmoY - gizmoSize - 8);
      }
      const activeCmd = commands[currentLine];
      if (activeCmd) {
        ctx.save(); const cmdText = activeCmd.raw.trim(); ctx.font = 'bold 14px "Share Tech Mono", monospace';
        const tm = ctx.measureText(cmdText); const bgW = tm.width + 32; const bgX = (width / 2) - (bgW / 2); const bgY = height - 60;
        ctx.fillStyle = 'rgba(0, 10, 0, 0.85)'; ctx.fillRect(bgX, bgY, bgW, 30);
        ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 1; ctx.strokeRect(bgX, bgY, bgW, 30);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#00ff00';
        ctx.fillText(cmdText, width / 2, bgY + 16); ctx.restore();
    }
  };

  const drawToolGraphics = (ctx: CanvasRenderingContext2D) => {
    const activeToolConfig = tools.find(t => t.id === simState.tool) || tools[0];
    const createMetalGradient = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dark: string, light: string) => {
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, dark); grad.addColorStop(0.2, light); grad.addColorStop(0.5, dark);
        grad.addColorStop(0.8, light); grad.addColorStop(1, dark);
        return grad;
    };
    const drawScrew = (x: number, y: number, r: number) => {
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
        const grad = ctx.createRadialGradient(x-r/3, y-r/3, r/4, x, y, r);
        grad.addColorStop(0, '#71717a'); grad.addColorStop(1, '#18181b');
        ctx.fillStyle = grad; ctx.fill();
        ctx.fillStyle = '#09090b'; ctx.beginPath();
        for(let i=0; i<6; i++) {
            const angle = (Math.PI/3)*i; const sx = x + Math.cos(angle)*r*0.5; const sy = y + Math.sin(angle)*r*0.5;
            if(i===0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.closePath(); ctx.fill(); ctx.restore();
    };
    ctx.save();
    const insertGold = activeToolConfig.wear > 50 ? '#b91c1c' : '#fbbf24'; const insertDetail = activeToolConfig.wear > 50 ? '#7f1d1d' : '#d97706';
    const wearRatio = activeToolConfig.wear / 100;
    const turretGrad = ctx.createLinearGradient(40, -80, 120, -80);
    turretGrad.addColorStop(0, '#18181b'); turretGrad.addColorStop(0.5, '#27272a'); turretGrad.addColorStop(1, '#09090b');
    ctx.fillStyle = turretGrad; ctx.beginPath(); ctx.roundRect(40, -70, 80, 120, 4); ctx.fill();
    ctx.strokeStyle = '#3f3f46'; ctx.lineWidth = 1; ctx.stroke();
    drawScrew(55, -50, 6); drawScrew(55, 30, 6); drawScrew(100, -50, 6); drawScrew(100, 30, 6);
    if (activeToolConfig.type === 'grooving') {
        const shankH = 25; const shankY = -shankH/2 - 15; 
        ctx.fillStyle = createMetalGradient(ctx, 20, shankY, 80, shankH, '#333', '#666'); ctx.fillRect(20, shankY, 80, shankH); 
        ctx.fillStyle = '#52525b'; ctx.beginPath(); ctx.moveTo(20, shankY + 5); ctx.lineTo(5, shankY + 5); ctx.lineTo(5, shankY + shankH - 5); ctx.lineTo(20, shankY + shankH - 5); ctx.fill();
        const originalW = activeToolConfig.width * SCALE; const effectiveW = originalW * (1 - (wearRatio * 0.3));
        const erosion = (originalW - effectiveW) / 2;
        ctx.fillStyle = insertGold; ctx.beginPath(); ctx.roundRect(0, -originalW/2 + erosion, 10, effectiveW, 1); ctx.fill();
    } else if (activeToolConfig.type === 'threading') {
        const shankH = 25; const shankY = -shankH - 5;
        ctx.fillStyle = createMetalGradient(ctx, 15, shankY, 90, shankH, '#333', '#555'); ctx.fillRect(15, shankY, 90, shankH);
        ctx.beginPath(); ctx.moveTo(15, shankY + shankH); ctx.lineTo(5, shankY + shankH + 10); ctx.lineTo(25, shankY + shankH + 10); ctx.lineTo(35, shankY + shankH);
        ctx.fillStyle = '#3f3f46'; ctx.fill();
        ctx.fillStyle = insertGold; ctx.beginPath();
        if (wearRatio > 0.1) { ctx.arc(2 * wearRatio, 0, 2 * wearRatio, Math.PI/2, -Math.PI/2, true); ctx.lineTo(8, -4); ctx.lineTo(8, 4); } else { ctx.moveTo(0, 0); ctx.lineTo(8, -4); ctx.lineTo(8, 4); }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = insertDetail; ctx.beginPath(); ctx.arc(5, 0, 1.5, 0, Math.PI*2); ctx.fill(); drawScrew(15, -5, 3);
    } else {
        const shankH = 30; const shankY = -shankH - 2; 
        ctx.fillStyle = createMetalGradient(ctx, 10, shankY, 100, shankH, '#18181b', '#3f3f46'); ctx.fillRect(10, shankY, 100, shankH);
        ctx.fillStyle = '#27272a'; ctx.beginPath(); ctx.moveTo(10, shankY + shankH); ctx.lineTo(0, shankY + shankH + 8); ctx.lineTo(20, shankY + shankH + 8); ctx.lineTo(25, shankY + shankH); ctx.fill();
        ctx.fillStyle = insertGold; ctx.beginPath();
        const wearRadius = wearRatio * 4;
        if (wearRadius > 0.5) { ctx.arc(2 + wearRadius, 1.5 + wearRadius, wearRadius, Math.PI, 1.5 * Math.PI); ctx.lineTo(12, -2); ctx.lineTo(12, 5); ctx.lineTo(2 + wearRadius, 6); } else { ctx.moveTo(0, 0); ctx.lineTo(12, -2); ctx.lineTo(12, 5); ctx.lineTo(2, 6); }
        ctx.closePath(); ctx.fill();
        const grad = ctx.createRadialGradient(4, 2, 0, 4, 2, 5); grad.addColorStop(0, insertDetail); grad.addColorStop(1, insertGold);
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(5, 1.5, 2.5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#52525b'; ctx.beginPath(); ctx.moveTo(5, -2); ctx.lineTo(15, -5); ctx.lineTo(15, -15); ctx.lineTo(25, -15); ctx.lineTo(25, -2); ctx.fill(); drawScrew(20, -10, 3);
    }
    ctx.restore();
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [simState, feedOverride, stockMaterial, tools, showPaths, showTrace, viewMode, particleConfig, originOffset]); 

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
        <canvas ref={canvasRef} width={800} height={400} className="w-full h-full object-cover" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} />
        <div className="crt-scanline"></div>
        <div className="absolute top-4 left-4 flex flex-col gap-2 bg-zinc-900/90 backdrop-blur border border-zinc-700 p-3 rounded-xl z-20 shadow-2xl min-w-[140px]">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Husillo</span>
                {simState.spindleDirection === 'CW' && <RotateCw className="text-green-500 animate-spin" size={16} />}
                {simState.spindleDirection === 'CCW' && <RotateCcw className="text-yellow-500 animate-spin" size={16} />}
                {simState.spindleDirection === 'STOP' && <Octagon className="text-red-500" size={16} />}
            </div>
            <div className="flex flex-col items-center py-1">
                <span className="text-2xl font-mono font-bold text-white tracking-widest tabular-nums">{Math.round(simState.spindleSpeed)}</span>
                <span className="text-[10px] text-zinc-600 font-bold">RPM</span>
            </div>
            <div className={`text-xs font-bold text-center py-1 rounded ${simState.spindleDirection === 'STOP' ? 'bg-red-900/20 text-red-500' : simState.spindleDirection === 'CW' ? 'bg-green-900/20 text-green-500' : 'bg-yellow-900/20 text-yellow-500'}`}>
                {simState.spindleDirection === 'STOP' ? 'DETENIDO' : simState.spindleDirection === 'CW' ? 'GIRANDO CW' : 'GIRANDO CCW'}
            </div>
        </div>
        <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
            <div className="flex flex-col gap-1 bg-zinc-900/80 backdrop-blur border border-zinc-700 p-1.5 rounded-lg">
                <button onClick={() => setViewMode('SIDE')} className={`p-2 rounded flex items-center gap-2 text-xs font-bold transition-all ${viewMode === 'SIDE' ? 'bg-cnc-accent text-black shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`} title="Vista Lateral (XZ)"><Monitor size={16} /> <span className="hidden sm:inline">LATERAL</span></button>
                <button onClick={() => setViewMode('FRONT')} className={`p-2 rounded flex items-center gap-2 text-xs font-bold transition-all ${viewMode === 'FRONT' ? 'bg-cnc-accent text-black shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`} title="Vista Frontal (XY)"><Circle size={16} /> <span className="hidden sm:inline">FRONTAL</span></button>
                <button onClick={() => setViewMode('ISO')} className={`p-2 rounded flex items-center gap-2 text-xs font-bold transition-all ${viewMode === 'ISO' ? 'bg-cnc-accent text-black shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`} title="Vista Isométrica Simulada"><Box size={16} /> <span className="hidden sm:inline">ISO</span></button>
            </div>
            <div className="flex flex-col items-end">
                <button onClick={() => setShowSettings(!showSettings)} className={`p-2 rounded-lg flex items-center gap-2 text-xs font-bold transition-all border border-zinc-700 ${showSettings ? 'bg-zinc-700 text-white' : 'bg-zinc-900/80 text-zinc-400 hover:bg-zinc-800'}`} title="Ajustes de Partículas"><Sparkles size={16} /> <Sliders size={14} /></button>
                {showSettings && (
                    <div className="mt-2 bg-zinc-900/95 backdrop-blur border border-zinc-700 p-3 rounded-xl shadow-2xl w-48 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2">
                        <h4 className="text-[10px] font-bold text-cnc-accent uppercase tracking-wider border-b border-zinc-800 pb-1">Efectos Visuales</h4>
                        <div className="flex flex-col gap-1"><div className="flex justify-between text-[10px] text-zinc-400 font-bold"><span>Densidad</span><span>{particleConfig.density}x</span></div><input type="range" min="1" max="20" step="1" value={particleConfig.density} onChange={(e) => setParticleConfig({...particleConfig, density: parseInt(e.target.value)})} className="h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cnc-accent" /></div>
                        <div className="flex flex-col gap-1"><div className="flex justify-between text-[10px] text-zinc-400 font-bold"><span>Tamaño</span><span>{particleConfig.size}px</span></div><input type="range" min="0.5" max="5.0" step="0.5" value={particleConfig.size} onChange={(e) => setParticleConfig({...particleConfig, size: parseFloat(e.target.value)})} className="h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cnc-accent" /></div>
                        <div className="flex flex-col gap-1"><div className="flex justify-between text-[10px] text-zinc-400 font-bold"><span>Duración</span><span>{particleConfig.lifespan}s</span></div><input type="range" min="0.5" max="3.0" step="0.5" value={particleConfig.lifespan} onChange={(e) => setParticleConfig({...particleConfig, lifespan: parseFloat(e.target.value)})} className="h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cnc-accent" /></div>
                    </div>
                )}
            </div>
        </div>
        {tooltip && (
            <div style={{ top: tooltip.y + 15, left: tooltip.x + 15 }} className="absolute bg-zinc-900/95 border border-cnc-accent p-3 rounded shadow-2xl z-50 pointer-events-none text-xs backdrop-blur min-w-[180px] animate-in fade-in zoom-in-95 duration-150">
                <div className="font-bold text-cnc-accent text-sm mb-2 border-b border-zinc-700 pb-1 flex justify-between items-center"><span>{tooltip.tool.name}</span><span className="text-[10px] bg-zinc-800 px-1 rounded text-zinc-400">T{tooltip.tool.id < 10 ? '0'+tooltip.tool.id : tooltip.tool.id}</span></div>
                <div className="text-zinc-400 space-y-1.5"><div className="flex justify-between items-center"><span>Portaherramienta:</span><span className="text-white font-mono font-bold text-[10px]">{tooltip.tool.holderMaterial || 'Acero Estándar'}</span></div><div className="flex justify-between items-center"><span>Pieza Trabajo:</span><div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full border border-white/20" style={{ background: getMaterialColor(stockMaterial) }}></div><span className="text-white font-mono font-bold">{translateMaterial(stockMaterial)}</span></div></div><div className="flex justify-between items-center"><span>Tipo Inserto:</span><span className="text-white font-mono font-bold text-[10px]">{tooltip.tool.holderType}</span></div><div className="flex justify-between items-center"><span>Desgaste:</span><span className={`${tooltip.tool.wear > 50 ? 'text-red-500' : 'text-green-500'} font-mono font-bold`}>{tooltip.tool.wear.toFixed(1)}%</span></div></div>
            </div>
        )}
        {pendingToolChange && (
            <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-zinc-900 border-2 border-yellow-500 p-8 rounded shadow-2xl max-w-md w-full text-center relative animate-pulse-fast">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-yellow-500 shadow-[0_0_10px_#eab308]"></div>
                    <AlertTriangle className="mx-auto text-yellow-500 mb-4 h-12 w-12" />
                    <h3 className="text-xl font-bold text-yellow-500 tracking-widest mb-1">ACCIÓN MANUAL REQUERIDA</h3>
                    <p className="text-zinc-400 text-sm mb-6 uppercase tracking-wide">Por favor confirma el cambio de herramienta</p>
                    <div className="bg-black border border-zinc-800 p-4 mb-6 rounded text-left"><div className="text-xs text-zinc-500 font-mono mb-1">HERRAMIENTA SOLICITADA</div><div className="text-2xl font-bold text-white font-mono flex justify-between items-end"><span>T{pendingToolChange.code}</span><span className="text-sm text-cnc-accent mb-1">{getToolInfo(pendingToolChange)?.name.split('-')[1].trim()}</span></div></div>
                    <button onClick={handleConfirmTool} className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-3 px-6 rounded transition-all flex items-center justify-center gap-2"><CheckCircle2 size={20} />CONFIRMAR Y RESUMIR</button>
                </div>
            </div>
        )}
    </div>
  );
}