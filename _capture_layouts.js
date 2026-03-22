const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

const outDir = 'C:/Users/dindo/AppData/Local/Temp/claudeborn-layouts'
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

app.whenReady().then(async () => {
  for (let i = 1; i <= 10; i++) {
    const htmlFile = path.join('D:/GitHub/ProjectCreator', `_layout${i}.html`)
    if (!fs.existsSync(htmlFile)) { console.log(`Skip ${i}`); continue }

    const win = new BrowserWindow({ width: 1920, height: 1080, show: false })
    await win.loadFile(htmlFile)
    await new Promise(r => setTimeout(r, 2000)) // wait for animations
    const image = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, `layout${i}.png`), image.toPNG())
    console.log(`Captured layout ${i}`)
    win.close()
  }
  console.log('All done')
  app.quit()
})
