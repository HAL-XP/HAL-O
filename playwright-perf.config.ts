import { defineConfig } from "@playwright/test"; export default defineConfig({
  "testDir": "./e2e",
  "timeout": 300000,
  "workers": 1,
  "use": {},
  "projects": [
    {
      "name": "electron",
      "use": {}
    }
  ]
});