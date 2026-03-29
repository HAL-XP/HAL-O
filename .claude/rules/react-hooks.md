---
description: React hooks must be declared before conditional returns
alwaysApply: true
globs: ["**/*.tsx", "**/*.ts"]
---
ALL useState, useEffect, useRef, useMemo, useCallback MUST be declared BEFORE any conditional return. This has caused crashes 3+ times. No exceptions.
