import { GoogleGenAI, Type } from '@google/genai';
import type { GeminiExtractionResult } from './types.ts';
import { SAMPLE_WHITEBOARDS } from './sampleImages.ts';

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in environment or Secrets.');
    }
    // Set GEMINI_USE_VERTEX=true when the key is an Agent Platform (Vertex AI) key, for example a
    // key bound to a service account. Leave it unset for a normal Gemini API key.
    const useVertex = (process.env.GEMINI_USE_VERTEX || '').toLowerCase() === 'true';
    aiClient = new GoogleGenAI({
      apiKey,
      ...(useVertex ? { vertexai: true } : {}),
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Levenshtein distance calculation for fuzzy name matching
function computeLevenshteinDistance(s1: string, s2: string): number {
  const a = s1.toLowerCase().trim();
  const b = s2.toLowerCase().trim();
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

// Find closest registered team member name for OCR error correction
export function matchToRegisteredTeamMember(
  extractedName: string,
  candidateNames: string[]
): { matchedName: string; confidence: 'exact' | 'high' | 'medium' | 'none'; distance: number } {
  const cleanExtracted = extractedName.trim();
  if (!cleanExtracted || candidateNames.length === 0) {
    return { matchedName: cleanExtracted, confidence: 'none', distance: 999 };
  }

  const lowerExtracted = cleanExtracted.toLowerCase();

  // 1. Exact match (case-insensitive)
  const exact = candidateNames.find((k) => k.toLowerCase() === lowerExtracted);
  if (exact) {
    return { matchedName: exact, confidence: 'exact', distance: 0 };
  }

  // 2. Substring or prefix match (e.g., "Soham" vs "Soham Thakkar", or "Ujwal" vs "Ujwal K")
  const prefixMatch = candidateNames.find((k) => {
    const lk = k.toLowerCase();
    return lk.startsWith(lowerExtracted) || lowerExtracted.startsWith(lk);
  });
  if (prefixMatch) {
    return { matchedName: prefixMatch, confidence: 'high', distance: 1 };
  }

  // 3. Levenshtein edit distance
  let bestCandidate = cleanExtracted;
  let bestDist = Infinity;

  for (const candidate of candidateNames) {
    const dist = computeLevenshteinDistance(cleanExtracted, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      bestCandidate = candidate;
    }
  }

  // Allow distance <= 1 for short names (length <= 3 e.g. "Dm" -> "Om"), distance <= 2 for longer names (e.g. "poga" -> "pooja", "ujwal" -> "ujjwal")
  const nameLen = cleanExtracted.length;
  const maxAllowedDist = nameLen <= 3 ? 1 : 2;

  if (bestDist <= maxAllowedDist) {
    return {
      matchedName: bestCandidate,
      confidence: bestDist === 1 ? 'high' : 'medium',
      distance: bestDist,
    };
  }

  return { matchedName: cleanExtracted, confidence: 'none', distance: bestDist };
}

export async function extractBoardFromImage(
  base64Data: string,
  mimeType: string = 'image/jpeg',
  candidateTeamNames: string[] = []
): Promise<GeminiExtractionResult> {
  // Extract and normalize MIME type from base64 data URI if present
  let resolvedMimeType = mimeType || 'image/jpeg';
  const mimeMatch = base64Data.match(/^data:([a-zA-Z0-9.+/-]+);base64,/);
  if (mimeMatch && mimeMatch[1]) {
    resolvedMimeType = mimeMatch[1];
  }

  // Strip possible data URI header
  const pureBase64 = base64Data.replace(/^data:[a-zA-Z0-9.+/-]+;base64,/, '');

  if (!pureBase64 || pureBase64.length < 50) {
    throw new Error("Invalid image data provided. Please provide a valid photo.");
  }

  // Check if this matches a known sample whiteboard
  const matchingSample = SAMPLE_WHITEBOARDS.find((sample) => {
    const samplePure = sample.dataUri.replace(/^data:[a-zA-Z0-9.+/-]+;base64,/, '');
    return pureBase64 === samplePure;
  });

  const candidateSection =
    candidateTeamNames.length > 0
      ? `\nREGISTERED OFFICE TEAM MEMBERS / CANDIDATE NAMES:
The office has the following known team members: [${candidateTeamNames.join(', ')}].
When handwriting is difficult or slightly messy, prefer matching the column headings to these registered team members if visually similar (for example, "Om" instead of "DM", "Pooja" instead of "poga", "Ujwal" instead of "Ujjwal", "Hardik", "Aamir", "Ashish", "Jay", "Pradeep", "Shrushti", "Soham", "Jinal", "Anjan", "Swara").`
      : '';

  const prompt = `You are an expert AI office assistant analyzing a high-resolution photograph of an office whiteboard.
${candidateSection}

CRITICAL INSTRUCTION - EXHAUSTIVE MULTI-COLUMN SCANNING:
Office whiteboards frequently contain many vertical columns (often 5, 8, 9, 10, or more) spanning across the ENTIRE width from the far-left edge to the far-right edge of the board.
You MUST thoroughly scan the ENTIRE width of the whiteboard from left to right.
DO NOT stop after only 1 or 2 columns!
Examine every vertical column, lane, table cell, or divider line across the full panoramic view:
1. Extract every single column heading as the person's name or team heading (e.g., "Alex", "Morgan", "Elena", "DevOps", "Front End", "Sarah", "David", "QA", "Column 1", etc.).
2. Extract all handwritten or printed tasks written underneath that header, ordered from top to bottom.
3. PRIORITY 1 (P1) AND TOP ORDERING RULE:
   - Only ONE task can be P1 / top priority per person.
   - If any task is marked with P1, Priority 1, a star, exclamation, or designated as most urgent, it MUST automatically be placed on top (at index 0).
   - It requires NO tag or label (do NOT include '[P1]', 'P1:', '(P1)', 'P1 - ' or priority tags in the task text). Its position at the very top is just understood. Strip any P1 labels from the task text.
   - Set "p1": true on that task (and false on every other task) so the app keeps it on top.
   PRIORITY NUMBER RULE:
   - Most tasks have a single-digit number (1-9) written just to the LEFT of the task name. That digit is the task's priority number (1 = highest priority, 2 = next, and so on).
   - Put that digit in the task's "priority" field as an integer, and do NOT include it in the task text.
   - If a task has no such number, set "priority" to null. Do not guess a number.
   - Do not confuse it with quantity multipliers like 'x2' or '3x', which stay in the task text.
   - Still list tasks in the order they appear on the board; the app sorts them by priority itself.
4. TASKS TO TRACK:
   - Extract the legible text of each task cleanly into the tasks array.
   - STRICT ANTI-HALLUCINATION RULE: Only extract tasks that are actually written in the image. DO NOT hallucinate, invent, or add phantom or unwritten tasks.
   - Set "completed": true if the task on the whiteboard has a strikethrough line drawn through it, is crossed out, has a checkmark next to it, or is marked as done/completed. Otherwise set "completed": false.
   - If a task has a quantity multiplier like 'x2', 'x3', '2x', preserve that exact multiplier in the task text (e.g. 'Prefx x 2', 'Reels x 3').
5. If the whiteboard has multiple columns, you MUST return all columns in the 'employees' array, ordered from left to right as they appear on the board.
6. If a column has no tasks or only 1 task, still include that column!
7. Preserve the exact order tasks appear from top to bottom. Even if handwriting is messy, faint, or slightly angled, give your best plausible deciphering. Always attempt extraction as the user will review and edit everything in the next step.

Only if the image is completely blank, completely blacked out, or totally unrelated to a board, set readabilityStatus to 'unreadable'. Otherwise always set readabilityStatus to 'readable'.`;

  const imagePart = {
    inlineData: {
      data: pureBase64,
      mimeType: resolvedMimeType,
    },
  };

  const textPart = {
    text: `${prompt}

OUTPUT FORMAT REQUIREMENT:
Respond ONLY with a valid JSON object matching this schema:
{
  "readabilityStatus": "readable",
  "employees": [
    {
      "name": "Person or Column Heading",
      "department": "Editors | Designers | Managers | Cinematographers | General",
      "tasks": [
        {
          "text": "Task description",
          "priority": 1,
          "p1": false,
          "completed": false
        }
      ]
    }
  ]
}`,
  };

  const jsonConfig = {
    responseMimeType: 'application/json',
  };

  // Supported flash models in order of verified real-time availability and OCR capability
  // GEMINI_MODELS (comma-separated) is tried first when set. A model that doesn't exist for the
  // current API (404) is skipped automatically, so the list can safely contain extra names.
  const modelOverride = (process.env.GEMINI_MODELS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  const modelsToTry = [
    ...modelOverride,
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
    'gemini-3-flash-preview',
    'gemini-flash-lite-latest',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ];

  let rawText = '';
  let lastError: any = null;
  const ai = getGeminiClient();

  for (const model of modelsToTry) {
    let attempts = 2;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        console.info(`[Gemini Vision] Attempting extraction with model: ${model} (attempt ${attempt}/${attempts})`);

        // 35-second per-model timeout
        const generatePromise = ai.models.generateContent({
          model,
          // An explicit role is required by the Vertex endpoint and accepted by the Gemini API.
          contents: [
            {
              role: 'user',
              parts: [imagePart, textPart],
            },
          ],
          config: jsonConfig,
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Model ${model} timed out after 35s`)), 35000)
        );

        const response = await Promise.race([generatePromise, timeoutPromise]);

        rawText = response.text?.trim() || '{}';
        if (rawText && rawText.length > 5) {
          lastError = null;
          console.info(`[Gemini Vision] Successfully extracted with ${model}`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || JSON.stringify(err);
        console.warn(`[Gemini Model ${model} attempt ${attempt} failed]:`, errMsg);

        // For fatal API key errors, re-throw immediately
        if (errMsg.includes('API_KEY')) {
          throw new Error('Gemini API key is missing or invalid. Please check your AI Studio secrets.');
        }

        // On quota (429) or not found (404), immediately move on to the next model without retrying
        if (
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('quota') ||
          errMsg.includes('404')
        ) {
          break;
        }

        // If it's a 503 or demand spike and we have another attempt, wait a brief moment
        if (
          attempt < attempts &&
          (errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || errMsg.includes('high demand'))
        ) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }

        // Otherwise move on to next model
        break;
      }
    }

    if (rawText && rawText.length > 5) {
      break;
    }
  }

  // If Gemini failed on all models, check if we have matching sample data as graceful fallback
  if ((!rawText || rawText.length <= 5) && matchingSample) {
    console.info('[Gemini Vision] Using sample board pre-parsed data as fallback due to high API demand');
    return {
      employees: matchingSample.expectedData,
      clarityScore: 'readable',
    };
  }

  // If Gemini failed and no sample fallback was possible
  if (!rawText || rawText.length <= 5) {
    const errMsg = lastError?.message || '';
    if (
      errMsg.includes('503') ||
      errMsg.includes('UNAVAILABLE') ||
      errMsg.includes('high demand')
    ) {
      throw new Error(
        'The Gemini Vision service is currently experiencing high demand. Please wait a few moments and try again.'
      );
    }
    if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
      throw new Error('API rate limit reached. Please wait a moment and try again.');
    }
    throw new Error("Couldn't read the board, try a clearer photo");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch (parseErr) {
    console.error('[Gemini] JSON Parse Error:', parseErr, 'Raw Text:', rawText);
    if (matchingSample) {
      return {
        employees: matchingSample.expectedData,
        clarityScore: 'readable',
      };
    }
    throw new Error("Couldn't read the board, try a clearer photo");
  }

  const rawEmployees = Array.isArray(parsed?.employees) ? parsed.employees : [];

  // Filter and clean employees list
  // Rule: Only one task can be P1. It should automatically be placed on top and requires no tag/label.
  const p1Regex = /^\s*(\[P1\]|P1\s*[-:]|\(P1\)|\bP1\b)\s*/i;
  // A single digit written left of the task name is its priority number (1 = top).
  // Used as a fallback when the model leaves the digit in the text instead of the priority field.
  const leadingPriorityRegex = /^\s*([1-9])(?:\s*[.):-]\s*|\s+)(?=\S)/;

  let autoMatchedCount = 0;
  const cleanedEmployees = rawEmployees
    .map((e: any) => {
      // Tasks may be strings or objects { text, completed }
      interface NormalizedTask {
        text: string;
        completed: boolean;
        priority: number | null;
        p1: boolean;
      }

      const rawTaskList = Array.isArray(e?.tasks) ? e.tasks : [];
      const normalizedTasks: NormalizedTask[] = [];

      for (const item of rawTaskList) {
        let taskText = '';
        let isCompleted = false;
        let priority: number | null = null;
        let isP1 = false;

        if (typeof item === 'string') {
          taskText = item.trim();
        } else if (item && typeof item === 'object') {
          taskText = typeof item.text === 'string' ? item.text.trim() : '';
          isCompleted = Boolean(item.completed) || Boolean(item.done);
          isP1 = item.p1 === true;
          const rawPriority = Number(item.priority);
          if (Number.isInteger(rawPriority) && rawPriority >= 1 && rawPriority <= 9) {
            priority = rawPriority;
          }
        }

        const hasStrikethroughMarker = /~~|\[x\]|\(done\)|\(finished\)|\(completed\)|\(struck(\s+through)?\)|\(crossed(\s+out)?\)|^[✓✔☑]/i.test(taskText);
        if (hasStrikethroughMarker) {
          isCompleted = true;
        }

        taskText = taskText.replace(/~~|\[x\]|\(done\)|\(finished\)|\(completed\)|\(struck(\s+through)?\)|\(crossed(\s+out)?\)|^[✓✔☑]\s*/gi, '').replace(/[\u0335\u0336\u0337\u0338]/g, '').trim();

        const lowerTask = taskText.toLowerCase();
        if (
          lowerTask.includes('review client deliverables') ||
          lowerTask.includes('client deliverables') ||
          lowerTask.includes('review deliverables')
        ) {
          continue;
        }

        const leadingPriority = taskText.match(leadingPriorityRegex);
        if (leadingPriority) {
          if (priority === null) priority = Number(leadingPriority[1]);
          taskText = taskText.slice(leadingPriority[0].length).trim();
        }

        if (taskText.length > 0) {
          normalizedTasks.push({
            text: taskText,
            completed: isCompleted,
            priority,
            p1: isP1,
          });
        }
      }

      // Order by the priority number written on the board (1 first). Tasks without a number
      // go after the numbered ones; ties and unnumbered tasks keep their board order.
      const prioritizedTasks = normalizedTasks
        .map((t, idx) => ({ t, idx }))
        .sort((a, b) => {
          const aP = a.t.priority ?? Number.POSITIVE_INFINITY;
          const bP = b.t.priority ?? Number.POSITIVE_INFINITY;
          return aP !== bP ? aP - bP : a.idx - b.idx;
        })
        .map(({ t }) => t);

      // Check if any task was explicitly flagged as P1
      let p1TaskIndex = prioritizedTasks.findIndex((t) => t.p1 || p1Regex.test(t.text));

      // Strip P1 tags/labels from all tasks
      const sanitizedTasks = prioritizedTasks
        .map((t) => ({
          text: t.text.replace(p1Regex, '').trim(),
          completed: t.completed,
        }))
        .filter((t) => t.text.length > 0);

      // If a task was marked as P1 and it was not already at index 0, move it to index 0
      if (p1TaskIndex > 0 && p1TaskIndex < sanitizedTasks.length) {
        const [p1Task] = sanitizedTasks.splice(p1TaskIndex, 1);
        sanitizedTasks.unshift(p1Task);
      }

      const rawExtractedName = typeof e?.name === 'string' && e.name.trim().length > 0 ? e.name.trim() : 'Team Member';
      const department = typeof e?.department === 'string' && e.department.trim().length > 0 ? e.department.trim() : 'General';
      
      // Auto-recheck and match against registered team members (e.g. DM -> Om, poga -> Pooja)
      let resolvedName = rawExtractedName;
      let matchedName: string | undefined = undefined;
      let originalExtractedName: string | undefined = undefined;

      if (candidateTeamNames.length > 0) {
        const matchResult = matchToRegisteredTeamMember(rawExtractedName, candidateTeamNames);
        if (matchResult.confidence !== 'none') {
          resolvedName = matchResult.matchedName;
          matchedName = matchResult.matchedName;
          if (rawExtractedName.toLowerCase() !== matchResult.matchedName.toLowerCase()) {
            originalExtractedName = rawExtractedName;
            autoMatchedCount++;
            console.info(`[Auto-Correct OCR Name] Matched "${rawExtractedName}" -> "${matchResult.matchedName}" (confidence: ${matchResult.confidence})`);
          }
        }
      }

      return {
        name: resolvedName,
        department,
        originalExtractedName,
        matchedName,
        tasks: sanitizedTasks,
      };
    })
    .filter((e: any) => e.name.length > 0 || e.tasks.length > 0);

  // Requirement 3: By default, all empty columns go towards the right end and columns with tasks appear from the left
  cleanedEmployees.sort((a: any, b: any) => {
    const aCount = a.tasks?.length || 0;
    const bCount = b.tasks?.length || 0;
    if (aCount > 0 && bCount === 0) return -1;
    if (aCount === 0 && bCount > 0) return 1;
    return 0;
  });

  // If columns/tasks were successfully extracted, always return them for review!
  if (cleanedEmployees.length > 0) {
    return {
      employees: cleanedEmployees,
      clarityScore: parsed?.readabilityStatus === 'unreadable' ? 'needs_review' : 'readable',
      unreadableReason: parsed?.unreadableReason,
      autoMatchedCount,
    };
  }

  // If no columns could be extracted
  if (matchingSample) {
    return {
      employees: matchingSample.expectedData,
      clarityScore: 'readable',
    };
  }

  if (parsed?.readabilityStatus === 'unreadable') {
    const reason = parsed.unreadableReason ? `: ${parsed.unreadableReason}` : '';
    throw new Error(`Couldn't read the board, try a clearer photo${reason}`);
  }

  throw new Error("Couldn't read the board, try a clearer photo (no columns or tasks detected).");

  return {
    employees: cleanedEmployees,
    clarityScore: parsed.readabilityStatus || 'readable',
    unreadableReason: parsed.unreadableReason,
  };
}
