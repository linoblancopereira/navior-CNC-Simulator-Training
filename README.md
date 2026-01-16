🏭 SIMULADOR  A CNC DE LINO
Simulador de Torno CNC Interactivo Potenciado por IA
![alt text](https://img.shields.io/badge/Status-Active-success)

![alt text](https://img.shields.io/badge/Stack-React_|_TypeScript_|_Tailwind-blue)

![alt text](https://img.shields.io/badge/AI-Google_Gemini-orange)
Navior CNC Trainer es una plataforma web educativa de última generación diseñada para enseñar programación y operación de Tornos CNC (Control Numérico Computarizado). Combina una estética retro-industrial con física moderna, simulación de materiales realista y asistencia por Inteligencia Artificial.
✨ Características Principales
🖥️ Simulación y Visualización
Intérprete de Código G (ISO/Fanuc): Soporte completo para movimientos lineales (G00/G01), circulares (G02/G03) y ciclos enlatados complejos (G71 Desbaste, G76 Roscado, G75 Ranurado, G74 Taladrado).
Vistas Múltiples: Alterna entre vista Lateral (XZ), Frontal (XY) e Isométrica simulada.
Renderizado de Materiales Realista: Visualización procedimental de texturas para Acero, Aluminio, Madera, Fibra de Carbono, Epoxi y POM (Acetal).
Física de Partículas: Generación de virutas y efectos visuales basados en el tipo de operación y material.
Modo "Trace": Visualización histórica de la ruta de la herramienta para depuración de trayectorias.
🔧 Mecánicas de Herramienta Avanzadas
Sistema de Desgaste Dinámico: Las herramientas sufren desgaste físico basado en la distancia recorrida y la dureza del material.
Deformación Geométrica: Visualiza cómo el desgaste afecta el radio de la nariz y el ancho del inserto en tiempo real.
Gestión de Herramientas: Cambio de herramientas (T0101, T0202, T0303) y comando de mantenimiento (M100) para resetear insertos.
🤖 Integración de Inteligencia Artificial (Google Gemini)
Tutor IA en Tiempo Real: Un chat integrado sensible al contexto para resolver dudas sobre programación CNC.
Puente CAD/CAM: Módulo experimental que permite importar archivos STEP o descripciones en lenguaje natural y generar código G automáticamente.
🎛️ Interfaz de Control
Panel de Operador: Control manual de husillo (CW/CCW), Override de avance (Feed Rate %) y Parada de Emergencia.
Editor de Código: Resaltado de sintaxis para Código G con seguimiento de línea activa.
Lecciones Interactivas: Módulos guiados desde conceptos básicos hasta proyectos finales complejos.
🛠️ Tecnologías Utilizadas
Frontend: React 18, TypeScript, Vite.
Estilos: Tailwind CSS (con efectos CRT/Retro personalizados).
Gráficos: HTML5 Canvas API (Renderizado 2D avanzado).
IA: Google Gemini API (@google/genai).
Iconos: Lucide React.
🚀 Instalación y Uso
Clonar el repositorio:
code
Bash
git clone https://github.com/tu-usuario/navior-cnc-trainer.git
cd navior-cnc-trainer
Instalar dependencias:
code
Bash
npm install
Configurar Variables de Entorno:
Crea un archivo .env en la raíz del proyecto y añade tu API Key de Google Gemini:
code
Env
API_KEY=tu_api_key_aqui
Iniciar el servidor de desarrollo:
code
Bash
npm run dev
🎮 Controles del Simulador
F9: Centrar vista en el material.
F10: Alternar vista de trazo histórico (Trace).
F11/F12: Alternar visualización de trayectorias.
N / J: Atajos rápidos para funciones de edición (simuladas de Aspire).
Mouse: Hover sobre la herramienta para ver estado, material y nivel de desgaste.
🤝 Contribución
Las contribuciones son bienvenidas. Por favor, abre un issue para discutir cambios mayores antes de enviar un pull request.
📄 Licencia
Este proyecto está bajo la Licencia MIT.
Desarrollado con ❤️ y precisión micrométrica.
