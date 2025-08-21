# 🚀 Cursor Remote - Development Guide

## Quick Start

### 🎯 One Command to Rule Them All

```bash
# Start everything (kills existing processes, starts fresh, watches files)
npm run dev

# Or alternatively:
npm start
```

### 🛑 Stop Everything

```bash
npm run stop
```

## What `npm run dev` Does

1. **🧹 Cleanup**: Kills any existing processes on port 8080 and Node.js servers
2. **🚀 Start Client**: HTTP server on `http://localhost:8080`
3. **⚙️ Start Server**: Node.js service for Supabase communication
4. **🌐 Open Browser**: Automatically opens `http://localhost:8080` in your default browser
5. **👀 Watch Files**: Automatically restarts on file changes:
   - **Client files**: `client/**/*.{js,html,css}` → restarts HTTP server
   - **Server files**: `server/**/*.js` → restarts Node.js server

## Development Workflow

```bash
# 1. Start development
npm run dev

# 2. Make changes to any files
# → Automatically restarts relevant services

# 3. Test in browser: http://localhost:8080

# 4. Stop when done
npm run stop
# Or just Ctrl+C
```

## Console Output

The dev script provides colored output to help you track what's happening:

- 🟢 **Green**: Startup messages
- 🔵 **Blue**: File change notifications  
- 🟡 **Yellow**: Process restarts/stops
- 🔴 **Red**: Errors
- 🟦 **Cyan**: Client HTTP server logs
- 🟣 **Magenta**: Node.js server logs

## Files Being Watched

- `client/app.js` - Main application logic
- `client/index.html` - HTML structure  
- `client/styles.css` - Styling
- `client/env-config.js` - Configuration
- `server/src/services/supabaseService.js` - Backend service
- All other JS/HTML/CSS files in those directories

## Troubleshooting

### Port Already in Use
The script automatically kills processes on port 8080, but if you get errors:
```bash
npm run stop
npm run dev
```

### Processes Won't Die
Nuclear option:
```bash
sudo lsof -ti:8080 | xargs kill -9
pkill -f "supabaseService.js"
```

### File Changes Not Detected
Make sure you're editing files in the correct directories:
- Client files: `client/`
- Server files: `server/`

## Manual Testing

If you need to test individual components:

```bash
# Test client only
cd client && python3 -m http.server 8080

# Test server only  
cd server && node src/services/supabaseService.js

# Test syntax
node -c client/app.js
```

---

**🎯 Happy coding!** The setup handles all the boring process management so you can focus on features.
