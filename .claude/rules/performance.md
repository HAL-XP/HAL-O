---
description: Three.js performance rules
globs: ["**/three/**", "**/*Scene*.tsx"]
---
- No new THREE.Vector3() or new THREE.Color() inside useFrame — use module-level scratch objects
- No inline style={{}} objects that are constant — use CSS classes
- No setState inside useFrame — use refs for per-frame data
