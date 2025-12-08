import { Lesson, ToolConfig } from './types';

export const TOOLS: ToolConfig[] = [
  { id: 1, name: "T0101 - Desbaste Ext.", type: 'general', color: '#FFD700', width: 2, lengthOffset: 5.5 },
  { id: 2, name: "T0202 - Ranurado 3mm", type: 'grooving', color: '#00FFFF', width: 3, lengthOffset: 3.0 },
  { id: 3, name: "T0303 - Roscado 60°", type: 'threading', color: '#FF00FF', width: 1, lengthOffset: 8.2 },
];

export const LESSONS: Lesson[] = [
  {
    id: 'intro',
    title: '1. Introducción al CNC',
    module: 1,
    content: `
# ¿Qué es un torno CNC?

El torno es una máquina herramienta utilizada para realizar operaciones de mecanizado, generalmente simétricas respecto a un eje de rotación. Las piezas se montan sobre un mandril que gira, mientras que las herramientas de corte se mueven linealmente.

### Ejes Principales
* **Eje X:** Controla el diámetro. Movimiento perpendicular al eje de rotación.
* **Eje Z:** Controla la longitud. Movimiento paralelo al eje de rotación.

En el simulador a la derecha, verás estos ejes representados.
    `,
    defaultCode: `( PROGRAMA DE EJEMPLO )
G28 U0 W0 (Home)
M30`
  },
  {
    id: 'g00-g01',
    title: '2. Movimientos Básicos (G00/G01)',
    module: 2,
    content: `
# Interpolación Lineal

Existen dos tipos principales de movimiento lineal:

### G00: Posicionamiento Rápido
Se mueve a la máxima velocidad de la máquina sin cortar material.
\`G00 X50 Z2\`

### G01: Interpolación Lineal
Se mueve a una velocidad controlada (Avance F) cortando material.
\`G01 X40 Z-20 F0.2\`

**Ejercicio:** Intenta mover la herramienta al punto de inicio y realizar un cilindrado simple.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0101
N30 G97 S1000 M03
N40 G00 X50 Z2 (Acercamiento rapido)
N50 G01 X45 F0.2 (Posicionar para corte)
N60 G01 Z-30 (Cilindrado)
N70 G00 X60 (Retirada X)
N80 G00 Z2 (Retirada Z)
N90 M30`
  },
  {
    id: 'g02-g03',
    title: '3. Interpolación Circular (G02/G03)',
    module: 2,
    content: `
# Interpolación Circular

Permite mecanizar arcos y radios controlados.

### G02: Arco Sentido Horario (CW)
Mueve la herramienta en un arco a derechas (sentido agujas del reloj).
\`G02 X30 Z-15 R5\`

### G03: Arco Sentido Antihorario (CCW)
Mueve la herramienta en un arco a izquierdas (contra agujas del reloj).
\`G03 X50 Z-25 R10\`

**Parámetros:**
* **X, Z:** Coordenadas del punto final del arco.
* **R:** Radio del arco.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0101
N30 G97 S1000 M03
N40 G00 X0 Z2
N50 G01 Z0 F0.2
N60 G03 X20 Z-10 R10 (Radio convexo)
N70 G01 Z-20
N80 G02 X40 Z-30 R10 (Radio concavo)
N90 G01 X42
N100 G28 U0 W0
N110 M30`
  },
  {
    id: 'g71',
    title: '4. Ciclo de Desbaste (G71)',
    module: 2,
    content: `
# Ciclo G71

El ciclo G71 automatiza el proceso de desbaste longitudinal.

**Sintaxis:**
1. \`G71 U(profundidad) R(retorno)\`
2. \`G71 P(inicio) Q(fin) U(sobremedida X) W(sobremedida Z) F(avance)\`

La máquina calculará automáticamente las pasadas necesarias para llegar al perfil definido entre los bloques P y Q.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0101
N30 G96 S200 M03
N40 G00 X60 Z2
(Inicio Ciclo G71)
N50 G71 U2 R1
N60 G71 P70 Q110 U0.5 W0.1 F0.3
(Perfil de la pieza)
N70 G00 X40
N80 G01 Z-20
N90 X50
N100 Z-40
N110 X60
(Fin del perfil)
N120 G70 P70 Q110 (Ciclo Acabado)
N130 G28 U0 W0
N140 M30`
  }
];