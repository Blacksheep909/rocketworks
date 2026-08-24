/**
 * Small, explicit shell copy catalog for the browser workbench.
 *
 * Engineering labels and model explanations remain English until a complete
 * translated catalog exists. Keeping the catalog typed prevents a locale
 * switch from silently producing empty controls or changing any model text.
 */

export type UiLocale = "en" | "es";

export const UI_LOCALES: readonly UiLocale[] = ["en", "es"];

export type UiCopyKey =
  | "brandTagline"
  | "searchActions"
  | "display"
  | "beginner"
  | "expert"
  | "templates"
  | "export"
  | "runEstimate"
  | "experienceMode"
  | "vehicle"
  | "componentsAndStages"
  | "add"
  | "workspaceView"
  | "design"
  | "flight"
  | "designVisualizationMode"
  | "twoD"
  | "threeDSkeleton"
  | "threeDFinal"
  | "twoDView"
  | "azimuth"
  | "sideProfile"
  | "dimensionsMillimetres"
  | "accessibilityEyebrow"
  | "accessibilityTitle"
  | "accessibilityDescription"
  | "reduceMotionTitle"
  | "reduceMotionDescription"
  | "highContrastTitle"
  | "highContrastDescription"
  | "interfaceLanguage"
  | "english"
  | "spanish"
  | "exportDestinationTitle"
  | "exportDestinationDescription"
  | "browserDownloadDestination"
  | "saveDialogDestination"
  | "browserDownloadWarningTitle"
  | "browserDownloadWarningDescription"
  | "switchToSaveDialog"
  | "browserDownloadConfirm"
  | "keyboardAccess"
  | "close"
  | "accessibilityNote"
  | "openAccessibility"
  | "chooseTemplate"
  | "showGuide"
  | "hideGuide"
  | "traceSample"
  | "traceNoSelection"
  | "traceOf"
  | "traceSeconds";

export type UiCopy = Readonly<Record<UiCopyKey, string>>;

const ENGLISH_COPY: UiCopy = {
  brandTagline: "Aerospace workbench · Mission systems",
  searchActions: "Search actions",
  display: "Display",
  beginner: "Beginner",
  expert: "Expert",
  templates: "Templates",
  export: "Export",
  runEstimate: "Run estimate",
  experienceMode: "Experience mode",
  vehicle: "Vehicle",
  componentsAndStages: "Components & stages",
  add: "+ Add",
  workspaceView: "Workspace view",
  design: "Design",
  flight: "Flight",
  designVisualizationMode: "Design visualization mode",
  twoD: "2D",
  threeDSkeleton: "3D skeleton",
  threeDFinal: "3D final",
  twoDView: "2D VIEW",
  azimuth: "AZIMUTH",
  sideProfile: "Side profile",
  dimensionsMillimetres: "Dimensions in millimetres",
  accessibilityEyebrow: "Workbench preferences",
  accessibilityTitle: "Display & accessibility",
  accessibilityDescription: "Tune the presentation for your workspace. These settings stay on this device and never change engineering inputs, simulation fingerprints, or exported artifacts.",
  reduceMotionTitle: "Reduce interface motion",
  reduceMotionDescription: "Minimize transitions and animated feedback, independent of your operating-system preference.",
  highContrastTitle: "High-contrast controls",
  highContrastDescription: "Increase panel borders, focus rings, field contrast, and status legibility for low-light or low-vision workspaces.",
  interfaceLanguage: "Interface language",
  english: "English",
  spanish: "Español",
  exportDestinationTitle: "Export destination",
  exportDestinationDescription: "Choose Ask where to save to keep exports out of Downloads unless you select a folder. The automatic browser option sends every export to the browser's configured Downloads folder. If a save dialog is unavailable, RocketWorks asks before using that fallback.",
  browserDownloadDestination: "Automatic browser Downloads",
  saveDialogDestination: "Ask where to save (recommended)",
  browserDownloadWarningTitle: "Automatic Downloads is enabled",
  browserDownloadWarningDescription: "Each export will be placed in your browser's Downloads folder without asking. Switch to Ask where to save to choose a location for every artifact.",
  switchToSaveDialog: "Switch to save dialog",
  browserDownloadConfirm: "Automatic Downloads sends every RocketWorks export to your browser's Downloads folder. Continue?",
  keyboardAccess: "Keyboard access",
  close: "Close",
  accessibilityNote: "Engineering outputs remain subject to their stated model limits. A presentation preference cannot make an unvalidated estimate flight-safe.",
  openAccessibility: "Open display and accessibility settings",
  chooseTemplate: "Choose a template",
  showGuide: "How to read CG / CP",
  hideGuide: "Hide guide",
  traceSample: "Trace sample",
  traceNoSelection: "Use the slider or point at the chart",
  traceOf: "of",
  traceSeconds: "seconds",
};

const SPANISH_COPY: UiCopy = {
  brandTagline: "Banco de trabajo aeroespacial · Sistemas de misión",
  searchActions: "Buscar acciones",
  display: "Pantalla",
  beginner: "Principiante",
  expert: "Experto",
  templates: "Plantillas",
  export: "Exportar",
  runEstimate: "Ejecutar estimación",
  experienceMode: "Modo de experiencia",
  vehicle: "Vehículo",
  componentsAndStages: "Componentes y etapas",
  add: "+ Añadir",
  workspaceView: "Vista del espacio de trabajo",
  design: "Diseño",
  flight: "Vuelo",
  designVisualizationMode: "Modo de visualización del diseño",
  twoD: "2D",
  threeDSkeleton: "3D esqueleto",
  threeDFinal: "3D final",
  twoDView: "VISTA 2D",
  azimuth: "ACIMUT",
  sideProfile: "Perfil lateral",
  dimensionsMillimetres: "Dimensiones en milímetros",
  accessibilityEyebrow: "Preferencias del banco",
  accessibilityTitle: "Pantalla y accesibilidad",
  accessibilityDescription: "Ajusta la presentación para tu espacio de trabajo. Estos ajustes permanecen en este dispositivo y nunca cambian las entradas de ingeniería, las huellas de simulación ni los artefactos exportados.",
  reduceMotionTitle: "Reducir movimiento de la interfaz",
  reduceMotionDescription: "Minimiza las transiciones y la respuesta animada, independientemente de la preferencia del sistema operativo.",
  highContrastTitle: "Controles de alto contraste",
  highContrastDescription: "Aumenta los bordes de paneles, los anillos de enfoque, el contraste de campos y la legibilidad de estados para espacios oscuros o usuarios con baja visión.",
  interfaceLanguage: "Idioma de la interfaz",
  english: "English",
  spanish: "Español",
  exportDestinationTitle: "Destino de exportación",
  exportDestinationDescription: "Elige Preguntar dónde guardar para mantener las exportaciones fuera de Descargas hasta seleccionar una carpeta. La opción automática del navegador envía cada exportación a su carpeta Descargas configurada. Si no hay diálogo disponible, RocketWorks pregunta antes de usar ese recurso.",
  browserDownloadDestination: "Descargas automáticas del navegador",
  saveDialogDestination: "Preguntar dónde guardar (recomendado)",
  browserDownloadWarningTitle: "Las descargas automáticas están activadas",
  browserDownloadWarningDescription: "Cada exportación se colocará en la carpeta Descargas del navegador sin preguntar. Cambia a Preguntar dónde guardar para elegir una ubicación para cada artefacto.",
  switchToSaveDialog: "Cambiar al diálogo de guardado",
  browserDownloadConfirm: "Las descargas automáticas envían cada exportación de RocketWorks a la carpeta Descargas del navegador. ¿Continuar?",
  keyboardAccess: "Acceso por teclado",
  close: "Cerrar",
  accessibilityNote: "Los resultados de ingeniería siguen sujetos a sus límites de modelo declarados. Una preferencia visual no convierte una estimación no validada en segura para vuelo.",
  openAccessibility: "Abrir ajustes de pantalla y accesibilidad",
  chooseTemplate: "Elegir una plantilla",
  showGuide: "Cómo leer CG / CP",
  hideGuide: "Ocultar guía",
  traceSample: "Muestra de traza",
  traceNoSelection: "Usa el control deslizante o apunta al gráfico",
  traceOf: "de",
  traceSeconds: "segundos",
};

export function getUiCopy(locale: UiLocale): UiCopy {
  return locale === "es" ? SPANISH_COPY : ENGLISH_COPY;
}
