# Skills Development Evaluation Debugging Guide

## Summary of Changes

I've enhanced the evaluation system with comprehensive debugging capabilities to track down why the AI critique isn't displaying. Here's what was fixed:

### 1. **Enhanced chatClient.ts** (API Response Handling)
- Added detailed console logging for every step of the JSON parsing process
- Logs show API response structure, content extraction, markdown detection
- Attempted JSON extraction from text if wrapped (fallback mechanism)
- **Why**: The previous code silently converted JSON parse errors to raw text

### 2. **Improved Assessment Prompts** (SkillsDevelopmentPage.tsx)
- Made JSON formatting requirements more explicit in the prompt
- Added strict instructions: "Do NOT wrap JSON in triple backticks"
- Provided example JSON with actual values instead of placeholders
- **Why**: Free-tier fallback models were likely wrapping JSON in markdown code fences

### 3. **Better System Prompts** (SkillsDevelopmentPage.tsx)
- Enhanced system prompts to emphasize JSON-only responses
- Added explicit instruction about no markdown formatting
- **Why**: Fallback models need stronger guidance than primary models

### 4. **Detailed Error Detection** (SkillsDevelopmentPage.tsx)
- Assessment functions now log response type, structure, and validation errors
- Clear error messages show what failed and why
- **Why**: Previous errors were swallowed, making debugging impossible

---

## How to Debug the Issue

### Step 1: Reproduce the Issue
1. Open SkillsDevelopmentPage
2. Start an activity (Skills learning module)
3. Submit a response to the AI
4. Observe: Is the evaluation showing or is "resubmit for evaluation" message appearing?

### Step 2: Open Browser Console
1. Press **F12** to open Developer Tools
2. Go to **Console** tab
3. Clear any existing logs (⌘K on Mac, Ctrl+K on Windows)
4. Submit another response

### Step 3: Look for Diagnostic Logs

**Good scenario** - you should see logs like:
```
[chatJSON] Response status: 200
[chatJSON] Extracted content length: 452
[chatJSON] Successfully parsed JSON
[Full Assessment] Raw assessment response: {dimensions: Array(3), ...}
[Full Assessment] ✅ Completed: {dimensions: Array(3)}
```

**Problem scenario 1** - JSON parsing failed:
```
[chatJSON] Extracted content length: 215
[chatJSON] After stripping fences: {"dimensions": [...
[chatJSON] ❌ JSON parse error: SyntaxError: Unexpected token...
[Full Assessment] ❌ Received string instead of object: "Please resubmit..."
```

**Problem scenario 2** - Empty or missing content:
```
[chatJSON] Extracted content length: 0
[chatJSON] API error: {...}
```

**Problem scenario 3** - Missing dimensions:
```
[chatJSON] Successfully parsed JSON
[Full Assessment] ❌ Missing or invalid dimensions: {...}
```

---

## Common Issues & Solutions

### Issue 1: "Resubmit for evaluation" appears in the AI's chat message

**Root Cause**: 
- The evaluation request is being treated as a regular chat request
- The AI is not receiving the proper system prompt or JSON formatting instructions
- The fallback model (Groq → Gemini → Cloudflare → OpenRouter → Mistral → DeepSeek) is failing

**What to look for in logs**:
```
[Full Assessment] ❌ Received string instead of object: "resubmit for evaluation..."
```

**Solution**:
1. Check which provider succeeded: Look for `[chatJSON] Response status: 200`
2. If it shows a free-tier provider (Groq, Gemini, etc.), the system prompt may not be applied
3. Try forcing it to use Anthropic Haiku by adding `taskType: 'coding'` (currently only SkillsDevelopmentPage uses free-tier chain)

### Issue 2: "JSON parse error: SyntaxError"

**Root Cause**: 
- AI wrapped JSON in markdown code fences: ````json { ... } ````
- Or JSON is malformed/incomplete

**What to look for in logs**:
```
[chatJSON] Raw content: ````json
{
  "dimensions": [...]
}
````
[chatJSON] ❌ JSON parse error: SyntaxError: Unexpected token `
```

**Solution**:
1. The code already tries to strip markdown fences - this should work now
2. If still failing, it means the API or model is returning broken JSON
3. Force Anthropic: Contact admin to change routing for SkillsDevelopmentPage

### Issue 3: API returns empty content

**Root Cause**:
- `/api/chat` endpoint is failing or returning malformed response
- Network issue or API timeout

**What to look for in logs**:
```
[chatJSON] Extracted content length: 0
[chatJSON] Extracted content preview: (empty)
```

**Solution**:
1. Test the API directly: Go to Network tab in DevTools, look for `/api/chat` request
2. Check if request body includes `system` parameter with assessment prompt
3. Verify response has structure: `{ choices: [{ message: { content: "..." } }] }`

### Issue 4: Assessment works but evaluation modal doesn't show

**Root Cause**:
- Evaluation data is being set but `showEvaluationModal` flag isn't being set to true
- Type mismatch: evaluation result is string instead of SkillsRubricEvaluation object

**What to look for in logs**:
```
[Full Assessment] ✅ Completed: {dimensions: Array(3)}
(but modal doesn't appear)
```

**Solution**:
1. Check if evaluation is being triggered: Search for `[Full Assessment]` logs
2. Check if modal condition passes: Open DevTools > Console and run:
   ```javascript
   // Should show the evaluation data if it was set
   console.log('🔍 Look for evaluation state in Component state')
   ```
3. Verify `showEvaluationModal && evaluationResult` are both truthy

---

## Technical Details

### Evaluation Flow

```
User submits response
    ↓
callOpenAI() - Gets AI response (displays in chat)
    ↓
(Async, non-blocking)
callSkillsRubricAssessmentIncremental() 
    ↓
chatJSON() - Calls /api/chat with evaluation prompt
    ↓
Response parsing - Strips markdown, attempts JSON.parse()
    ↓
Validation - Checks for dimensions array and scores
    ↓
updateSkillsRubricEvaluation() - Saves to database
```

### What Should Happen After User Submits

1. **Immediate** (blocking):
   - AI response appears in chat
   - Input field clears
   - Sending spinner stops

2. **Background** (async, ~2-5 seconds):
   - Evaluation is calculated
   - Database is updated with scores
   - Next user input sees updated evaluation state

3. **When User Clicks "Update Evaluation" or "Complete Session"**:
   - `callSkillsRubricAssessmentFull()` is called
   - Modal shows results (if evaluation succeeded)
   - If evaluation failed: Shows error message in evidence field

---

## Console Commands to Test

Run these in the browser console:

```javascript
// Check if chatJSON is properly logging
console.log('Testing JSON parsing...');

// Check local chat history
console.log('Chat history length:', chatHistory?.length || 'N/A');

// Monitor evaluation state
console.log('Evaluation result:', evaluationResult);
console.log('Show modal?', showEvaluationModal && evaluationResult);

// Manual fetch to test /api/chat
fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Return this JSON: {"test": true}' }],
    system: 'Respond only with JSON',
    page: 'SkillsDevelopmentPage',
    max_tokens: 100
  })
}).then(r => r.json()).then(data => console.log('API Response:', data));
```

---

## Next Steps if Issue Persists

1. **Share Browser Console Output**:
   - Reproduce the issue with DevTools open
   - Right-click console logs → "Save as..." 
   - Share the first evaluation attempt logs

2. **Check API Logs**:
   - Server logs at `/api/chat` should show:
     - Which provider was used (Groq, Gemini, etc.)
     - Request/response structure
     - Any errors

3. **Verify Prompt Delivery**:
   - In Network tab, check `/api/chat` request
   - Look at Request body → `system` field
   - Should contain: "You are an expert AI assessment evaluator..."
   - Should contain: "Do NOT include any markdown code fences"

4. **Test with Specific Provider**:
   - Force Haiku by changing `page: 'VibeCodingPage'` (uses Anthropic directly)
   - See if evaluation works with guaranteed provider
   - If yes: Problem is with fallback chain

---

## Key Files Modified

- `src/lib/chatClient.ts` - Enhanced JSON parsing with logging
- `src/pages/SkillsDevelopmentPage.tsx` - Better error handling in assessment functions
  - Lines 2050-2110: Incremental assessment prompts and error handling
  - Lines 2280-2350: Full assessment prompts and error handling
  - System prompts emphasize JSON-only responses

---

## Rollback if Needed

All changes are backward compatible. The code:
- Only adds logging (no behavior change if parsing succeeds)
- Improves prompts (better guidance, no breaking changes)
- Better error messages (previously silent failures now reported)

To disable debugging logs:
1. Comment out `console.log` statements in `chatClient.ts`
2. Existing functionality will still work

---

## Still Need Help?

Check:
1. Are you seeing `[chatJSON]` logs in console? If not, evaluation isn't being called
2. Do the logs show a specific error? Search this document for that error
3. Is `/api/chat` returning 200 status? Check Network tab
4. Which provider is being used? Look for `_route` in API response

Share:
- Browser console logs (full stack)
- Network tab request/response for `/api/chat`
- Which page/activity triggered the issue
- Screenshot of what the user sees instead of evaluation
