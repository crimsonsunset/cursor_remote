# Detailed User Stories List

## 📋 Document Information
- **Version**: v2.0 (Integrated version)
- **Source**: Integrated from .ai/user_stories.md and .ai/stories/ directory
- **Update Date**: December 2024
- **Total Stories**: 29 user stories, divided into 4 epics

---

## 📚 Epic Overview

| Epic | Name | Status | Stories | Description |
|------|------|--------|---------|-------------|
| Epic 1 | Backend Core Transformation & Supabase Integration | ✅ Completed | 8 | Server-side Redis to Supabase migration |
| Epic 2 | Client Core Transformation & Supabase Integration | ✅ Completed | 5 | Client communication logic migration |
| Epic 3 | Core Feature Migration Verification & End-to-End Testing | ✅ Completed | 9 | Feature verification and testing |
| Epic 4 | Supabase Infrastructure Configuration & Security Setup | ✅ Completed | 7 | Infrastructure and security configuration |

---

## 🎯 Epic 1: Backend Core Transformation & Supabase Integration

### Objective
Migrate server-side communication logic from Redis to Supabase, implementing command reception, processing status updates, and result storage.

### Components Involved
- Node.js server application
- Supabase database (commands, results tables)
- AppleScript interaction layer

### 📝 User Stories

#### US1.1 - Database Table Structure Creation (commands table)
**As a** developer  
**I need** to create the commands data table in Supabase  
**So that** I can store command information sent from the client

**Acceptance Criteria**:
- [x] Create commands table with all required fields
- [x] Set correct data types and constraints
- [x] Configure id as primary key with auto-generated UUID
- [x] Set created_at automatic timestamp
- [x] status field default value 'pending'

**Technical Details**:
```sql
CREATE TABLE commands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  command_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  user_id UUID,
  raw_command JSONB,
  attempts INTEGER DEFAULT 0,
  last_error TEXT
);
```

---

#### US1.2 - Database Table Structure Creation (results table)
**As a** developer  
**I need** to create the results data table in Supabase  
**So that** I can store command execution result information

**Acceptance Criteria**:
- [x] Create results table with all required fields
- [x] Set command_id foreign key linking to commands table
- [x] Configure is_error boolean field with default FALSE
- [x] Support storing structured raw_result data

**Technical Details**:
```sql
CREATE TABLE results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  command_id UUID NOT NULL REFERENCES commands(id),
  result_text TEXT,
  error_message TEXT,
  is_error BOOLEAN NOT NULL DEFAULT FALSE,
  raw_result JSONB
);
```

---

#### US1.3 - Server Subscribe to New Commands
**As a** server  
**I want** to real-time subscribe to newly created commands with status='pending' in the commands table  
**So that** I can promptly receive and process commands sent by users

**Acceptance Criteria**:
- [x] Use Supabase SDK to establish real-time subscription
- [x] Monitor INSERT operations and records with status='pending'
- [x] Trigger processing flow when receiving new commands
- [x] Handle subscription connection exceptions and reconnection

**Technical Implementation**:
```javascript
// Subscribe to new pending commands
const subscription = supabase
  .channel('commands')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'commands',
    filter: 'status=eq.pending'
  }, handleNewCommand)
  .subscribe();
```

---

#### US1.4 - Server Update Processing Status
**As a** server  
**I want** to update command status to 'processing' after receiving it  
**So that** I can indicate the command is being processed

**Acceptance Criteria**:
- [x] Update status to 'processing' immediately after receiving command
- [x] Record processing start time
- [x] Handle status conflicts under concurrent conditions
- [x] Provide error handling and retry mechanism

**Technical Implementation**:
```javascript
async function updateCommandStatus(commandId, status, error = null) {
  const { data, error: updateError } = await supabase
    .from('commands')
    .update({ 
      status, 
      last_error: error,
      attempts: attempts + 1 
    })
    .eq('id', commandId);
}
```

---

#### US1.5 - Server Store Execution Results
**As a** server  
**I want** to store results in the results table after command execution  
**So that** the client can retrieve execution results

**Acceptance Criteria**:
- [x] Store result_text when execution succeeds
- [x] Store error_message and set is_error=true when execution fails
- [x] Link to correct command_id
- [x] Support storing structured raw_result data

---

#### US1.6 - Server Update Final Status
**As a** server  
**I want** to update command status to 'completed' or 'error' after processing  
**So that** the client knows the command has finished processing

**Acceptance Criteria**:
- [x] Update status to 'completed' on successful execution
- [x] Update status to 'error' on execution failure
- [x] Record error information for failed executions
- [x] Ensure status update atomicity

---

#### US1.7 - Server Error Handling and Recovery
**As a** server  
**I want** comprehensive error handling and recovery mechanisms  
**So that** the system can handle various exception scenarios

**Acceptance Criteria**:
- [x] Handle AppleScript execution exceptions
- [x] Handle Supabase connection issues
- [x] Implement retry mechanisms for transient errors
- [x] Log detailed error information for debugging

---

#### US1.8 - Server Supabase Client Initialization
**As a** server  
**I want** to properly initialize the Supabase client  
**So that** I can reliably communicate with the database

**Acceptance Criteria**:
- [x] Initialize Supabase client with correct configuration
- [x] Use service_role key for full database access
- [x] Test connection on startup
- [x] Handle initialization failures gracefully

---

## 📱 Epic 2: Client Core Transformation & Supabase Integration

### Objective
Migrate client-side communication logic from Redis to Supabase, implementing command sending, status monitoring, and result retrieval.

### Components Involved
- Web client application
- Supabase JavaScript SDK
- User interface components

### 📝 User Stories

#### US2.1 - Client Supabase Client Initialization
**As a** client application  
**I need** to initialize the Supabase client  
**So that** I can communicate with the backend database

**Acceptance Criteria**:
- [x] Initialize Supabase client with project URL and anon key
- [x] Test connection on application startup
- [x] Handle initialization errors gracefully
- [x] Provide connection status feedback

---

#### US2.2 - Client Send Command to Supabase
**As a** user  
**I want** to send commands through the client to Supabase  
**So that** the server can receive and execute them

**Acceptance Criteria**:
- [x] Insert command into commands table with status='pending'
- [x] Capture user input and command metadata
- [x] Handle insertion errors and provide feedback
- [x] Return command ID for tracking

---

#### US2.3 - Client Subscribe to Command Status
**As a** user  
**I want** to monitor my command's execution status in real-time  
**So that** I know when it's processing and completed

**Acceptance Criteria**:
- [x] Subscribe to status changes for specific commands
- [x] Update UI when status changes to 'processing'
- [x] Detect when command reaches 'completed' or 'error' status
- [x] Handle subscription connection issues

---

#### US2.4 - Client Retrieve Command Results
**As a** user  
**I want** to retrieve and display command execution results  
**So that** I can see the output from Cursor

**Acceptance Criteria**:
- [x] Query results table for command results
- [x] Display successful results to user
- [x] Display error messages clearly
- [x] Handle missing or delayed results

---

#### US2.5 - Client Error Display
**As a** user  
**I want** to see clear error messages when commands fail  
**So that** I understand what went wrong

**Acceptance Criteria**:
- [x] Display execution errors from results table
- [x] Show connection and subscription errors
- [x] Provide user-friendly error messages
- [x] Include error recovery suggestions when possible

---

## 🧪 Epic 3: Core Feature Migration Verification & End-to-End Testing

### Objective
Verify that all core functionality works correctly after migration and conduct comprehensive end-to-end testing.

### Components Involved
- Complete system (client + server + database)
- Test scenarios and validation procedures

### 📝 User Stories

#### US3.1 - Tester Core Feature Verification
**As a** tester  
**I will** verify all core features work as expected  
**So that** the migration preserves existing functionality

**Acceptance Criteria**:
- [x] Test chat mode commands
- [x] Test agent mode commands
- [x] Test ask mode commands
- [x] Receive correct results from Cursor

---

#### US3.2 - Tester End-to-End Core Scenario Verification
**As a** tester  
**I will** verify complete flows for all core user scenarios  
**So that** the system runs correctly under the new architecture

**Acceptance Criteria**:
- [x] Test complete flow from command sending to result return
- [x] Verify response times are within acceptable range
- [x] Confirm all interface functions work normally
- [x] Verify data persistence is correct

---

#### US3.3 - Tester Error Scenario Verification
**As a** tester  
**I will** simulate various error conditions  
**So that** I can verify error handling mechanisms work correctly

**Acceptance Criteria**:
- [x] Test AppleScript execution failures
- [x] Test Cursor non-response situations
- [x] Test invalid command handling
- [x] Verify error messages are transmitted correctly

---

#### US3.A - Technical Verification of Command Flow
**As a** technical person  
**I need** to verify the complete technical flow from client to server  
**So that** I can ensure data flow is correct

**Acceptance Criteria**:
- [x] Verify commands table record creation
- [x] Verify status update timing
- [x] Verify results table data writing
- [x] Verify real-time subscription mechanism

---

#### US3.B - Technical Verification of Result Return
**As a** technical person  
**I need** to verify the technical flow of results returning from server to client  
**So that** I can ensure the result delivery mechanism is correct

**Acceptance Criteria**:
- [x] Verify result data format
- [x] Verify real-time push mechanism
- [x] Verify error status transmission
- [x] Verify subscription connection stability

---

#### US3.C - Compare New vs Old System Performance
**As a** technical person  
**I need** to compare performance differences between new and old systems  
**So that** I can evaluate migration effectiveness

**Acceptance Criteria**:
- [x] Compare response times
- [x] Compare stability performance
- [x] Compare error rates
- [x] Evaluate user experience changes

---

#### Additional Testing Stories (from stories directory)

#### US3.D - Verify Command Flow Technical Details
- Verify commands table status change timing
- Verify AppleScript and Cursor interaction
- Confirm error recovery mechanisms

#### US3.E - Verify Result Return Technical Details
- Verify results table data integrity
- Verify real-time subscription performance
- Confirm client state synchronization

#### US3.F - System Comparison Analysis
- Redis vs Supabase performance comparison
- Stability and reliability assessment
- User experience improvement evaluation

---

## 🔧 Epic 4: Supabase Infrastructure Configuration & Security Setup

### Objective
Properly configure Supabase project, establish data tables, and implement preliminary Row Level Security (RLS) policies to meet current stage requirements.

### Components Involved
- Supabase Dashboard/CLI

### 📝 User Stories

#### US4.1 - Developer Create Supabase Project
**As a** developer  
**I need** to create a new project on the Supabase platform  
**So that** I can provide backend services for the application

**Acceptance Criteria**:
- [x] Create project on Supabase cloud platform
- [x] Configure project basic information
- [x] Obtain project URL and API keys
- [x] Configure project settings parameters

---

#### US4.2 - Research RLS Policies
**As a** developer  
**I need** to research Supabase Row Level Security policies  
**So that** I can configure appropriate access control for data tables

**Acceptance Criteria**:
- [x] Understand RLS basic concepts and syntax
- [x] Research differences between anon and authenticated roles
- [x] Design policies suitable for current requirements
- [x] Document policy decisions

---

#### US4.A - Research Authentication Options
**As a** developer  
**I need** to research Supabase authentication options  
**So that** I can prepare for future functionality

**Acceptance Criteria**:
- [x] Understand Supabase Auth functionality
- [x] Evaluate anonymous access vs authenticated access
- [x] Develop authentication integration plan
- [x] Document decision rationale

---

#### US4.3 - Developer Configure Service Role Key
**As a** developer  
**I need** to configure service_role key for the Node.js server  
**So that** the server has necessary database operation permissions

**Acceptance Criteria**:
- [x] Obtain service_role API key
- [x] Configure server environment variables
- [x] Verify permission scope and security
- [x] Test database connection

---

#### US4.4 - Developer Configure Anonymous Key
**As a** developer  
**I need** to configure anon key for the web client  
**So that** the client can perform basic database operations

**Acceptance Criteria**:
- [x] Obtain anon API key
- [x] Configure client code
- [x] Verify permission restrictions
- [x] Test client connection

---

#### US4.5 - Developer Set Commands Table RLS
**As a** developer  
**I need** to set Row Level Security policies for the commands table  
**So that** I can control data access permissions

**Acceptance Criteria**:
- [x] Allow anon role to INSERT new records
- [x] Allow anon role to SELECT own records (or all, based on requirements)
- [x] Allow service_role to UPDATE any records
- [x] Test policy effectiveness

---

#### US4.6 - Developer Set Results Table RLS
**As a** developer  
**I need** to set Row Level Security policies for the results table  
**So that** I can protect execution result data

**Acceptance Criteria**:
- [x] Allow service_role to INSERT new records
- [x] Allow anon role to SELECT related records
- [x] Prevent unauthorized access
- [x] Test policy completeness

---

#### US4.7 - Developer Enable Real-time Features
**As a** developer  
**I need** to enable Supabase real-time features for relevant tables  
**So that** I can support real-time subscriptions and push notifications

**Acceptance Criteria**:
- [x] Enable Realtime for commands table
- [x] Enable Realtime for results table
- [x] Configure subscription permissions
- [x] Test real-time functionality

---

## 📊 Implementation Status Summary

### ✅ Completed Epics
- **Epic 1**: Backend Core Transformation & Supabase Integration (8/8 stories completed)
- **Epic 2**: Client Core Transformation & Supabase Integration (5/5 stories completed)
- **Epic 3**: Core Feature Migration Verification & End-to-End Testing (9/9 stories completed)
- **Epic 4**: Supabase Infrastructure Configuration & Security Setup (7/7 stories completed)

### 📈 Overall Progress
- **Total Stories**: 29
- **Completed**: 29 (100%)
- **Overall Status**: ✅ Migration Complete

### 🎯 Key Achievements
- Successfully replaced Redis Pub/Sub with Supabase real-time database
- Maintained integrity of all existing core functionality
- Enhanced system security, resolved public network exposure issues
- Established structured data storage and query capabilities
- Laid solid foundation for future feature expansion

---

*Document compiled by Product Manager Bill | Last updated: December 2024*
