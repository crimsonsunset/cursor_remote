# Epic-1 - Story-1.7
Server - Error Handling for Script Execution

**As a** Node.js服务器应用
**I want** 妥善处理AppleScript执行过程中可能发生的各种错误（例如，脚本找不到、执行超时、Cursor应用无响应、脚本内部错误等），并将具体的错误信息记录到`results.error_message`和`commands.last_error`中，同时设置`results.is_error`为TRUE，并将`commands.status`更新为'error'
**so that** 错误信息能够被准确记录和传递，方便问题排查和用户反馈。

## Status

Draft

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
1. - [ ] Review existing AppleScript execution logic in the Node.js server.
2. - [ ] Identify potential error sources during AppleScript interaction (e.g., `child_process` errors, script errors, timeouts).
3. - [ ] Implement comprehensive try-catch blocks or promise rejection handling around AppleScript calls.
4. - [ ] When an error is caught:
   1. - [ ] Format a descriptive error message.
   2. - [ ] Store this message in `results.error_message` (as per US1.5 logic for errors).
   3. - [ ] Set `results.is_error` to TRUE.
   4. - [ ] Store the same (or a summarized) error message in `commands.last_error` (as per US1.6 logic for errors).
   5. - [ ] Update `commands.status` to 'error'.
5. - [ ] Ensure that even if AppleScript execution fails, the server doesn't crash and proceeds to record the error state in Supabase.
6. - [ ] Add specific logging for AppleScript execution errors.
}

## Constraints

- Must capture a meaningful error message that can help in diagnosing the issue.
- Server must remain stable even if AppleScript execution fails.
- Adherence to PRD-US7Srv.

## Data Models / Schema

- Writes error information to `results.error_message`, `results.is_error` (US1.2, PRD 4.1.2).
- Writes error information to `commands.last_error` and updates `commands.status` (US1.1, PRD 4.1.1).

## Structure

- Impacts the server logic in the Node.js application, specifically within the `cursor_controller.js` (or equivalent module) that handles AppleScript execution.

## Diagrams

```mermaid
graph TD
    A[Receive Command] --> B{Attempt AppleScript Execution};
    B -- Success --> C[Process Result Normally (US1.5, US1.6)];
    B -- Failure/Error --> D[Catch Error];
    D --> E[Format Error Message];
    E --> F[Store Error in 'results' table (is_error=TRUE)];
    F --> G[Update 'commands' status to 'error' & store in last_error];
```

## Dev Notes

- Consider standardizing error codes or types if a wide variety of AppleScript errors are anticipated, though for now, descriptive messages are key.
- Timeouts for AppleScript execution should be implemented if not already present, to prevent indefinite hangs.

## Chat Command Log

{
- User: Generate user stories according to the template.
- Agent: Processing US1.7...
} 