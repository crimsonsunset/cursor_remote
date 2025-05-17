# Epic-3 - Story-3.2

Validate Result Return Path (Supabase)

**As a** developer/QA
**I want** to verify that AppleScript execution results (via Node.js server) are correctly stored in Supabase and retrieved by the client
**so that** I can confirm the full command-result loop is functional.

## Status

Draft

## Context

{
- This story builds upon US3.1 and tests the return path of information.
- It covers: Node.js server executing a (mock or simple) AppleScript -> storing result in `results` table -> updating `commands` status -> client receiving status and fetching/displaying result.
}

## Estimation

Story Points: {TBD}

## Tasks

{
1. - [ ] Initiate a test command from the client that will trigger a known (simple) AppleScript execution on the server.
2. - [ ] Verify the server executes the script, stores the output in the Supabase `results` table (US1.5), and updates the `commands` table status to 'completed' or 'error' (US1.6).
3. - [ ] Verify the client receives the 'completed'/'error' status update for the command (US2.3).
4. - [ ] Verify the client fetches the corresponding result from the `results` table and displays it (US2.4).
5. - [ ] Test with both a successful script execution and one that intentionally causes an error.
6. - [ ] Document test steps and outcomes, checking data in both `commands` and `results` tables.
}

## Constraints

- Assumes functionalities from Epic 1 and Epic 2 user stories are implemented.
- The AppleScript used for testing can be very simple (e.g., return a fixed string or current date).

## Data Models / Schema

- `commands` table schema.
- `results` table schema.

## Structure

- Test procedure.

## Diagrams

{
(Placeholder for a sequence diagram of the full command-result loop)
}

## Dev Notes

- This is a critical end-to-end test for the core functionality.
- Check `result_text`, `error_message`, and `error_details` fields as appropriate.

## Chat Command Log

{
(Placeholder)
}

## Examples

<example>
(Placeholder for a valid rule application example)
</example> 