export enum MachineState {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  ALARM = 'ALARM'
}

export interface GCodeCommand {
  type: 'G' | 'M' | 'T' | 'S' | 'F' | 'COMMENT';
  code?: number;
  params: Record<string, number>;
  raw: string;
  line: number;
}

export interface SimulationState {
  x: number;
  z: number;
  feedRate: number;
  spindleSpeed: number;
  spindleDirection: 'CW' | 'CCW' | 'STOP';
  tool: number;
  activeToolOffset: number; // Current Length Offset Value (G43/G44)
  toolRadiusComp: 'OFF' | 'LEFT' | 'RIGHT'; // G40/G41/G42 Status
  coolant: boolean;
  path: { x: number; z: number; type: 'cut' | 'rapid' }[];
}

export interface Lesson {
  id: string;
  title: string;
  module: number;
  content: string; // Markdown supported
  defaultCode: string;
}

export interface ToolConfig {
  id: number;
  name: string;
  type: 'general' | 'grooving' | 'threading';
  color: string;
  width: number;
  lengthOffset: number; // Default length offset for this tool
}