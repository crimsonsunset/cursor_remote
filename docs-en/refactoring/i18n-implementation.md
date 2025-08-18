# i18n Implementation for Server-side Logs and Messages

*Complete implementation guide for internationalizing the cursor_remote server application*

## 📋 Project Context

**Problem**: The server codebase contains hardcoded Chinese text in console logs, error messages, and user feedback across 33+ files, making it difficult for English-speaking developers to understand system status and debug issues.

**Solution**: Implement proper internationalization (i18n) using the `i18n-node` library with a top-level configuration system.

## 🎯 Implementation Strategy

### **Phase 1: Setup & Configuration** 

#### 1.1 Install Dependencies
```bash
cd server/
npm install i18n --save
```

#### 1.2 Create Top-Level Configuration
Add locale configuration to root `package.json`:
```json
{
  "name": "cursor-remote-root",
  "version": "1.0.0",
  "config": {
    "locale": "en",
    "supportedLocales": ["en", "zh"]
  }
}
```

#### 1.3 Create Language Files
```
server/
├── locales/
│   ├── en.json    # English translations (default)
│   └── zh.json    # Chinese originals
```

**Translation Structure** (Type-based organization):
```json
{
  "info": {
    "server_starting": "🔄 CursorRemote Auto-Restart Monitor Starting...",
    "connection_established": "✅ Supabase connection established",
    "monitoring_active": "👁️ Service monitoring active"
  },
  "errors": {
    "connection_failed": "❌ Supabase connection failed",
    "subscription_error": "🔄 Subscription error detected",
    "restart_required": "⚠️ Service restart required"
  },
  "warnings": {
    "degraded_mode": "⚠️ Service entering degraded mode",
    "retry_attempt": "🔄 Retry attempt {{count}} of {{max}}"
  },
  "debug": {
    "command_received": "📨 Command received: {{command}}",
    "processing_time": "⏱️ Processing time: {{duration}}ms"
  }
}
```

### **Phase 2: Core Files Implementation**

#### 2.1 Priority Implementation Order (6 Core Files)
1. **`auto-restart.js`** - Auto-restart monitoring messages
2. **`src/services/supabaseService.js`** - Connection and error messages  
3. **`connection-monitor.js`** - Health check and monitoring logs
4. **`src/controllers/commandController.js`** - Command processing feedback
5. **`start.js`** - Server startup messages
6. **`src/services/errorRecoveryService.js`** - Error handling messages

#### 2.2 i18n Configuration Template
Create `server/src/config/i18n-config.js`:
```javascript
import i18n from 'i18n';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read locale from root package.json
const packageJson = JSON.parse(
  readFileSync(path.join(__dirname, '../../../package.json'), 'utf8')
);

i18n.configure({
  locales: packageJson.config.supportedLocales || ['en', 'zh'],
  defaultLocale: packageJson.config.locale || 'en',
  directory: path.join(__dirname, '../locales'),
  objectNotation: true,
  updateFiles: false,
  syncFiles: false
});

export default i18n;
```

#### 2.3 Usage Pattern
**Before (Chinese hardcoded):**
```javascript
console.log('🔄 CursorRemote 自动重启监控器启动中...');
console.error('❌ Supabase连接失败:', error);
```

**After (i18n implemented):**
```javascript
import i18n from './src/config/i18n-config.js';

console.log(i18n.__('info.server_starting'));
console.error(i18n.__('errors.connection_failed'), error);
```

### **Phase 3: Advanced Implementation**

#### 3.1 Dynamic Message Support
For messages with variables:
```javascript
// Template: "🔄 Retry attempt {{count}} of {{max}}"
console.log(i18n.__('warnings.retry_attempt', { count: 3, max: 5 }));
```

#### 3.2 Locale Switching at Runtime
Add utility function in `server/src/utils/locale-manager.js`:
```javascript
import i18n from '../config/i18n-config.js';

export function switchLocale(locale) {
  if (i18n.getLocales().includes(locale)) {
    i18n.setLocale(locale);
    return true;
  }
  return false;
}

export function getCurrentLocale() {
  return i18n.getLocale();
}
```

#### 3.3 Configuration Management
Allow runtime locale changes by updating root `package.json`:
```javascript
// In server startup or admin endpoint
import { writeFileSync, readFileSync } from 'fs';

function updateLocaleConfig(newLocale) {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  packageJson.config.locale = newLocale;
  writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
}
```

## 🔄 Implementation Phases

### **Phase 1: Foundation ✅ COMPLETE**
- [x] Install i18n-node
- [x] Update root package.json with locale config  
- [x] Create locales directory and initial JSON files
- [x] Setup i18n-config.js

### **Phase 2: Core Files ✅ PARTIAL (6/10 files)**
**COMPLETED:**
- [x] Convert auto-restart.js (PARTIAL - only 6 messages of 55+ converted)
- [x] Convert connection-monitor.js (PARTIAL - only 4 messages of 19+ converted)
- [x] Convert start.js (PARTIAL - only 8 messages of 9 total)
- [x] Convert errorRecoveryService.js (suggestions only)
- [x] Convert commandController.js (comments only)
- [x] Convert supabaseService.js (comments only)

**REMAINING HIGH PRIORITY:**
- [ ] Complete auto-restart.js (49 remaining Chinese console.log statements)
- [ ] Complete connection-monitor.js (15 remaining Chinese console.log statements)
- [ ] Convert start-stable.js (21 Chinese console.log statements - NEVER TOUCHED)
- [ ] Convert monitor-service.js (24 Chinese console.log statements - NEVER TOUCHED)

### **Phase 3: Runtime Message Conversion (CURRENT PHASE)**
**Status**: Currently server still shows Chinese because we only converted ~20% of runtime messages

**Remaining Console.log Statements by File:**
- auto-restart.js: 49 remaining (out of 55 total)
- connection-monitor.js: 15 remaining (out of 19 total)  
- start-stable.js: 21 remaining (UNTOUCHED)
- monitor-service.js: 24 remaining (UNTOUCHED)
- start.js: 1 remaining (exit message)

**Total Chinese console.log statements remaining: ~110 HIGH PRIORITY**

### **Phase 4: Debug/Testing Files**
- [ ] test-subscription-fix.js (34 Chinese statements)
- [ ] test-heartbeat.js (21 Chinese statements)
- [ ] subscription-diagnostic.js (26 Chinese statements)  
- [ ] fix-stuck-commands.js (31 Chinese statements)
- [ ] debug-jest-exit.js (10 Chinese statements)

**Total: ~122 DEBUG PRIORITY statements**

### **Phase 5: Comments Translation (FINAL PHASE)**
- [ ] Convert Chinese comments to English across all server files
- [ ] Convert Chinese variable names and function names if any
- [ ] Update documentation comments

## 📊 Current Status Summary

**CRITICAL ISSUE**: Server still displays Chinese because our Phase 2 was incomplete!

- **Total Chinese console.log statements**: 242
- **Converted so far**: ~12 (5%)
- **Remaining HIGH PRIORITY**: ~110 runtime messages
- **Remaining DEBUG PRIORITY**: ~122 testing/diagnostic messages
- **Phase 1**: ✅ Complete (i18n framework working)
- **Phase 2**: ❌ Incomplete (only 5% of console messages converted)
- **Phase 3**: 🚧 URGENT - Complete runtime message conversion
- **Phase 4**: ⏳ Pending - Debug/testing files  
- **Phase 5**: ⏳ Pending - Comments

## 🎯 Next Steps (Phase 3 Implementation Plan)

### **3.1: Expand Translation Files**
Add comprehensive message categories to locales:
- Runtime status messages
- Performance monitoring 
- Error diagnostics
- Service lifecycle messages
- Health check reports

### **3.2: Complete High Priority Files**
1. Complete auto-restart.js (49 remaining messages)
2. Complete connection-monitor.js (15 remaining messages)
3. Convert start-stable.js (21 messages - CRITICAL, likely what user is running)
4. Convert monitor-service.js (24 messages)
5. Fix remaining start.js message (1 message)

### **3.3: Validation & Testing**
- [ ] Test both English and Chinese modes with COMPLETE message coverage
- [ ] Verify locale switching works for ALL 242 messages
- [ ] Update existing tests to handle i18n
- [ ] Document usage patterns for future developers

**TARGET**: Eliminate ALL Chinese runtime logs (Phase 3) before moving to debug files (Phase 4) or comments (Phase 5).

## 🎯 Success Criteria

1. **Default English**: All server logs display in English by default
2. **Chinese Support**: `config.locale = "zh"` switches to Chinese
3. **No Breaking Changes**: All functionality remains identical
4. **Developer Friendly**: Clear patterns for future i18n additions
5. **Runtime Switching**: Ability to change locale without restart

## 🔧 Configuration Control

**To switch to Chinese:**
```json
// package.json
"config": {
  "locale": "zh"
}
```

**To switch to English:**
```json
// package.json  
"config": {
  "locale": "en"
}
```

## 📚 References

- **i18n-node Documentation**: https://github.com/mashpie/i18n-node
- **Translation Management**: All Chinese strings extracted from existing code
- **Testing**: Existing server functionality must remain unchanged
- **Future Expansion**: Framework ready for additional languages

---

*This implementation will make the cursor_remote server accessible to English-speaking developers while maintaining full Chinese language support.*
