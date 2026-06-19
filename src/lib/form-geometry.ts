import type { NormalizedLandmark } from "../types/mediapipe";
import type { FormRuleView, PrimaryMetricPhaseLogic } from "../types";

export function calculateAngle2D(
  landmarks: NormalizedLandmark[],
  aIdx: number,
  bIdx: number,
  cIdx: number,
): number {
  const A = landmarks[aIdx];
  const B = landmarks[bIdx];
  const C = landmarks[cIdx];

  if (!A || !B || !C) return -1;

  const radians = Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360 - angle;
  return angle;
}

export function calculateAngle3D(
  landmarks: NormalizedLandmark[],
  aIdx: number,
  bIdx: number,
  cIdx: number,
): number {
  const A = landmarks[aIdx];
  const B = landmarks[bIdx];
  const C = landmarks[cIdx];

  if (!A || !B || !C) return -1;

  const BA = { x: A.x - B.x, y: A.y - B.y, z: (A.z ?? 0) - (B.z ?? 0) };
  const BC = { x: C.x - B.x, y: C.y - B.y, z: (C.z ?? 0) - (B.z ?? 0) };

  const dot = BA.x * BC.x + BA.y * BC.y + BA.z * BC.z;
  const magBA = Math.sqrt(BA.x ** 2 + BA.y ** 2 + BA.z ** 2);
  const magBC = Math.sqrt(BC.x ** 2 + BC.y ** 2 + BC.z ** 2);

  if (magBA === 0 || magBC === 0) return -1;

  const cosAngle = Math.min(1, Math.max(-1, dot / (magBA * magBC)));
  return (Math.acos(cosAngle) * 180.0) / Math.PI;
}

export function getLandmarkVisibility(landmarks: NormalizedLandmark[], indices: number[]): number {
  return indices.reduce((minVisibility, index) => {
    const landmark = landmarks[index];
    const visibility = landmark?.visibility ?? 0;
    return Math.min(minVisibility, visibility);
  }, 1);
}

export function areLandmarksVisible(
  landmarks: NormalizedLandmark[],
  indices: number[],
  threshold: number,
): boolean {
  return getLandmarkVisibility(landmarks, indices) >= threshold;
}

export function checkSymmetry(
  landmarks: NormalizedLandmark[],
  leftPoints: [number, number, number],
  rightPoints: [number, number, number],
): number {
  const leftAngle = calculateAngle2D(landmarks, leftPoints[0], leftPoints[1], leftPoints[2]);
  const rightAngle = calculateAngle2D(landmarks, rightPoints[0], rightPoints[1], rightPoints[2]);

  if (leftAngle < 0 || rightAngle < 0) return -1;
  return Math.abs(leftAngle - rightAngle);
}

export function getSymmetryChecks(landmarks: NormalizedLandmark[]): Record<string, number> {
  const elbowSym = checkSymmetry(landmarks, [11, 13, 15], [12, 14, 16]);
  const kneeSym = checkSymmetry(landmarks, [23, 25, 27], [24, 26, 28]);
  const hipLevel = landmarks[23] && landmarks[24] ? Math.abs(landmarks[23].y - landmarks[24].y) : -1;
  const shoulderLevel = landmarks[11] && landmarks[12] ? Math.abs(landmarks[11].y - landmarks[12].y) : -1;

  return {
    elbowSymmetry: elbowSym,
    kneeSymmetry: kneeSym,
    hipLevel,
    shoulderLevel,
  };
}

export function checkSpinalAlignment(landmarks: NormalizedLandmark[]): number {
  if (!landmarks[11] || !landmarks[12] || !landmarks[23] || !landmarks[24]) return -1;

  const shoulderMid = {
    x: (landmarks[11].x + landmarks[12].x) / 2,
    y: (landmarks[11].y + landmarks[12].y) / 2,
  };
  const hipMid = {
    x: (landmarks[23].x + landmarks[24].x) / 2,
    y: (landmarks[23].y + landmarks[24].y) / 2,
  };

  const angle = Math.atan2(hipMid.y - shoulderMid.y, hipMid.x - shoulderMid.x);
  let degrees = Math.abs((angle * 180) / Math.PI);
  if (degrees > 90) degrees = 180 - degrees;
  return degrees;
}

export type CameraViewStatus = "good" | "front-view" | "back-view" | "too-far" | "not-detected";

export function detectCameraAngle(
  landmarks: NormalizedLandmark[],
  expectedView: FormRuleView = "side",
): CameraViewStatus {
  const nose = landmarks[0];
  const lShoulder = landmarks[11];
  const rShoulder = landmarks[12];
  const lHip = landmarks[23];
  const rHip = landmarks[24];

  if (!nose || !lShoulder || !rShoulder || !lHip || !rHip) return "not-detected";

  const bodyHeight = Math.abs(nose.y - ((lHip.y + rHip.y) / 2));
  if (bodyHeight < 0.15) return "too-far";

  const shoulderWidth = Math.abs(lShoulder.x - rShoulder.x);

  if (expectedView === "front" && shoulderWidth < 0.12) return "front-view";
  if (expectedView === "side" && shoulderWidth > 0.22) return "front-view";
  if (expectedView === "three_quarter" && (shoulderWidth < 0.12 || shoulderWidth > 0.26)) return "front-view";

  return "good";
}

export interface LandmarkSmootherOptions {
  positionAlpha?: number;
  visibilityAlpha?: number;
  visibilityDecay?: number;
  lowConfidenceThreshold?: number;
}

export class LandmarkSmoother {
  private previous: NormalizedLandmark[] | null = null;
  private readonly positionAlpha: number;
  private readonly visibilityAlpha: number;
  private readonly visibilityDecay: number;
  private readonly lowConfidenceThreshold: number;

  constructor(options: LandmarkSmootherOptions = {}) {
    this.positionAlpha = options.positionAlpha ?? 0.55;
    this.visibilityAlpha = options.visibilityAlpha ?? 0.45;
    this.visibilityDecay = options.visibilityDecay ?? 0.82;
    this.lowConfidenceThreshold = options.lowConfidenceThreshold ?? 0.55;
  }

  smooth(landmarks: NormalizedLandmark[]): NormalizedLandmark[] {
    if (!this.previous) {
      this.previous = landmarks.map((landmark) => ({ ...landmark }));
      return this.previous.map((landmark) => ({ ...landmark }));
    }

    const next = landmarks.map((landmark, index) => {
      const prev = this.previous?.[index];
      if (!prev) return { ...landmark };
      const currentVisibility = landmark.visibility ?? 0;
      const previousVisibility = prev.visibility ?? 0;
      const positionAlpha = currentVisibility < this.lowConfidenceThreshold
        ? this.positionAlpha * 0.45
        : this.positionAlpha;
      const nextVisibility = currentVisibility >= previousVisibility
        ? (currentVisibility * this.visibilityAlpha) + (previousVisibility * (1 - this.visibilityAlpha))
        : Math.max(currentVisibility, previousVisibility * this.visibilityDecay);

      return {
        ...landmark,
        x: (landmark.x * positionAlpha) + (prev.x * (1 - positionAlpha)),
        y: (landmark.y * positionAlpha) + (prev.y * (1 - positionAlpha)),
        z: ((landmark.z ?? 0) * positionAlpha) + ((prev.z ?? 0) * (1 - positionAlpha)),
        visibility: Math.max(0, Math.min(1, nextVisibility)),
      };
    });

    this.previous = next.map((landmark) => ({ ...landmark }));
    return next;
  }

  reset(): void {
    this.previous = null;
  }
}

interface RepTrackerState {
  lastAngle: number | null;
  phase: "unknown" | "eccentric" | "concentric";
  reachedStart: boolean;
  reachedEnd: boolean;
  lastRepTime: number;
}

export class TempoTracker {
  private state: RepTrackerState = {
    lastAngle: null,
    phase: "unknown",
    reachedStart: false,
    reachedEnd: false,
    lastRepTime: 0,
  };

  private readonly cooldownMs = 350;
  private readonly hysteresis = 10;

  checkRep(
    angle: number,
    minAngle: number,
    maxAngle: number,
    phaseLogic: PrimaryMetricPhaseLogic = "flexion_extension",
  ): boolean {
    const now = performance.now();
    const angleDelta = this.state.lastAngle === null ? 0 : angle - this.state.lastAngle;
    this.state.lastAngle = angle;

    if (Math.abs(angleDelta) < 0.9) return false;

    const movingTowardMin = phaseLogic === "flexion_extension" || phaseLogic === "cyclic"
      ? angleDelta < 0
      : phaseLogic === "extension_flexion"
        ? angleDelta > 0
        : angleDelta < 0;

    this.state.phase = movingTowardMin ? "eccentric" : "concentric";

    const nearMin = angle <= (minAngle + this.hysteresis);
    const nearMax = angle >= (maxAngle - this.hysteresis);

    if (nearMin) this.state.reachedStart = true;
    if (nearMax && this.state.reachedStart) this.state.reachedEnd = true;

    if (
      this.state.reachedStart
      && this.state.reachedEnd
      && this.state.phase === "concentric"
      && now - this.state.lastRepTime > this.cooldownMs
    ) {
      this.state.reachedStart = false;
      this.state.reachedEnd = false;
      this.state.lastRepTime = now;
      return true;
    }

    return false;
  }

  reset(): void {
    this.state = {
      lastAngle: null,
      phase: "unknown",
      reachedStart: false,
      reachedEnd: false,
      lastRepTime: 0,
    };
  }
}

export class JitterDetector {
  private history: Record<number, Array<{ x: number; y: number; z: number }>> = {};

  constructor(
    private readonly maxFrames = 15,
    private readonly jitterThreshold = 0.005,
  ) {}

  addFrame(landmarks: NormalizedLandmark[]): void {
    for (let i = 0; i < landmarks.length; i += 1) {
      const landmark = landmarks[i];
      if (!landmark) continue;
      if (!this.history[i]) this.history[i] = [];
      this.history[i].push({ x: landmark.x, y: landmark.y, z: landmark.z ?? 0 });
      if (this.history[i].length > this.maxFrames) {
        this.history[i].shift();
      }
    }
  }

  getJitteryJoints(): Map<number, number> {
    const result = new Map<number, number>();

    for (const [idxStr, positions] of Object.entries(this.history)) {
      if (positions.length < 5) continue;
      const idx = parseInt(idxStr, 10);
      const variance = this.calculateVariance(positions);
      const jitterScore = Math.min(1, variance / (this.jitterThreshold * 10));

      if (variance > this.jitterThreshold) {
        result.set(idx, jitterScore);
      }
    }

    return result;
  }

  getAverageVariance(indices: number[]): number {
    const variances = indices
      .map((index) => this.history[index])
      .filter((positions): positions is Array<{ x: number; y: number; z: number }> => Boolean(positions && positions.length >= 5))
      .map((positions) => this.calculateVariance(positions));

    if (variances.length === 0) return 0;
    return variances.reduce((sum, value) => sum + value, 0) / variances.length;
  }

  private calculateVariance(positions: Array<{ x: number; y: number; z: number }>): number {
    const n = positions.length;
    const meanX = positions.reduce((sum, point) => sum + point.x, 0) / n;
    const meanY = positions.reduce((sum, point) => sum + point.y, 0) / n;

    let totalVar = 0;
    for (const point of positions) {
      totalVar += (point.x - meanX) ** 2 + (point.y - meanY) ** 2;
    }

    return totalVar / n;
  }

  reset(): void {
    this.history = {};
  }
}

export function projectLandmark(
  landmark: NormalizedLandmark,
  canvasWidth: number,
  canvasHeight: number,
  sourceWidth?: number,
  sourceHeight?: number,
  mirrorX = true,
): { x: number; y: number } {
  const baseWidth = sourceWidth && sourceWidth > 0 ? sourceWidth : canvasWidth;
  const baseHeight = sourceHeight && sourceHeight > 0 ? sourceHeight : canvasHeight;
  const scale = Math.max(canvasWidth / baseWidth, canvasHeight / baseHeight);
  const renderedWidth = baseWidth * scale;
  const renderedHeight = baseHeight * scale;
  const offsetX = (canvasWidth - renderedWidth) / 2;
  const offsetY = (canvasHeight - renderedHeight) / 2;

  return {
    x: ((mirrorX ? 1 - landmark.x : landmark.x) * renderedWidth) + offsetX,
    y: (landmark.y * renderedHeight) + offsetY,
  };
}

export function projectAllLandmarks(
  landmarks: NormalizedLandmark[],
  canvasWidth: number,
  canvasHeight: number,
  sourceWidth?: number,
  sourceHeight?: number,
  mirrorX = true,
): Array<{ x: number; y: number } | null> {
  return landmarks.map((landmark) => (
    landmark
      ? projectLandmark(landmark, canvasWidth, canvasHeight, sourceWidth, sourceHeight, mirrorX)
      : null
  ));
}

export const POSE_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  [11, 12],
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22],
  [11, 23], [12, 24],
  [23, 24],
  [23, 25], [25, 27], [27, 29], [27, 31],
  [24, 26], [26, 28], [28, 30], [28, 32],
];
