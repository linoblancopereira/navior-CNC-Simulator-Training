
import { Lesson, ToolConfig } from './types';

export const TOOLS: ToolConfig[] = [
  { 
    id: 1, 
    name: "T0101 - Ext. Roughing", 
    type: 'general', 
    color: '#FFD700', 
    width: 2, 
    lengthOffset: 5.5, 
    noseRadius: 0.8,
    holderMaterial: '4140 Hardened Steel',
    holderType: 'DCLNR 2525M 12',
    wear: 0
  },
  { 
    id: 2, 
    name: "T0202 - Grooving 3mm", 
    type: 'grooving', 
    color: '#00FFFF', 
    width: 3, 
    lengthOffset: 3.0, 
    noseRadius: 0.2,
    holderMaterial: 'Spring Steel',
    holderType: 'MGEHR 2525-3',
    wear: 0
  },
  { 
    id: 3, 
    name: "T0303 - Threading 60°", 
    type: 'threading', 
    color: '#FF00FF', 
    width: 1, 
    lengthOffset: 8.2, 
    noseRadius: 0.1,
    holderMaterial: 'Hardened Steel',
    holderType: 'SER 2525M 16',
    wear: 0
  },
];

export const LESSONS: Lesson[] = [
  {
    id: 'intro',
    title: '1. Introduction to CNC',
    module: 1,
    content: `
# What is a CNC Lathe?

A lathe is a machine tool used to perform machining operations, generally symmetrical with respect to an axis of rotation. Workpieces are mounted on a rotating chuck, while cutting tools move linearly.

### Main Axes
* **X Axis:** Controls the diameter. Movement perpendicular to the axis of rotation.
* **Z Axis:** Controls the length. Movement parallel to the axis of rotation.

In the simulator on the right, you will see these axes represented.
    `,
    defaultCode: `( EXAMPLE PROGRAM )
G28 U0 W0 (Home)
M30`
  },
  {
    id: 'g00-g01',
    title: '2. Basic Movements (G00/G01)',
    module: 2,
    content: `
# Linear Interpolation

There are two main types of linear movement:

### G00: Rapid Positioning
Moves at the machine's maximum speed without cutting material.
\`G00 X50 Z2\`

### G01: Linear Interpolation
Moves at a controlled speed (Feed rate F) cutting material.
\`G01 X40 Z-20 F0.2\`

**Exercise:** Try moving the tool to the start point and performing a simple turning cut.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0101
N30 G97 S1000 M03
N40 G00 X50 Z2 (Rapid approach)
N50 G01 X45 F0.2 (Position for cut)
N60 G01 Z-30 (Turning)
N70 G00 X60 (Retract X)
N80 G00 Z2 (Retract Z)
N90 M30`
  },
  {
    id: 'g02-g03',
    title: '3. Circular Interpolation (G02/G03)',
    module: 2,
    content: `
# Circular Interpolation

Allows machining of controlled arcs and radii.

### G02: Clockwise Arc (CW)
Moves the tool in a right-hand arc (clockwise).
\`G02 X30 Z-15 R5\`

### G03: Counter-Clockwise Arc (CCW)
Moves the tool in a left-hand arc (counter-clockwise).
\`G03 X50 Z-25 R10\`

**Parameters:**
* **X, Z:** Coordinates of the arc end point.
* **R:** Radius of the arc.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0101
N30 G97 S1000 M03
N40 G00 X0 Z2
N50 G01 Z0 F0.2
N60 G03 X20 Z-10 R10 (Convex radius)
N70 G01 Z-20
N80 G02 X40 Z-30 R10 (Concave radius)
N90 G01 X42
N100 G28 U0 W0
N110 M30`
  },
  {
    id: 'g71',
    title: '4. Roughing Cycle (G71)',
    module: 2,
    content: `
# G71 Cycle

The G71 cycle automates the longitudinal roughing process.

**Syntax:**
1. \`G71 U(depth) R(retract)\`
2. \`G71 P(start) Q(end) U(allowance X) W(allowance Z) F(feed)\`

The machine will automatically calculate the passes needed to reach the profile defined between blocks P and Q.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0101
N30 G96 S200 M03
N40 G00 X60 Z2
(Start G71 Cycle)
N50 G71 U2 R1
N60 G71 P70 Q110 U0.5 W0.1 F0.3
(Part Profile)
N70 G00 X40
N80 G01 Z-20
N90 X50
N100 Z-40
N110 X60
(End Profile)
N120 G70 P70 Q110 (Finishing Cycle)
N130 G28 U0 W0
N140 M30`
  },
  {
    id: 'g70',
    title: '5. Finishing Cycle (G70)',
    module: 3,
    content: `
# G70 Finishing Cycle

After performing roughing with G71, G72, or G73, the part remains with an allowance (defined by U and W in the roughing cycle). The G70 cycle is used to perform a single final pass following the programmed contour to remove this allowance.

**Syntax:**
\`G70 P(start) Q(end)\`

* **P:** Block number of the start of the contour.
* **Q:** Block number of the end of the contour.

The G70 cycle uses the same feed (F) and speed (S) programmed within the P-Q contour.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0101 (Roughing)
N30 G96 S200 M03
N40 G00 X60 Z2
(G71 Roughing leaving 0.5mm)
N50 G71 U2 R1
N60 G71 P70 Q110 U0.5 W0.1 F0.25
N70 G00 X40
N80 G01 Z-20
N90 X50
N100 Z-40
N110 X60
(Change to Finishing Tool)
N120 G28 U0 W0
N130 T0303 (Finishing)
N140 G96 S250 M03
N150 G00 X60 Z2
(G70 Cycle)
N160 G70 P70 Q110
N170 G28 U0 W0
N180 M30`
  },
  {
    id: 'g75',
    title: '6. Grooving (G75)',
    module: 3,
    content: `
# G75 Grooving Cycle

The G75 cycle is used to machine grooves on the outer or inner diameter (X-axis). It breaks the chip by retracting the tool periodically.

**Syntax:**
1. \`G75 R(retract)\`
2. \`G75 X(end) Z(end) P(inc. X) Q(inc. Z) F(feed)\`

* **X, Z:** Coordinates of the groove end point.
* **P:** Depth of cut in X (radius) in microns (no decimal point).
* **Q:** Lateral shift in Z in microns.
* **R:** Retraction to break chips.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0202 (Grooving Tool 3mm)
N30 G97 S1000 M03
N40 G00 X52 Z-20
(Start G75 Cycle)
N50 G75 R1
N60 G75 X30 Z-20 P1000 F0.1
N70 G00 X60
N80 G28 U0 W0
N90 M30`
  },
  {
    id: 'g76',
    title: '7. Threading Cycle (G76)',
    module: 4,
    content: `
# G76 Threading Cycle

G76 is the most comprehensive cycle for performing threads in multiple passes.

**Syntax:**
1. \`G76 P(m)(r)(a) Q(min) R(finish)\`
2. \`G76 X(end) Z(end) P(height) Q(first) F(pitch)\`

* **P(mra):** m=repetitions, r=chamfer amount, a=tool angle (60°).
* **X, Z:** Final coordinates of the thread.
* **P(height):** Thread height (microns).
* **F:** Thread pitch (mm).
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0303 (Threading Tool 60deg)
N30 G97 S800 M03
N40 G00 X30 Z5
(G76 Cycle M24x2.0)
(P010060: 1 finish pass, 0 chamfer, 60 deg angle)
N50 G76 P010060 Q100 R0.05
(X=24 - 2.4 = 21.6 approx)
N60 G76 X21.6 Z-25 P1200 Q300 F2.0
N70 G00 X50 Z10
N80 G28 U0 W0
N90 M30`
  },
    {
    id: 'g41-g42',
    title: '8. Radius Compensation (G41/G42)',
    module: 4,
    content: `
# Radius Compensation

The tool tip has a radius (e.g., 0.8mm). When machining cones or arcs, this causes errors if not compensated.

### Commands
* **G40:** Cancel compensation.
* **G41:** Compensation to the LEFT of the material.
* **G42:** Compensation to the RIGHT of the material.

For external turning towards the chuck, **G42** is generally used.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0101 (Radius 0.8)
N30 G96 S200 M03
N40 G00 X100 Z5
(Activate Comp Right G42)
N50 G00 G42 X40 Z2
N60 G01 Z-20 F0.2
N70 G01 X60 Z-40 (Compensated taper)
N80 G01 Z-60
(Deactivate on retract)
N90 G00 G40 X100 Z5
N100 M30`
  },
  {
    id: 'g74',
    title: '9. Deep Drilling (G74)',
    module: 5,
    content: `
# G74 Deep Drilling

Although G74 is used for face grooving, it is commonly used for deep drilling with chip breaking (Peck Drilling) in the Z-axis.

**Syntax:**
\`G74 R(retract)\`
\`G74 Z(depth) Q(delta Z) F(feed)\`

* **Z:** Final depth.
* **Q:** Cut increment (microns).
* **R:** Retract amount.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0202 (Simulated Drill)
N30 G97 S800 M03
N40 G00 X0 Z5 (Position at center)
(Drilling Cycle)
N50 G74 R1
N60 G74 Z-30 Q5000 F0.15
N70 G00 X50 Z10
N80 G28 U0 W0
N90 M30`
  },
  {
    id: 'g72',
    title: '10. Facing Cycle (G72)',
    module: 5,
    content: `
# G72 Cycle (Facing)

Works similarly to G71 but roughs in the transverse direction (X-axis) instead of longitudinal. It is useful for short parts with large diameters or for removing a lot of material from the front face.

**Syntax:**
1. \`G72 W(depth) R(retract)\`
2. \`G72 P(start) Q(end) U(allowance X) W(allowance Z) F(feed)\`

Observe how the tool cuts by moving in X.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0101
N30 G96 S200 M03
N40 G00 X85 Z2
(Facing Cycle G72)
N50 G72 W2 R1
N60 G72 P70 Q100 U0.2 W0.1 F0.25
N70 G00 Z-10
N80 G01 X40
N90 Z-5
N100 X80
N110 G70 P70 Q100 (Finishing)
N120 G28 U0 W0
N130 M30`
  },
  {
    id: 'g04',
    title: '11. Dwell (G04)',
    module: 6,
    content: `
# Dwell G04

The G04 command stops axis movement for a specific time while keeping the spindle turning. It is crucial for cleaning groove bottoms or drilling.

**Syntax:**
\`G04 X(time_seconds)\` or \`G04 P(time_milliseconds)\`

Example: \`G04 X1.5\` pauses movement for 1.5 seconds.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0202 (Grooving)
N30 G97 S800 M03
N40 G00 X52 Z-20
(Simple groove)
N50 G01 X40 F0.05
(Pause at bottom to polish)
N60 G04 X1.0
N70 G00 X52
N80 G28 U0 W0
N90 M30`
  },
  {
    id: 'g96-g97',
    title: '12. Cutting Speed (G96/G97)',
    module: 6,
    content: `
# G96 vs G97

### G97: Fixed RPM
The spindle rotates at constant revolutions (e.g., 1000 RPM) regardless of the diameter. Used in drilling and threading.
\`G97 S1000 M03\`

### G96: Constant Surface Speed (CSS)
The machine adjusts RPM automatically based on the diameter (X) to maintain surface speed (meters/min). Smaller diameter means higher RPM.
\`G96 S200 M03\` (200 m/min)

**Note:** With G96, always limit the maximum speed with **G50**.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0101
(G50 Limit Max RPM to 2000)
N30 G50 S2000
(G96 Activate CSS at 150m/min)
N40 G96 S150 M03
N50 G00 X80 Z2
(As it goes down to X20, RPM will rise)
N60 G01 X20 F0.2
N70 G01 Z-10
(G97 Return to Fixed RPM to retract)
N80 G97 S500
N90 G28 U0 W0
N100 M30`
  },
  {
    id: 'g32',
    title: '13. Manual Threading (G32)',
    module: 7,
    content: `
# Step-by-Step Threading (G32)

Before the G76 cycle, threads were made pass by pass with G32 (or G33). G32 synchronizes the feed with the spindle rotation to create the thread helix.

It requires programming each depth pass manually. It is useful for special threads or complex tapers.

**Syntax:** \`G32 Z(end) F(pitch)\`
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0303 (Threading)
N30 G97 S500 M03
N40 G00 X30 Z5
(Pass 1)
N50 G00 X29.5
N60 G32 Z-20 F2.0 (Cut thread)
N70 G00 X32 (Rapid exit)
N80 Z5 (Return)
(Pass 2)
N90 X29.0
N100 G32 Z-20 F2.0
N110 G00 X32
N120 Z5
N130 M30`
  },
  {
    id: 'tool-wear',
    title: '14. Tool Wear Simulation',
    module: 7,
    content: `
# Tool Wear & M100

Tools degrade over time, affecting finish and dimensions. In this simulator:

1. **Wear:** Increases when cutting hard materials. The tool tip becomes rounded and red.
2. **Reset:** Use **M100** to replace the insert (reset wear to 0%).

**Material Hardness:**
* Steel: High Wear
* Aluminum: Low Wear
* Wood: Very Low Wear

**Exercise:** Run the program and watch the "Tool Wear" indicator increase. Then use M100 to reset it.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0101
N30 G97 S1500 M03
(Cut repeatedly to induce wear)
N40 G00 X50 Z2
N50 G01 Z-50 F0.3
N60 G00 X55 Z2
N70 G01 X45 F0.3
N80 G01 Z-50
N90 G00 X60 Z2
(Reset Wear)
N100 M100 (New Insert)
N110 G28 U0 W0
N120 M30`
  },
  {
    id: 'parting',
    title: '15. Parting Off',
    module: 8,
    content: `
# Parting Operation

Parting is the final operation where the machined part is separated from the bar stock. A grooving tool (blade) is used, cutting past the center (X-1 or X-2).

It is critical to reduce RPM before reaching the center (or use G97) to avoid vibrations or the part being thrown with excessive force.
    `,
    defaultCode: `N10 G28 U0 W0
N20 T0202 (Parting 3mm)
N30 G97 S800 M03
N40 G00 X82 Z-40
(Approach)
N50 G00 X60
(Interrupted cut to break chips)
N60 G75 R1
N70 G75 X-1.0 Z-40 P2000 F0.08
N80 G00 X85
N90 G28 U0 W0
N100 M30`
  },
  {
    id: 'capstone',
    title: '16. Final Project',
    module: 8,
    content: `
# Final Challenge: Special Bolt

Combine what you've learned to manufacture a bolt with a hex head (simulated cylindrical), a grooved neck, and an M20x1.5 thread.

**Operations:**
1. Profile Roughing (G71).
2. Finishing (G70).
3. Relief Grooving (G75).
4. Final Threading (G76).

Analyze the code and run it!
    `,
    defaultCode: `N10 G28 U0 W0
(OP1: Roughing T01)
N20 T0101
N30 G96 S200 M03
N40 G00 X50 Z2
N50 G71 U1.5 R0.5
N60 G71 P70 Q110 U0.4 W0.1 F0.25
N70 G00 X19.8 (Pre-thread diameter)
N80 G01 Z-20 (Thread length)
N90 X30 (Neck)
N100 Z-40
N110 X50 (Head)
N120 G70 P70 Q110 (Finish)
N130 G28 U0 W0

(OP2: Grooving T02)
N140 T0202
N150 G97 S800 M03
N160 G00 X32 Z-20
N170 G75 R0.5
N180 G75 X18 Z-20 P500 F0.08 (Relief groove)
N190 G28 U0 W0

(OP3: Threading T03)
N200 T0303
N210 G97 S600 M03
N220 G00 X22 Z5
N230 G76 P010060 Q50 R0.02
N240 G76 X18.16 Z-18 P920 Q200 F1.5
N250 G28 U0 W0
N260 M30`
  }
];