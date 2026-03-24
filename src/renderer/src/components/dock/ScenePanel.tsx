/**
 * ScenePanel — dockview panel that wraps ProjectHub (the 3D scene).
 *
 * Uses DockCtx to pull all the props ProjectHub needs, so dockview can
 * instantiate it by string key without prop drilling.
 *
 * IMPORTANT: This panel MUST use dockview's "always" renderer so the WebGL
 * Canvas is never unmounted during tab/group rearrangement.
 */

import { useContext } from 'react'
import type { IDockviewPanelProps } from 'dockview'
import { ProjectHub } from '../ProjectHub'
import { DockCtx } from './DockContext'

export function ScenePanel(_props: IDockviewPanelProps) {
  const ctx = useContext(DockCtx)
  if (!ctx) {
    return (
      <div style={{ width: '100%', height: '100%', background: '#0a0e14', color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
        DockContext not available
      </div>
    )
  }

  const s = ctx.scene
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <ProjectHub
        onNewProject={s.onNewProject}
        onConvertProject={s.onConvertProject}
        onOpenTerminal={s.onOpenTerminal}
        voiceFocus={s.voiceFocus}
        onVoiceFocusHub={s.onVoiceFocusHub}
        hubFontSize={s.hubFontSize}
        termFontSize={s.termFontSize}
        wizardFontSize={s.wizardFontSize}
        onWizardFontSize={s.onWizardFontSize}
        voiceOut={s.voiceOut}
        voiceProfile={s.voiceProfile}
        dockPosition={s.dockPosition}
        screenOpacity={s.screenOpacity}
        onHubFontSize={s.onHubFontSize}
        onTermFontSize={s.onTermFontSize}
        onVoiceOut={s.onVoiceOut}
        onVoiceProfileChange={s.onVoiceProfileChange}
        onDockPositionChange={s.onDockPositionChange}
        onScreenOpacityChange={s.onScreenOpacityChange}
        particleDensity={s.particleDensity}
        onParticleDensityChange={s.onParticleDensityChange}
        renderQuality={s.renderQuality}
        onRenderQualityChange={s.onRenderQualityChange}
        camera={s.camera}
        onCameraChange={s.onCameraChange}
        onCameraReset={s.onCameraReset}
        onCameraMove={s.onCameraMove}
        rendererId={s.rendererId}
        onRendererChange={s.onRendererChange}
        layoutId={s.layoutId}
        onLayoutChange={s.onLayoutChange}
        threeTheme={s.threeTheme}
        onThreeThemeChange={s.onThreeThemeChange}
        shipVfxEnabled={s.shipVfxEnabled}
        onShipVfxEnabledChange={s.onShipVfxEnabledChange}
        sphereStyle={s.sphereStyle}
        onSphereStyleChange={s.onSphereStyleChange}
        voiceReactionIntensity={s.voiceReactionIntensity}
        onVoiceReactionIntensityChange={s.onVoiceReactionIntensityChange}
        personality={s.personality}
        onPersonalityChange={s.onPersonalityChange}
        onPersonalityPreset={s.onPersonalityPreset}
        halSessionId={s.halSessionId}
        terminalCount={s.terminalCount}
        demo={s.demo}
        defaultIde={s.defaultIde}
        onDefaultIdeChange={s.onDefaultIdeChange}
        dockMode={s.dockMode}
        onDockModeChange={s.onDockModeChange}
      />
    </div>
  )
}
