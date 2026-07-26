import test from "node:test";
import assert from "node:assert/strict";
import { buildCodeGenerationPrompt } from "./agent.js";

test("buildCodeGenerationPrompt isolates app requirements from agent execution context", () => {
  const prompt = buildCodeGenerationPrompt(
    "Build a blue landing page for the user's app",
    "src/components/Background.tsx",
    "Update src/main.tsx to import and render Background component"
  );

  assert.match(prompt.systemInstruction, /STRICT USER UI FOCUS/i);
  assert.match(prompt.systemInstruction, /NO AGENT META-UI/i);
  assert.match(prompt.systemInstruction, /Sovereign Pipeline/i);
  assert.match(prompt.userContent, /\[APPLICATION SPECIFICATION\]/i);
  assert.match(prompt.userContent, /User Goal: Build a blue landing page for the user's app/i);
  assert.match(prompt.userContent, /Target File: src\/components\/Background\.tsx/i);
  assert.match(prompt.userContent, /Internal Step Focus: Update src\/main\.tsx to import and render Background component/i);
  assert.match(prompt.userContent, /DO NOT wrap the component in mock agent dashboards or status wrappers/i);
});
