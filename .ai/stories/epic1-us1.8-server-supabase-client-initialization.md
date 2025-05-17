# Epic-1 - Story-1.8
Server - Supabase Client Initialization

**As a** Node.js服务器应用
**I want** 在启动时能够使用正确的Supabase项目URL和服务角色密钥 (service_role key) 初始化Supabase客户端实例
**so that** 我可以安全地与Supabase后端进行所有必要的数据库操作。

## Status

Completed

## Context

- **Background information**: Foundational step for any server-side Supabase interaction.
- **Current state**: Server may not have Supabase SDK integrated or configured.
- **Story justification**: Ensures the server can connect to the correct Supabase project with the necessary privileges (service_role) for backend operations.
- **Technical context**: Involves importing the Supabase SDK, and using the project URL and service_role key (from environment variables or a config file) to create a Supabase client instance.
- **Relevant history from previous stories**: Prerequisite for US1.3, US1.4, US1.5, US1.6, US1.7.

## Estimation

Story Points: {Story Points (1 SP = 1 day of Human Development = 10 minutes of AI development)}

## Tasks

{
1. - [x] Add Supabase JavaScript SDK (`@supabase/supabase-js`) as a dependency to the Node.js server project (`package.json`).
2. - [x] Install the dependency (`npm install` or `yarn install`).
3. - [x] Determine a secure way to store and access the Supabase Project URL and Service Role Key (e.g., environment variables, `.env` file, configuration management).
4. - [x] Implement logic at server startup to read these credentials.
5. - [x] Use the credentials to initialize the Supabase client instance using `createClient` from the SDK.
6. - [x] Make this client instance available globally or pass it to modules that need to interact with Supabase.
7. - [x] Add a basic check or log message to confirm successful initialization.
8. - [x] Handle potential errors during initialization (e.g., missing credentials).
}

## Constraints

- Service Role Key must be kept secure and not hardcoded into the source code.
- The client must be initialized early in the server startup sequence, before any Supabase-dependent operations are attempted.

## Data Models / Schema

- N/A for this story (it's about client setup, not schema definition).

## Structure

- Impacts the server startup script (e.g., `server.js`) or a dedicated configuration/initialization module in the Node.js application.

## Diagrams

```mermaid
graph TD
    A[Server Starts] --> B[Load Configuration (Supabase URL, Service Key)];
    B --> C[Initialize Supabase Client with Credentials];
    C -- Success --> D[Supabase Client Ready];
    C -- Failure --> E[Log Error/Handle Initialization Failure];
    D --> F[Proceed with Server Operations (e.g., Subscriptions)];
```

## Dev Notes

- Emphasize the use of environment variables for storing sensitive keys like the `service_role` key (e.g., using a `.env` file and the `dotenv` package in Node.js).
- The service_role key grants full bypass of RLS; it should only be used on the server and never exposed to the client.

## Chat Command Log

{
- User: Generate user stories according to the template.
- Agent: Processing US1.8...
} 