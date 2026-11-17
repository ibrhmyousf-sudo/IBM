# InnovaDigits Pre-Packaged AI Stack Templates

This directory contains pre-configured `stack.json` templates for standard project types across InnovaDigits projects.

## Quick Setup Guide for Team Members

To activate the AI assistant for any repository, copy the matching template file to `.ai/stack.json` in your workspace root:

### 1. Laravel + Vue.js (HMVC Architecture - like Masr Al Khair)
```bash
cp .ai/templates/stack.laravel-vue-hmvc.json .ai/stack.json
```

### 2. Laravel + React (HMVC Architecture)
```bash
cp .ai/templates/stack.laravel-react-hmvc.json .ai/stack.json
```

### 3. Laravel + Angular
```bash
cp .ai/templates/stack.laravel-angular.json .ai/stack.json
```

### 4. Laravel Monolith (Blade / Livewire)
```bash
cp .ai/templates/stack.laravel-api-blade.json .ai/stack.json
```

### 5. Vue.js Standalone SPA
```bash
cp .ai/templates/stack.vue-standalone.json .ai/stack.json
```

### 6. React Standalone SPA
```bash
cp .ai/templates/stack.react-standalone.json .ai/stack.json
```

### 7. Angular Standalone SPA
```bash
cp .ai/templates/stack.angular-standalone.json .ai/stack.json
```

### 8. .NET 10 Clean Architecture + Angular
```bash
cp .ai/templates/stack.dotnet-angular.json .ai/stack.json
```

### 9. .NET 10 Clean Architecture API only (Minimal APIs, Scalar, Aspire)
```bash
cp .ai/templates/stack.dotnet-clean-architecture.json .ai/stack.json
```
Rules: `.ai/rules/01-backend/dotnet/`. Audit: `node bin/dotnet-audit.js --strict`.

### 10. .NET 10 Clean Architecture + React/TanStack SPA
```bash
cp .ai/templates/stack.dotnet-react.json .ai/stack.json
```
Rules: `.ai/rules/01-backend/dotnet/` and `.ai/rules/02-frontend/tanstack/`. Audits: `node bin/dotnet-audit.js --strict`, `node bin/frontend-audit.js --strict`.

Once copied to `.ai/stack.json`, the AI assistant automatically ingests **only** the relevant rule set and specialist personas for that stack!
