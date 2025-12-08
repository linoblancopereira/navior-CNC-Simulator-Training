import { GCodeCommand } from '../types';

/**
 * Parses raw G-Code string into structured commands.
 * Supports multiple commands per line (e.g., "G01 X10 M03")
 */
export const parseGCode = (code: string): GCodeCommand[] => {
  const lines = code.split('\n');
  const commands: GCodeCommand[] = [];

  lines.forEach((line, index) => {
    let cleanLine = line.trim().toUpperCase();
    const commentIndex = cleanLine.indexOf('(');
    
    // Extract comment if exists
    if (commentIndex !== -1) {
      cleanLine = cleanLine.substring(0, commentIndex).trim();
    }
    
    // Remove inline comments starting with ;
    const semiIndex = cleanLine.indexOf(';');
    if (semiIndex !== -1) cleanLine = cleanLine.substring(0, semiIndex).trim();

    if (cleanLine.length === 0) return;

    // Remove all spaces to handle "X 10" or "M 03" correctly
    const content = cleanLine.replace(/\s+/g, '');

    // Regex to find letter+number groups (e.g. G01, X10.5, M3)
    const matches = content.match(/([A-Z])([-+]?[0-9]*\.?[0-9]+)/g);
    
    if (matches) {
      let currentCmd: Partial<GCodeCommand> = { 
        params: {}, 
        line: index + 1, 
        raw: line,
        // Default type G if no explicit command letter is found first
        type: 'G' 
      };
      let hasExplicitType = false;

      matches.forEach(match => {
        const letter = match[0];
        const value = parseFloat(match.substring(1));
        
        // If we encounter a command letter (G, M, T), check if we need to split
        if (['G', 'M', 'T'].includes(letter)) {
          if (hasExplicitType) {
            // We already have a command type for this object, so push it and start a new one
            // This handles cases like "G01 X10 M03" -> splits into G01 and M03
            commands.push(currentCmd as GCodeCommand);
            currentCmd = { params: {}, line: index + 1, raw: line, type: 'G' };
          }
          currentCmd.type = letter as any;
          currentCmd.code = value;
          hasExplicitType = true;
        } else {
          // It's a parameter (X, Z, S, F, etc.)
          if (currentCmd.params) {
            currentCmd.params[letter] = value;
          }
        }
      });

      // Push the final command found in the line
      commands.push(currentCmd as GCodeCommand);
    }
  });

  return commands;
};