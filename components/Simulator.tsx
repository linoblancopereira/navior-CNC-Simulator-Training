import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Video, Monitor, Box, Circle } from 'lucide-react';
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
  showPaths,
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
  
  // Animation Physics Refs
  const lastTimeRef = useRef<number>(0);
  const rotationRef = useRef<number>(0);
  const toolScreenPosRef = useRef<{x: number, y: number} | null>(null);
  
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

  // 1. Interpreter Engine
  useEffect(() => {
    if (machineState === MachineState.ALARM) return;

    if (machineState === MachineState.IDLE) {
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

  }, [commands, currentLine, machineState, onError, onStateChange, onRequestPause, manualSpindle, tools]);

  // Handle Tooltip
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if(!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    // Check using projected screen coordinates
    if (toolScreenPosRef.current) {
        const tx = toolScreenPosRef.current.x;
        const ty = toolScreenPosRef.current.y;
        const dist = Math.sqrt(Math.pow(mx - tx, 2) + Math.pow(my - ty, 2));
        
        // Extended hit area for holders
        const isClose = dist < 50;

        if (isClose) {
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

    // Delta Time Calculation
    if (lastTimeRef.current === 0) lastTimeRef.current = time;
    const deltaTime = (time - lastTimeRef.current) / 1000; // seconds
    lastTimeRef.current = time;

    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;
    
    // Clear Canvas
    ctx.fillStyle = '#0f1115';
    ctx.fillRect(0, 0, width, height);

    // --- Physics Update (Shared) ---
    const dx = simState.x - prevPosRef.current.x;
    const dz = simState.z - prevPosRef.current.z;
    const distTraveled = Math.sqrt(dx*dx + dz*dz);
    const isMoving = distTraveled > 0.001;
    const isCutting = simState.spindleDirection !== 'STOP' && simState.path.length > 0 && simState.path[simState.path.length - 1].type === 'cut';

    // Particle Generation (Only generate if cutting)
    if (isCutting && isMoving && simState.x <= STOCK_DIAMETER + 1) {
        // ... (Particle generation logic preserved) ...
        let pColor1 = '#ffaa00';
        let pColor2 = '#ffff00';
        // Material colors
        if (stockMaterial === 'Aluminum') { pColor1 = '#e2e8f0'; pColor2 = '#ffffff'; } 
        else if (stockMaterial === 'Wood') { pColor1 = '#d97706'; pColor2 = '#92400e'; }
        else if (stockMaterial === 'Carbon Fiber') { pColor1 = '#111111'; pColor2 = '#333333'; }
        else if (stockMaterial === 'Epoxi') { pColor1 = '#fef08a'; pColor2 = '#facc15'; }
        else if (stockMaterial === 'POM') { pColor1 = '#f8fafc'; pColor2 = '#cbd5e1'; }

        for(let i=0; i<3; i++) {
            // Need z/x pixel in SIDE view coords for storage, will project later
            const zZeroPixel = width - ORIGIN_X_OFFSET;
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
        
        // Wear Calculation
        const currentTool = tools.find(t => t.id === simState.tool);
        let hardness = 1.0;
        if (stockMaterial === 'Aluminum') hardness = 0.5;
        // ... (Hardness logic) ...
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

    // Update Particles
    particlesRef.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
        p.life -= 0.05;
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
    
    // Update Rotation
    const effectiveSpindleSpeed = simState.spindleSpeed * (feedOverride / 100); 
    const speedRadPerSec = (effectiveSpindleSpeed / 60) * 2 * Math.PI;
    if (simState.spindleDirection === 'CW') rotationRef.current += speedRadPerSec * deltaTime;
    else if (simState.spindleDirection === 'CCW') rotationRef.current -= speedRadPerSec * deltaTime;


    // --- RENDER DISPATCH ---
    if (viewMode === 'FRONT') {
        renderFrontView(ctx, width, height, deltaTime);
    } else {
        ctx.save();
        if (viewMode === 'ISO') {
            // Apply simple shear/scale for pseudo-iso
            ctx.translate(100, 50); 
            ctx.transform(1, 0.15, -0.4, 0.9, 0, 0); 
        }
        renderSideView(ctx, width, height, deltaTime);
        ctx.restore();
    }

    // --- Overlay / HUD (Unaffected by View Transform) ---
    renderOverlay(ctx, width, height);
    
    requestRef.current = requestAnimationFrame(animate);
  };

  const renderSideView = (ctx: CanvasRenderingContext2D, width: number, height: number, deltaTime: number) => {
    const zZeroPixel = width - ORIGIN_X_OFFSET;
    const centerY = height / 2;
    const stockPixelLen = STOCK_LENGTH * SCALE;
    const stockPixelDia = STOCK_DIAMETER * SCALE;
    const chuckX = zZeroPixel - stockPixelLen;

    // Grid
    ctx.strokeStyle = '#1a1f26';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i=0; i<width; i+=40) { ctx.moveTo(i,0); ctx.lineTo(i, height); }
    for(let i=0; i<height; i+=40) { ctx.moveTo(0,i); ctx.lineTo(width, i); }
    ctx.stroke();

    // Center Line
    ctx.strokeStyle = '#333';
    ctx.setLineDash([20, 5, 5, 5]);
    ctx.beginPath(); ctx.moveTo(0, centerY); ctx.lineTo(width, centerY); ctx.stroke();
    ctx.setLineDash([]);

    // --- Chuck ---
    const chuckBodyDia = 160;
    const chuckXPosition = chuckX - 10;
    ctx.save();
    ctx.translate(chuckXPosition, centerY);
    
    const bodyGrad = ctx.createLinearGradient(0, -chuckBodyDia/2, 0, chuckBodyDia/2);
    bodyGrad.addColorStop(0, '#27272a'); bodyGrad.addColorStop(0.5, '#71717a'); bodyGrad.addColorStop(1, '#27272a');
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(-60, -chuckBodyDia/2, 60, chuckBodyDia);
    
    ctx.beginPath(); ctx.rect(-10, -chuckBodyDia/2, 40, chuckBodyDia); ctx.clip();
    const jawHeight = 25; const jawWidth = 30;
    for(let j=0; j<3; j++) {
        const angleOffset = (Math.PI * 2 / 3) * j;
        const currentAngle = rotationRef.current + angleOffset;
        const radius = chuckBodyDia / 3.5;
        const jawY = Math.sin(currentAngle) * radius;
        const jawZ = Math.cos(currentAngle); 
        const isFront = jawZ > 0;
        ctx.fillStyle = isFront ? '#d4d4d8' : '#52525b'; 
        ctx.strokeStyle = '#18181b'; ctx.lineWidth = 1;
        ctx.fillRect(-5, jawY - (jawHeight/2), jawWidth, jawHeight);
        ctx.strokeRect(-5, jawY - (jawHeight/2), jawWidth, jawHeight);
    }
    ctx.restore();

    // --- Stock ---
    const stockGradient = ctx.createLinearGradient(0, centerY - (stockPixelDia/2), 0, centerY + (stockPixelDia/2));
    configureStockGradient(stockGradient); // Helper
    ctx.fillStyle = stockGradient;
    ctx.fillRect(chuckX, centerY - (stockPixelDia/2), stockPixelLen, stockPixelDia/2);
    ctx.fillRect(chuckX, centerY, stockPixelLen, stockPixelDia/2);
    
    // --- Paths ---
    if (showPaths && simState.path.length > 0) {
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
        ctx.setLineDash([4, 4]);
        let lastX = 100; let lastZ = 50;
        simState.path.forEach(p => {
            if (p.type === 'rapid') {
                const cx = zZeroPixel + (p.z * SCALE); const cy = centerY - ((p.x / 2) * SCALE);
                const lx = zZeroPixel + (lastZ * SCALE); const ly = centerY - ((lastX / 2) * SCALE);
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

    // --- Particles ---
    particlesRef.current.forEach(p => {
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1.0;
    });

    // --- Tool ---
    const toolZPixel = zZeroPixel + (simState.z * SCALE);
    const toolXPixel = centerY - ((simState.x / 2) * SCALE);
    
    // Save screen coordinates for mouse interaction (applying transform if needed)
    const transform = ctx.getTransform();
    const screenPt = transform.transformPoint(new DOMPoint(toolZPixel, toolXPixel));
    toolScreenPosRef.current = { x: screenPt.x, y: screenPt.y };

    ctx.save();
    ctx.translate(toolZPixel, toolXPixel);
    drawToolGraphics(ctx);
    ctx.restore();
    
    // Coolant (Side View specific)
    if (simState.coolant === 'FLOOD') {
        ctx.fillStyle = 'rgba(0, 100, 255, 0.15)';
        ctx.fillRect(0, 0, width, height);
    }
  };

  const renderFrontView = (ctx: CanvasRenderingContext2D, width: number, height: number, deltaTime: number) => {
      const cx = width / 2;
      const cy = height / 2;
      const stockRadius = (STOCK_DIAMETER / 2) * SCALE;
      
      // Grid (Radial)
      ctx.strokeStyle = '#1a1f26';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, stockRadius, 0, Math.PI*2);
      ctx.arc(cx, cy, stockRadius + 50, 0, Math.PI*2);
      ctx.moveTo(cx - 200, cy); ctx.lineTo(cx + 200, cy);
      ctx.moveTo(cx, cy - 200); ctx.lineTo(cx, cy + 200);
      ctx.stroke();

      // Chuck Face
      const chuckRad = 100;
      ctx.fillStyle = '#27272a';
      ctx.beginPath(); ctx.arc(cx, cy, chuckRad, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#3f3f46'; ctx.stroke();

      // Jaws
      for(let j=0; j<3; j++) {
        const angle = rotationRef.current + (Math.PI * 2 / 3) * j;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.fillStyle = '#52525b';
        ctx.fillRect(stockRadius + 5, -15, 40, 30);
        ctx.restore();
      }

      // Stock Face
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, stockRadius);
      // Simplify stock color for radial
      if (stockMaterial === 'Wood') { grad.addColorStop(0, '#8d5a36'); grad.addColorStop(1, '#3f2c22'); }
      else if (stockMaterial === 'Aluminum') { grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#a0aec0'); }
      else { grad.addColorStop(0, '#4a5568'); grad.addColorStop(1, '#1a202c'); }
      
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, cy, stockRadius, 0, Math.PI*2); ctx.fill();

      // Tool (Radial Position)
      // Tool X is Diameter. Distance from center = X/2
      const toolDist = (simState.x / 2) * SCALE;
      // Tool is usually coming from top (X+) or back
      // In our side view X+ is Up. So here tool should be at Y = cy - toolDist
      
      const tx = cx;
      const ty = cy - toolDist;
      
      toolScreenPosRef.current = { x: tx, y: ty }; // For tooltip

      ctx.save();
      ctx.translate(tx, ty);
      // Draw simplified tool Face view
      ctx.fillStyle = tools.find(t=>t.id===simState.tool)?.color || '#ff0000';
      ctx.beginPath();
      ctx.moveTo(0,0); ctx.lineTo(-10, -20); ctx.lineTo(10, -20); ctx.fill();
      ctx.fillStyle = '#333';
      ctx.fillRect(-15, -60, 30, 40); // Holder body
      ctx.restore();
  };

  const renderOverlay = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      // Axis Gizmo
      const gizmoSize = 40;
      const gizmoX = 40;
      const gizmoY = height - 40;
      ctx.lineWidth = 2; ctx.font = 'bold 12px monospace';
      
      // Different gizmo for Front view
      if (viewMode === 'FRONT') {
          ctx.beginPath(); ctx.strokeStyle = '#ff3333'; // X
          ctx.moveTo(gizmoX, gizmoY); ctx.lineTo(gizmoX, gizmoY - gizmoSize); ctx.stroke();
          ctx.fillStyle = '#ff3333'; ctx.fillText('X', gizmoX - 3, gizmoY - gizmoSize - 8);
          
          ctx.beginPath(); ctx.strokeStyle = '#33cc33'; // Y
          ctx.moveTo(gizmoX - gizmoSize/2, gizmoY); ctx.lineTo(gizmoX + gizmoSize/2, gizmoY); ctx.stroke();
          ctx.fillStyle = '#33cc33'; ctx.fillText('Y', gizmoX + gizmoSize/2 + 5, gizmoY + 4);
      } else {
          // Standard Z/X
          ctx.beginPath(); ctx.strokeStyle = '#0066ff';
          ctx.moveTo(gizmoX, gizmoY); ctx.lineTo(gizmoX + gizmoSize, gizmoY); ctx.stroke();
          ctx.fillStyle = '#0066ff'; ctx.fillText('Z', gizmoX + gizmoSize + 5, gizmoY + 4);

          ctx.beginPath(); ctx.strokeStyle = '#ff3333';
          ctx.moveTo(gizmoX, gizmoY); ctx.lineTo(gizmoX, gizmoY - gizmoSize); ctx.stroke();
          ctx.fillStyle = '#ff3333'; ctx.fillText('X', gizmoX - 3, gizmoY - gizmoSize - 8);
      }

      // Active Command
      const activeCmd = commands[currentLine];
      if (activeCmd) {
        ctx.save();
        const cmdText = activeCmd.raw.trim();
        ctx.font = 'bold 14px "Share Tech Mono", monospace';
        const tm = ctx.measureText(cmdText);
        const bgW = tm.width + 32;
        const bgX = (width / 2) - (bgW / 2);
        const bgY = height - 60;
        ctx.fillStyle = 'rgba(0, 10, 0, 0.85)'; ctx.fillRect(bgX, bgY, bgW, 30);
        ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 1; ctx.strokeRect(bgX, bgY, bgW, 30);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#00ff00';
        ctx.fillText(cmdText, width / 2, bgY + 16);
        ctx.restore();
    }
  };

  const drawToolGraphics = (ctx: CanvasRenderingContext2D) => {
    // ... (Existing tool drawing logic extracted) ...
    const activeToolConfig = tools.find(t => t.id === simState.tool) || tools[0];
    let holderColorStart = '#333'; let holderColorMid = '#444'; let holderColorEnd = '#222';

    if (activeToolConfig.type === 'grooving') {
        holderColorStart = '#1e3a8a'; holderColorMid = '#60a5fa'; holderColorEnd = '#172554';
    } else if (activeToolConfig.type === 'threading') {
        holderColorStart = '#991b1b'; holderColorMid = '#fca5a5'; holderColorEnd = '#450a0a';
    } else {
        holderColorStart = '#52525b'; holderColorMid = '#e4e4e7'; holderColorEnd = '#3f3f46';
    }
    
    const createHolderGradient = (y1: number, y2: number) => {
        const grad = ctx.createLinearGradient(0, y1, 0, y2);
        grad.addColorStop(0, holderColorStart); grad.addColorStop(0.5, holderColorMid); grad.addColorStop(1, holderColorEnd);
        return grad;
    };
    let insertColor = activeToolConfig.color;
    const wearFactor = activeToolConfig.wear / 100;
    const wearRadiusMod = wearFactor * 3; 

    // 1. Draw Turret Block
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(50, -60, 80, 100); 
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.strokeRect(50, -60, 80, 100);
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(65, -40, 3, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(65, 30, 3, 0, Math.PI*2); ctx.fill();

    // 2. Tool Holder
    if (activeToolConfig.type === 'grooving') {
        const width = 4 * SCALE; const insertW = activeToolConfig.width * SCALE; const length = 45;
        ctx.fillStyle = createHolderGradient(-35, 25); ctx.fillRect(20, -35, 50, 60);
        ctx.fillStyle = holderColorStart; ctx.beginPath(); ctx.moveTo(5, -insertW); ctx.lineTo(5, -length); ctx.lineTo(20, -length); ctx.lineTo(20, -insertW); ctx.fill();
        ctx.fillStyle = activeToolConfig.wear > 50 ? '#b91c1c' : insertColor;
        if (activeToolConfig.wear > 10) { ctx.beginPath(); ctx.roundRect(0, -insertW, insertW, insertW, wearRadiusMod); ctx.fill(); } 
        else { ctx.fillRect(0, -insertW, insertW, insertW); }
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(35, -15, 4, 0, Math.PI*2); ctx.fill();
    } else if (activeToolConfig.type === 'threading') {
        const shankH = 18;
        ctx.fillStyle = createHolderGradient(-shankH, 0); ctx.fillRect(10, -shankH, 80, shankH); 
        ctx.beginPath(); ctx.moveTo(10, -shankH); ctx.lineTo(0, -shankH + 2); ctx.lineTo(0, -2); ctx.lineTo(10, 0); ctx.fill();
        ctx.fillStyle = activeToolConfig.wear > 50 ? '#b91c1c' : insertColor;
        ctx.beginPath(); ctx.moveTo(0 + wearRadiusMod, 0); ctx.lineTo(5, -3); ctx.lineTo(5, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#000'; ctx.fillRect(5, -shankH + 4, 4, 4);
    } else {
        ctx.fillStyle = createHolderGradient(-25, 0); ctx.fillRect(10, -25, 100, 25); 
        ctx.fillStyle = activeToolConfig.wear > 50 ? '#b91c1c' : insertColor;
        ctx.beginPath(); ctx.moveTo(0 + wearRadiusMod, 0); ctx.lineTo(5, -8); ctx.lineTo(15, -8); ctx.lineTo(10, 0); ctx.fill();
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(12, -8, 3, 0, Math.PI*2); ctx.fill();
    }
    // Tool Label
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = 'bold 10px monospace';
    ctx.fillText(activeToolConfig.name.split(' - ')[0], 55, -45);
  };

  const configureStockGradient = (grad: CanvasGradient) => {
    if (stockMaterial === 'Wood') {
        if (simState.spindleDirection === 'STOP') { grad.addColorStop(0, '#3f2c22'); grad.addColorStop(0.4, '#8d5a36'); grad.addColorStop(0.6, '#a67c52'); grad.addColorStop(1, '#3f2c22'); } 
        else { grad.addColorStop(0, '#5c3a2e'); grad.addColorStop(0.5, '#d4a373'); grad.addColorStop(1, '#5c3a2e'); }
    } else if (stockMaterial === 'Aluminum') {
         if (simState.spindleDirection === 'STOP') { grad.addColorStop(0, '#718096'); grad.addColorStop(0.3, '#e2e8f0'); grad.addColorStop(0.5, '#edf2f7'); grad.addColorStop(0.7, '#e2e8f0'); grad.addColorStop(1, '#718096'); } 
         else { grad.addColorStop(0, '#a0aec0'); grad.addColorStop(0.5, '#ffffff'); grad.addColorStop(1, '#a0aec0'); }
    } else if (stockMaterial === 'Carbon Fiber') {
        if (simState.spindleDirection === 'STOP') { grad.addColorStop(0, '#0a0a0a'); grad.addColorStop(0.3, '#1f1f1f'); grad.addColorStop(0.5, '#2e2e2e'); grad.addColorStop(0.7, '#1f1f1f'); grad.addColorStop(1, '#0a0a0a'); } 
        else { grad.addColorStop(0, '#111'); grad.addColorStop(0.5, '#333'); grad.addColorStop(1, '#111'); }
    } else if (stockMaterial === 'Epoxi') {
        if (simState.spindleDirection === 'STOP') { grad.addColorStop(0, '#854d0e'); grad.addColorStop(0.3, '#eab308'); grad.addColorStop(0.5, '#fef08a'); grad.addColorStop(0.7, '#eab308'); grad.addColorStop(1, '#854d0e'); } 
        else { grad.addColorStop(0, '#ca8a04'); grad.addColorStop(0.5, '#fef9c3'); grad.addColorStop(1, '#ca8a04'); }
    } else if (stockMaterial === 'POM') {
        if (simState.spindleDirection === 'STOP') { grad.addColorStop(0, '#94a3b8'); grad.addColorStop(0.2, '#e2e8f0'); grad.addColorStop(0.5, '#f8fafc'); grad.addColorStop(0.8, '#e2e8f0'); grad.addColorStop(1, '#94a3b8'); } 
        else { grad.addColorStop(0, '#cbd5e1'); grad.addColorStop(0.5, '#ffffff'); grad.addColorStop(1, '#cbd5e1'); }
    } else {
         if (simState.spindleDirection === 'STOP') { grad.addColorStop(0, '#2d3748'); grad.addColorStop(0.2, '#718096'); grad.addColorStop(0.5, '#a0aec0'); grad.addColorStop(0.8, '#718096'); grad.addColorStop(1, '#2d3748'); } 
         else { grad.addColorStop(0, '#4a5568'); grad.addColorStop(0.5, '#cbd5e0'); grad.addColorStop(1, '#4a5568'); }
    }
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [simState, feedOverride, stockMaterial, tools, showPaths, viewMode]); 

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
        
        {/* Camera Control Panel */}
        <div className="absolute top-4 right-4 flex flex-col gap-1 bg-zinc-900/80 backdrop-blur border border-zinc-700 p-1.5 rounded-lg z-20">
            <button 
                onClick={() => setViewMode('SIDE')}
                className={`p-2 rounded flex items-center gap-2 text-xs font-bold transition-all ${viewMode === 'SIDE' ? 'bg-cnc-accent text-black shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                title="Vista Lateral (XZ)"
            >
                <Monitor size={16} /> <span className="hidden sm:inline">LATERAL</span>
            </button>
            <button 
                onClick={() => setViewMode('FRONT')}
                className={`p-2 rounded flex items-center gap-2 text-xs font-bold transition-all ${viewMode === 'FRONT' ? 'bg-cnc-accent text-black shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                title="Vista Frontal (XY)"
            >
                <Circle size={16} /> <span className="hidden sm:inline">FRONTAL</span>
            </button>
            <button 
                onClick={() => setViewMode('ISO')}
                className={`p-2 rounded flex items-center gap-2 text-xs font-bold transition-all ${viewMode === 'ISO' ? 'bg-cnc-accent text-black shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                title="Vista Isométrica Simulada"
            >
                <Box size={16} /> <span className="hidden sm:inline">ISO</span>
            </button>
        </div>

        {/* Tool Tip */}
        {tooltip && (
            <div 
                style={{ top: tooltip.y + 15, left: tooltip.x + 15 }} 
                className="absolute bg-zinc-900/95 border border-cnc-accent p-3 rounded shadow-2xl z-50 pointer-events-none text-xs backdrop-blur min-w-[180px] animate-in fade-in zoom-in-95 duration-150"
            >
                <div className="font-bold text-cnc-accent text-sm mb-2 border-b border-zinc-700 pb-1 flex justify-between items-center">
                    <span>{tooltip.tool.name}</span>
                    <span className="text-[10px] bg-zinc-800 px-1 rounded text-zinc-400">T{tooltip.tool.id < 10 ? '0'+tooltip.tool.id : tooltip.tool.id}</span>
                </div>
                <div className="text-zinc-400 space-y-1.5">
                    <div className="flex justify-between items-center">
                        <span>Portaherramienta:</span>
                        <span className="text-white font-mono font-bold text-[10px]">{tooltip.tool.holderMaterial || 'Acero Estándar'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span>Pieza Trabajo:</span>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full border border-white/20" style={{ background: getMaterialColor(stockMaterial) }}></div>
                            <span className="text-white font-mono font-bold">{translateMaterial(stockMaterial)}</span>
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <span>Tipo Inserto:</span>
                        <span className="text-white font-mono font-bold text-[10px]">{tooltip.tool.holderType}</span>
                    </div>
                     <div className="flex justify-between items-center">
                        <span>Desgaste:</span>
                        <span className={`${tooltip.tool.wear > 50 ? 'text-red-500' : 'text-green-500'} font-mono font-bold`}>{tooltip.tool.wear.toFixed(1)}%</span>
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
                    <h3 className="text-xl font-bold text-yellow-500 tracking-widest mb-1">ACCIÓN MANUAL REQUERIDA</h3>
                    <p className="text-zinc-400 text-sm mb-6 uppercase tracking-wide">Por favor confirma el cambio de herramienta</p>
                    
                    <div className="bg-black border border-zinc-800 p-4 mb-6 rounded text-left">
                        <div className="text-xs text-zinc-500 font-mono mb-1">HERRAMIENTA SOLICITADA</div>
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
                        CONFIRMAR Y RESUMIR
                    </button>
                </div>
            </div>
        )}
    </div>
  );
}