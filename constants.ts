import { Lesson, ToolConfig } from './types';

export const TOOLS: ToolConfig[] = [
  { 
    id: 1, 
    name: "T0101 - Desbaste Ext.", 
    type: 'general', 
    color: '#FFD700', 
    width: 2, 
    lengthOffset: 5.5, 
    noseRadius: 0.8,
    holderMaterial: 'Acero Endurecido 4140',
    holderType: 'DCLNR 2525M 12',
    wear: 0
  },
  { 
    id: 2, 
    name: "T0202 - Ranurado 3mm", 
    type: 'grooving', 
    color: '#00FFFF', 
    width: 3, 
    lengthOffset: 3.0, 
    noseRadius: 0.2,
    holderMaterial: 'Acero para Resortes',
    holderType: 'MGEHR 2525-3',
    wear: 0
  },
  { 
    id: 3, 
    name: "T0303 - Roscado 60°", 
    type: 'threading', 
    color: '#FF00FF', 
    width: 1, 
    lengthOffset: 8.2, 
    noseRadius: 0.1,
    holderMaterial: 'Acero Endurecido',
    holderType: 'SER 2525M 16',
    wear: 0
  },
];

export const LESSONS: Lesson[] = [
  {
    id: 'intro',
    title: '1. Introducción al CNC',
    module: 1,
    content: `
# ¿Qué es un Torno CNC?

Un torno es una máquina herramienta utilizada para realizar operaciones de mecanizado, generalmente simétricas respecto a un eje de rotación. Las piezas se montan en un mandril giratorio, mientras que las herramientas de corte se mueven linealmente.

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
Se mueve a la velocidad máxima de la máquina sin cortar material.
\`G00 X50 Z2\`

### G01: Interpolación Lineal
Se mueve a una velocidad controlada (Avance F) cortando material.
\`G01 X40 Z-20 F0.2\`

**Ejercicio:** Intenta mover la herramienta al punto de inicio y realizar un corte de cilindrado simple.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0101
N30 G97 S1000 M03
N40 G00 X50 Z2 (Aproximación rápida)
N50 G01 X45 F0.2 (Posición de corte)
N60 G01 Z-30 (Cilindrado)
N70 G00 X60 (Retirada en X)
N80 G00 Z2 (Retirada en Z)
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
Mueve la herramienta en un arco a la derecha (sentido agujas del reloj).
\`G02 X30 Z-15 R5\`

### G03: Arco Sentido Antihorario (CCW)
Mueve la herramienta en un arco a la izquierda (sentido contrario agujas).
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
N80 G02 X40 Z-30 R10 (Radio cóncavo)
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
N120 G70 P70 Q110 (Ciclo de Acabado)
N130 G28 U0 W0
N140 M30`
  },
  {
    id: 'g70',
    title: '5. Ciclo de Acabado (G70)',
    module: 3,
    content: `
# Ciclo de Acabado G70

Después de realizar el desbaste con G71, G72 o G73, la pieza queda con una sobremedida (definida por U y W en el ciclo de desbaste). El ciclo G70 se usa para dar una única pasada final siguiendo el contorno programado para eliminar ese exceso.

**Sintaxis:**
\`G70 P(inicio) Q(fin)\`

* **P:** Número de bloque del inicio del contorno.
* **Q:** Número de bloque del final del contorno.

El ciclo G70 utiliza el avance (F) y velocidad (S) programados dentro del contorno P-Q.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0101 (Herramienta Desbaste)
N30 G96 S200 M03
N40 G00 X60 Z2
(Desbaste G71 dejando 0.5mm)
N50 G71 U2 R1
N60 G71 P70 Q110 U0.5 W0.1 F0.25
N70 G00 X40
N80 G01 Z-20
N90 X50
N100 Z-40
N110 X60
(Cambio a Herramienta Acabado)
N120 G28 U0 W0
N130 T0303 (Acabado)
N140 G96 S250 M03
N150 G00 X60 Z2
(Ciclo G70)
N160 G70 P70 Q110
N170 G28 U0 W0
N180 M30`
  },
  {
    id: 'g75',
    title: '6. Ranurado (G75)',
    module: 3,
    content: `
# Ciclo de Ranurado G75

El ciclo G75 se utiliza para mecanizar ranuras en el diámetro exterior o interior (eje X). Realiza rotura de viruta retrayendo la herramienta periódicamente.

**Sintaxis:**
1. \`G75 R(retorno)\`
2. \`G75 X(fin) Z(fin) P(inc. X) Q(inc. Z) F(avance)\`

* **X, Z:** Coordenadas del punto final de la ranura.
* **P:** Profundidad de corte en X (radio) en micras (sin punto decimal).
* **Q:** Desplazamiento lateral en Z en micras.
* **R:** Retracción para romper viruta.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0202 (Ranurador 3mm)
N30 G97 S1000 M03
N40 G00 X52 Z-20
(Inicio Ciclo G75)
N50 G75 R1
N60 G75 X30 Z-20 P1000 F0.1
N70 G00 X60
N80 G28 U0 W0
N90 M30`
  },
  {
    id: 'g76',
    title: '7. Ciclo de Roscado (G76)',
    module: 4,
    content: `
# Ciclo de Roscado G76

G76 es el ciclo más completo para realizar roscas en múltiples pasadas.

**Sintaxis:**
1. \`G76 P(m)(r)(a) Q(min) R(acabado)\`
2. \`G76 X(fin) Z(fin) P(altura) Q(primera) F(paso)\`

* **P(mra):** m=repeticiones, r=bisel salida, a=ángulo herramienta (60°).
* **X, Z:** Coordenadas finales de la rosca.
* **P(altura):** Altura de la rosca (micras).
* **F:** Paso de la rosca (mm).
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0303 (Herramienta Rosca 60°)
N30 G97 S800 M03
N40 G00 X30 Z5
(Ciclo G76 M24x2.0)
(P010060: 1 pasada acabado, 0 bisel, 60 grados)
N50 G76 P010060 Q100 R0.05
(X=24 - 2.4 = 21.6 aprox)
N60 G76 X21.6 Z-25 P1200 Q300 F2.0
N70 G00 X50 Z10
N80 G28 U0 W0
N90 M30`
  },
    {
    id: 'g41-g42',
    title: '8. Compensación de Radio (G41/G42)',
    module: 4,
    content: `
# Compensación de Radio

La punta de la herramienta tiene un radio (ej. 0.8mm). Al mecanizar conos o arcos, esto causa errores si no se compensa.

### Comandos
* **G40:** Cancelar compensación.
* **G41:** Compensación a la IZQUIERDA del material.
* **G42:** Compensación a la DERECHA del material.

Para torneado exterior hacia el plato, generalmente se usa **G42**.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0101 (Radio 0.8)
N30 G96 S200 M03
N40 G00 X100 Z5
(Activar Comp Derecha G42)
N50 G00 G42 X40 Z2
N60 G01 Z-20 F0.2
N70 G01 X60 Z-40 (Cono compensado)
N80 G01 Z-60
(Desactivar al retirar)
N90 G00 G40 X100 Z5
N100 M30`
  },
  {
    id: 'g74',
    title: '9. Taladrado Profundo (G74)',
    module: 5,
    content: `
# Taladrado Profundo G74

Aunque G74 se usa para ranurado frontal, es comúnmente usado para taladrado profundo con rotura de viruta (Peck Drilling) en el eje Z.

**Sintaxis:**
\`G74 R(retorno)\`
\`G74 Z(profundidad) Q(delta Z) F(avance)\`

* **Z:** Profundidad final.
* **Q:** Incremento de corte (micras).
* **R:** Cantidad de retorno.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0202 (Broca Simulada)
N30 G97 S800 M03
N40 G00 X0 Z5 (Posición en centro)
(Ciclo de Taladrado)
N50 G74 R1
N60 G74 Z-30 Q5000 F0.15
N70 G00 X50 Z10
N80 G28 U0 W0
N90 M30`
  },
  {
    id: 'g72',
    title: '10. Ciclo de Refrentado (G72)',
    module: 5,
    content: `
# Ciclo G72 (Refrentado)

Funciona similar al G71 pero desbasta en dirección transversal (eje X) en lugar de longitudinal. Es útil para piezas cortas de gran diámetro o para eliminar mucho material de la cara frontal.

**Sintaxis:**
1. \`G72 W(profundidad) R(retorno)\`
2. \`G72 P(inicio) Q(fin) U(sobremedida X) W(sobremedida Z) F(avance)\`

Observa cómo la herramienta corta moviéndose en X.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0101
N30 G96 S200 M03
N40 G00 X85 Z2
(Ciclo Refrentado G72)
N50 G72 W2 R1
N60 G72 P70 Q100 U0.2 W0.1 F0.25
N70 G00 Z-10
N80 G01 X40
N90 Z-5
N100 X80
N110 G70 P70 Q100 (Acabado)
N120 G28 U0 W0
N130 M30`
  },
  {
    id: 'g04',
    title: '11. Pausa (G04)',
    module: 6,
    content: `
# Pausa (Dwell) G04

El comando G04 detiene el movimiento de los ejes por un tiempo específico manteniendo el husillo girando. Es crucial para limpiar fondos de ranuras o taladrados.

**Sintaxis:**
\`G04 X(tiempo_segundos)\` o \`G04 P(tiempo_milisegundos)\`

Ejemplo: \`G04 X1.5\` pausa el movimiento por 1.5 segundos.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0202 (Ranurado)
N30 G97 S800 M03
N40 G00 X52 Z-20
(Ranura simple)
N50 G01 X40 F0.05
(Pausa en el fondo para pulir)
N60 G04 X1.0
N70 G00 X52
N80 G28 U0 W0
N90 M30`
  },
  {
    id: 'g96-g97',
    title: '12. Velocidad de Corte (G96/G97)',
    module: 6,
    content: `
# G96 vs G97

### G97: RPM Fijas
El husillo gira a revoluciones constantes (ej. 1000 RPM) sin importar el diámetro. Se usa en taladrado y roscado.
\`G97 S1000 M03\`

### G96: Velocidad de Corte Constante (CSS)
La máquina ajusta las RPM automáticamente según el diámetro (X) para mantener la velocidad superficial (metros/min). A menor diámetro, más RPM.
\`G96 S200 M03\` (200 m/min)

**Nota:** Con G96, siempre limita la velocidad máxima con **G50**.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0101
(G50 Limitar Max RPM a 2000)
N30 G50 S2000
(G96 Activar CSS a 150m/min)
N40 G96 S150 M03
N50 G00 X80 Z2
(Al bajar a X20, las RPM subirán)
N60 G01 X20 F0.2
N70 G01 Z-10
(G97 Volver a RPM Fijas para retirar)
N80 G97 S500
N90 G28 U0 W0
N100 M30`
  },
  {
    id: 'g32',
    title: '13. Roscado Manual (G32)',
    module: 7,
    content: `
# Roscado paso a paso (G32)

Antes del ciclo G76, las roscas se hacían pasada por pasada con G32 (o G33). G32 sincroniza el avance con el giro del husillo para crear la hélice de la rosca.

Requiere programar cada pasada de profundidad manualmente. Es útil para roscas especiales o cónicas complejas.

**Sintaxis:** \`G32 Z(fin) F(paso)\`
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0303 (Roscado)
N30 G97 S500 M03
N40 G00 X30 Z5
(Pasada 1)
N50 G00 X29.5
N60 G32 Z-20 F2.0 (Corte rosca)
N70 G00 X32 (Salida rápida)
N80 Z5 (Retorno)
(Pasada 2)
N90 X29.0
N100 G32 Z-20 F2.0
N110 G00 X32
N120 Z5
N130 M30`
  },
  {
    id: 'tool-wear',
    title: '14. Simulación Desgaste Herr.',
    module: 7,
    content: `
# Desgaste de Herramienta y M100

Las herramientas se degradan con el tiempo, afectando el acabado y las dimensiones. En este simulador:

1. **Desgaste:** Aumenta al cortar materiales duros. La punta se redondea y se pone roja.
2. **Reset:** Usa **M100** para cambiar el inserto (resetear desgaste a 0%).

**Dureza del Material:**
* Acero: Alto Desgaste
* Aluminio: Bajo Desgaste
* Madera: Muy Bajo Desgaste

**Ejercicio:** Ejecuta el programa y observa el indicador "Desgaste" subir. Luego usa M100 para resetearlo.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0101
N30 G97 S1500 M03
(Cortar repetidamente para inducir desgaste)
N40 G00 X50 Z2
N50 G01 Z-50 F0.3
N60 G00 X55 Z2
N70 G01 X45 F0.3
N80 G01 Z-50
N90 G00 X60 Z2
(Resetear Desgaste)
N100 M100 (Inserto Nuevo)
N110 G28 U0 W0
N120 M30`
  },
  {
    id: 'parting',
    title: '15. Tronzado',
    module: 8,
    content: `
# Operación de Tronzado

El tronzado es la operación final donde la pieza mecanizada se separa de la barra. Se usa una herramienta de ranurado (lama), cortando pasadas más allá del centro (X-1 o X-2).

Es crítico reducir las RPM antes de llegar al centro (o usar G97) para evitar vibraciones o que la pieza salga despedida con fuerza excesiva.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0202 (Tronzado 3mm)
N30 G97 S800 M03
N40 G00 X82 Z-40
(Aproximación)
N50 G00 X60
(Corte interrumpido para romper viruta)
N60 G75 R1
N70 G75 X-1.0 Z-40 P2000 F0.08
N80 G00 X85
N90 G28 U0 W0
N100 M30`
  },
  {
    id: 'capstone',
    title: '16. Proyecto Final',
    module: 8,
    content: `
# Desafío Final: Perno Especial

Combina lo aprendido para fabricar un perno con cabeza hexagonal (simulada cilíndrica), cuello ranurado y rosca M20x1.5.

**Operaciones:**
1. Desbaste Perfil (G71).
2. Acabado (G70).
3. Ranurado de Alivio (G75).
4. Roscado Final (G76).

¡Analiza el código y ejecútalo!
    `,
    defaultCode: `N10 G28 U0 W0
(OP1: Desbaste T01)
N20 T0101
N30 G96 S200 M03
N40 G00 X50 Z2
N50 G71 U1.5 R0.5
N60 G71 P70 Q110 U0.4 W0.1 F0.25
N70 G00 X19.8 (Diametro pre-rosca)
N80 G01 Z-20 (Longitud rosca)
N90 X30 (Cuello)
N100 Z-40
N110 X50 (Cabeza)
N120 G70 P70 Q110 (Acabado)
N130 G28 U0 W0

(OP2: Ranurado T02)
N140 T0202
N150 G97 S800 M03
N160 G00 X32 Z-20
N170 G75 R0.5
N180 G75 X18 Z-20 P500 F0.08 (Ranura alivio)
N190 G28 U0 W0

(OP3: Roscado T03)
N200 T0303
N210 G97 S600 M03
N220 G00 X22 Z5
N230 G76 P010060 Q50 R0.02
N240 G76 X18.16 Z-18 P920 Q200 F1.5
N250 G28 U0 W0
N260 M30`
  }
];