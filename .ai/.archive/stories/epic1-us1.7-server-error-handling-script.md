# Epic-1 - Story-1.7
Server - Error Handling for Script Execution

**As a** Node.js服务器应用
**I want** 妥善处理AppleScript执行过程中可能发生的各种错误（例如，脚本找不到、执行超时、Cursor应用无响应、脚本内部错误等），并将具体的错误信息记录到`results.error_message`和`commands.last_error`中，同时设置`results.is_error`为TRUE，并将`commands.status`更新为'error'
**so that** 错误信息能够被准确记录和传递，方便问题排查和用户反馈。

## Status

Completed

## Context

- **Background information**: Complements US1.5 and US1.6 by focusing specifically on the error path during AppleScript execution.
- **Current state**: Server attempts to execute an AppleScript.
- **Story justification**: Robust error handling is critical for system stability and providing meaningful feedback to the user when things go wrong.
- **Technical context**: Involves try-catch blocks (or equivalent error handling patterns) around AppleScript execution, and then using the error information to populate fields in `results` and `commands` tables via Supabase SDK.
- **Relevant history from previous stories**: This is an elaboration of the error paths within US1.5 and US1.6.

## Estimation

Story Points: {Story Points (1 SP = 1 day of Human Development = 10 minutes of AI development)}

## Tasks

{
1. - [x] Review existing AppleScript execution logic in the Node.js server.
2. - [x] Identify potential error sources during AppleScript interaction (e.g., `child_process` errors, script errors, timeouts).
3. - [x] Implement comprehensive try-catch blocks or promise rejection handling around AppleScript calls.
4. - [x] When an error is caught:
   1. - [x] Format a descriptive error message.
   2. - [x] Store this message in `results.error_message` (as per US1.5 logic for errors). (Note: For direct AppleScript execution failures, this step is bypassed; error is directly logged to `commands.last_error`. For errors reported by AI *after* successful script execution, AI writes to `results.error_message`.
   3. - [x] Set `results.is_error` to TRUE. (Note: Same as above. AI sets this for its errors. For direct AppleScript failures, no `results` entry is created.
   4. - [x] Store the same (or a summarized) error message in `commands.last_error` (as per US1.6 logic for errors).
   5. - [x] Update `commands.status` to 'error'.
5. - [x] Ensure that even if AppleScript execution fails, the server doesn't crash and proceeds to record the error state in Supabase (in the `commands` table).
6. - [x] Add specific logging for AppleScript execution errors.
}

## Constraints

- Must capture a meaningful error message that can help in diagnosing the issue.
- Server must remain stable even if AppleScript execution fails.
- Adherence to PRD-US7Srv.

## Data Models / Schema

- Writes error information to `results.error_message`, `results.is_error` (US1.2, PRD 4.1.2) - Note: This is done by AI for its reported errors.
- Writes error information to `commands.last_error` and updates `commands.status` (US1.1, PRD 4.1.1) - Note: Server does this directly for AppleScript execution failures, or based on AI-populated `results` data.

## Structure

- Impacts the server logic in the Node.js application, specifically within the `cursor_controller.js` (or equivalent module) that handles AppleScript execution.

## Diagrams

```mermaid
graph TD
    A[Receive Command] --> B{Attempt AppleScript Execution};
    B -- Success --> C[Await AI Result from 'results' table (US1.5, US1.6)];
    C -- AI Reports Success in 'results' --> CS[Update 'commands' status to 'completed'];
    C -- AI Reports Error in 'results' --> CE[Update 'commands' status to 'error' & last_error from 'results'];
    B -- Script Execution Failure/Error --> D[Catch Error by Server];
    D --> E[Format Error Message];
    E --> G[Update 'commands' status to 'error' & store in last_error (Bypasses 'results' table for this type of error)];
```

## Dev Notes

- Consider standardizing error codes or types if a wide variety of AppleScript errors are anticipated, though for now, descriptive messages are key.
- Timeouts for AppleScript execution should be implemented if not already present, to prevent indefinite hangs. (Implemented in commandController.js)
- **Implementation Clarification**: For simplicity, direct AppleScript execution failures (e.g., script not found, osascript error, timeout before AI can write to results) are handled by the server by directly updating the `commands` table to an 'error' state with the relevant error message in `last_error`. No separate error entry is created in the `results` table by the server in these cases. If the AppleScript runs successfully but the AI encounters an issue performing the task or writing to the database, the AI is responsible for creating an error entry in the `results` table, which the server then uses to update the `commands` table.

## Chat Command Log

{
- User: Generate user stories according to the template.
- Agent: Processing US1.7...
} 