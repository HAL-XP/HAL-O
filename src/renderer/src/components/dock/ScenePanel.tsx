/**
 * ScenePanel -- dockview panel that wraps ProjectHub (the 3D scene).
 *
 * Uses DockCtx to pull all the props ProjectHub needs, so dockview can
 * instantiate it by string key without prop drilling.
 *
 * IMPORTANT: This panel MUST use dockview's "always" renderer so the WebGL
 * Canvas is never unmounted during tab/group rearrangement.
 *
 * DESIGN: ProjectHub accepts `settings: SettingsState` as its first required
 * prop plus a bunch of non-settings callbacks.  We pass `settings` directly
 * from context (no decompose/recompose) so that new settings fields are
 * automatically forwarded without touching this file.
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

  const { settings, scene } = ctx

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <ProjectHub
        settings={settings}
        onNewProject={scene.onNewProject}
        onConvertProject={scene.onConvertProject}
        onOpenTerminal={scene.onOpenTerminal}
        voiceFocus={ctx.voiceFocus}
        onVoiceFocusHub={scene.onVoiceFocusHub}
        hubFontSize={settings.hubFontSize}
        termFontSize={settings.termFontSize}
        wizardFontSize={scene.wizardFontSize}
        onWizardFontSize={scene.onWizardFontSize}
        voiceOut={settings.voiceOut}
        voiceProfile={settings.voiceProfile}
        dockPosition={settings.dockPosition}
        screenOpacity={settings.screenOpacity}
        onHubFontSize={settings.updateHubFont}
        onTermFontSize={settings.updateTermFont}
        onVoiceOut={settings.updateVoiceOut}
        onVoiceProfileChange={settings.updateVoiceProfile}
        onDockPositionChange={settings.updateDockPosition}
        onScreenOpacityChange={settings.updateScreenOpacity}
        particleDensity={settings.particleDensity}
        onParticleDensityChange={settings.updateParticleDensity}
        renderQuality={settings.renderQuality}
        onRenderQualityChange={settings.updateRenderQuality}
        camera={settings.camera}
        onCameraChange={settings.updateCamera}
        onCameraReset={settings.resetCamera}
        onCameraMove={scene.onCameraMove}
        rendererId={settings.rendererId}
        onRendererChange={settings.updateRenderer}
        layoutId={settings.layoutId}
        onLayoutChange={settings.updateLayout}
        threeTheme={settings.threeTheme}
        onThreeThemeChange={settings.updateThreeTheme}
        shipVfxEnabled={settings.shipVfxEnabled}
        onShipVfxEnabledChange={settings.updateShipVfxEnabled}
        activityFeedback={settings.activityFeedback}
        onActivityFeedbackChange={settings.updateActivityFeedback}
        sphereStyle={settings.sphereStyle}
        onSphereStyleChange={settings.updateSphereStyle}
        voiceReactionIntensity={settings.voiceReactionIntensity}
        onVoiceReactionIntensityChange={settings.updateVoiceReactionIntensity}
        personality={settings.personality}
        onPersonalityChange={settings.updatePersonality}
        onPersonalityPreset={settings.applyPersonalityPreset}
        halSessionId={ctx.halSessionId}
        terminalCount={ctx.terminalCount}
        demo={ctx.demo}
        defaultIde={settings.defaultIde}
        onDefaultIdeChange={settings.updateDefaultIde}
        defaultTerminalModel={settings.defaultTerminalModel}
        onDefaultTerminalModelChange={settings.updateDefaultTerminalModel}
        dockMode={ctx.dockMode}
        onDockModeChange={ctx.onDockModeChange}
        introAnimation={settings.introAnimation}
        onIntroAnimationChange={settings.updateIntroAnimation}
        graphicsPreset={settings.graphicsPreset}
        onGraphicsPresetChange={settings.updateGraphicsPreset}
        bloomEnabled={settings.bloomEnabled}
        onBloomEnabledChange={settings.updateBloomEnabled}
        chromaticAberrationEnabled={settings.chromaticAberrationEnabled}
        onChromaticAberrationEnabledChange={settings.updateChromaticAberrationEnabled}
        floorLinesEnabled={settings.floorLinesEnabled}
        onFloorLinesEnabledChange={settings.updateFloorLinesEnabled}
        groupTrailsEnabled={settings.groupTrailsEnabled}
        onGroupTrailsEnabledChange={settings.updateGroupTrailsEnabled}
        autoRotateEnabled={settings.autoRotateEnabled}
        onAutoRotateEnabledChange={settings.updateAutoRotateEnabled}
        autoRotateSpeed={settings.autoRotateSpeed}
        onAutoRotateSpeedChange={settings.updateAutoRotateSpeed}
        cardsPerSector={settings.cardsPerSector}
        onCardsPerSectorChange={settings.updateCardsPerSector}
        onRedetectGpu={scene.onRedetectGpu}
        onOpenBrowser={scene.onOpenBrowser}
        devlogSections={settings.devlogSections}
        onDevlogSectionChange={settings.updateDevlogSection}
        onSetAllDevlogSections={settings.setAllDevlogSections}
        focusZone={ctx.focusZone}
        bloomIntensityOverride={settings.bloomIntensityOverride}
        onBloomIntensityOverrideChange={settings.updateBloomIntensityOverride}
        gridOpacityOverride={settings.gridOpacityOverride}
        onGridOpacityOverrideChange={settings.updateGridOpacityOverride}
        particleBrightnessOverride={settings.particleBrightnessOverride}
        onParticleBrightnessOverrideChange={settings.updateParticleBrightnessOverride}
        vignetteOverride={settings.vignetteOverride}
        onVignetteOverrideChange={settings.updateVignetteOverride}
      />
    </div>
  )
}
