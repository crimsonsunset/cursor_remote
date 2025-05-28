# Epic-3 - Story-3.1

Validate End-to-End Command Flow (Supabase)

**As a** developer/QA
**I want** to verify that commands sent via Supabase are correctly received and processed by the Node.js server
**so that** I can confirm the core communication channel is working.

## Status

Draft

## Context

{
- This story is crucial for validating the migration from Redis to Supabase for the primary command pathway.
- It involves an end-to-end test: client submits command -> Supabase -> Node.js server receives and acknowledges processing.
- Focus is on the reception and initial processing part by the server.
}

## Estimation

Story Points: {TBD}

## Tasks

{
1. - [ ] Prepare a test command on the client.
2. - [ ] Send the command from the client to the Supabase `commands` table (as per US2.2).
3. - [ ] Monitor the Node.js server logs/debug output to confirm it subscribes to and receives the new command from Supabase (as per US1.3).
4. - [ ] Verify the server updates the command status to 'processing' in the Supabase `commands` table (as per US1.4).
5. - [ ] Document the test steps and observed outcomes.
6. - [ ] Test with various simple command types if applicable.
}

## Constraints

- Assumes client (US2.x) and server (US1.x) Supabase integration basics are in place.
- This is not about full AppleScript execution yet, but about the Supabase-to-server pipeline.

## Data Models / Schema

- `commands` table schema.

## Structure

- Test procedure, possibly with test scripts or manual steps.

## Diagrams

{
(Placeholder for a sequence diagram of the test flow)
}

## Dev Notes

- Pay attention to `created_at` timestamps and `status` changes in the `commands` table to trace the flow.
- This story primarily validates the server's ability to pick up commands.

## Chat Command Log

{
(Placeholder)
}

## Examples

<example>
(Placeholder for a valid rule application example)
</example> 