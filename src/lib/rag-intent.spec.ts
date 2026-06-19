import { classifyIntent, extractWorkoutType } from "./rag-intent";

describe("classifyIntent", () => {
  it("prioritizes workout creation requests", () => {
    const result = classifyIntent("Create a push workout for chest and shoulders");

    expect(result.intent).toBe("workout_request");
    expect(result.needsWorkoutCreation).toBe(true);
    expect(result.detectedMuscles).toEqual(expect.arrayContaining(["chest", "shoulders"]));
  });

  it("detects exercise aliases and metrics in progress questions", () => {
    const result = classifyIntent("How is my bench press 1RM and volume progressing?");

    expect(result.intent).toBe("progress_check");
    expect(result.detectedExercises).toContain("bench-press");
    expect(result.detectedMetrics).toEqual(expect.arrayContaining(["volume", "1rm"]));
  });

  it("classifies comparison, advice, recommendation, and general messages", () => {
    expect(classifyIntent("Compare my squat vs deadlift").intent).toBe("comparison");
    expect(classifyIntent("Any tips for breaking a deadlift plateau?").intent).toBe("advice");
    expect(classifyIntent("What should I train today?").intent).toBe("workout_request");
    expect(classifyIntent("What is progressive overload?").intent).toBe("general");
  });
});

describe("extractWorkoutType", () => {
  it("extracts common workout split names", () => {
    expect(extractWorkoutType("full body workout")).toBe("full_body");
    expect(extractWorkoutType("pull day")).toBe("pull");
    expect(extractWorkoutType("arm day")).toBe("arms");
    expect(extractWorkoutType("mobility only")).toBeNull();
  });
});
