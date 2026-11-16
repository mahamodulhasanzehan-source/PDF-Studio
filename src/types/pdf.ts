export type ToolMode =
  | 'select'
  | 'hand'
  | 'text'
  | 'draw'
  | 'highlighter'
  | 'shape'
  | 'eraser'
  | 'redact'
  | 'image'
  | 'eyedropper';

export type ShapeKind = 'line' | 'arrow' | 'rect' | 'ellipse';

export type ViewMode = 'vertical' | 'grid';

export interface Point {
  x: number;
  y: number;
}

export interface DrawingAnnotation {
  id: string;
  page: number;
  points: Point[];
  color: string;
  strokeWidth: number;
  opacity: number;
  isHighlighter?: boolean;
}

export interface ShapeAnnotation {
  id: string;
  page: number;
  kind: ShapeKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  fillColor?: string;
  strokeWidth: number;
  opacity: number;
}

export interface TextBoxAnnotation {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  fontFamily: 'Helvetica' | 'Times-Roman' | 'Courier' | 'Arial' | 'Georgia';
  fontWeight: 'normal' | 'bold';
  color: string;
  textAlign: 'left' | 'center' | 'right';
  lineHeight: number;
  isOriginalExtracted?: boolean;
  maskOriginalText?: boolean;
  maskColor?: string;
  maskRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface RedactionAnnotation {
  id: string;
  page: number;
  points?: Point[];
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor: string;
  opacity: number;
  label?: string;
}

export interface ImageAnnotation {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  dataUrl: string;
  mimeType: 'image/png' | 'image/jpeg';
}

export interface ExtractedTextItem {
  id: string;
  page: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
}

export interface AnnotationsState {
  drawings: DrawingAnnotation[];
  shapes: ShapeAnnotation[];
  textboxes: TextBoxAnnotation[];
  redactions: RedactionAnnotation[];
  images: ImageAnnotation[];
}

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageItem {
  id: string;
  pdfPageNum: number;
  label: string;
}

export interface HistoryEntry {
  pages: PageItem[];
  annotations: AnnotationsState;
  pageRotations: Record<number, number>;
  globalRotation: number;
  crops?: Record<number, CropBox>;
  pageInverts?: Record<number, boolean>;
  globalInvert?: boolean;
  trueRedaction?: boolean;
  description: string;
}

export interface PageDimension {
  pageNumber: number;
  width: number;
  height: number;
  originalRotation: number;
}
