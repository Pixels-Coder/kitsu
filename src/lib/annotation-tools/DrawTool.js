import { fabric } from 'fabric'
import localPreferences from '@/lib/preferences'
import { BaseTool } from './BaseTool'

/**
 * Drawing tool for free-hand drawing
 */
export class DrawTool extends BaseTool {
  constructor(annotations) {
    super(annotations)
    this.name = 'draw'
    this.color = '#ff3860'
    this.width = 'big'
    this.mouseIsDrawing = false
    this.mouseDrawingPressureMode = 'distance'
    this.mouseDrawingStartTime = null
    this.mouseDrawingMinPressure = 0.4
    this.mouseDrawingMaxPressure = 0.8
    this.mouseDrawingFadeTime = 100
    this.mouseDrawingDistanceFalloff = 2
    this.mouseDrawingMaxChangeRate = 0.03
    this.mouseDrawingPrevPoint = null
    this.mouseDrawingPrevPressure = null
    this.mouseDrawingDynamicDistanceMult = null
  }

  onEnable() {
    super.onEnable()
    this.canvas.isDrawingMode = true
    this.canvas.selection = false
    this.canvas.skipTargetFind = true
    this._resetColor()
    this._resetPencil()
  }

  onDisable() {
    super.onDisable()
    this.canvas.isDrawingMode = false
    this.canvas.selection = true
    this.canvas.skipTargetFind = false
    this.mouseIsDrawing = false
  }

  onMouseDown(event) {
    if (this.canvas.freeDrawingBrush) {
      this.mouseIsDrawing = true
      this.mouseDrawingStartTime = Date.now()
      this.mouseDrawingPrevPoint = null
      this.mouseDrawingPrevPressure = null
      this.mouseDrawingDynamicDistanceMult = null
    }
  }

  onMouseMove(event) {
    if (this.mouseIsDrawing && this.canvas.freeDrawingBrush) {
      this._updateMousePressure()
    }
  }

  onMouseUp(event) {
    if (this.mouseIsDrawing) {
      this.mouseIsDrawing = false
      this.annotations.clearUndoneStack()
      this.annotations.saveAnnotations()

      // Reset drawing pressure
      if (
        this.canvas.freeDrawingBrush &&
        this.canvas.freeDrawingBrush.setPressure
      ) {
        this.canvas.freeDrawingBrush.setPressure(0.5)
      }
    }
  }

  setColor(color) {
    this.color = color
    this._resetColor()
    localPreferences.setPreference('player:pencil-color', this.color)
  }

  setWidth(width) {
    this.width = width
    this._resetPencil()
    localPreferences.setPreference('player:pencil-width', this.width)
  }

  _resetColor() {
    if (this.canvas && this.canvas.freeDrawingBrush) {
      this.canvas.freeDrawingBrush.color = this.color
    }
  }

  _resetPencil() {
    if (this.canvas && this.canvas.freeDrawingBrush) {
      const converter = {
        big: 10,
        medium: 5,
        small: 2
      }
      const strokeWidth = converter[this.width]
      this.canvas.freeDrawingBrush.width = strokeWidth
    }
  }

  _updateMousePressure() {
    if (
      !this.canvas.freeDrawingBrush ||
      !this.canvas.freeDrawingBrush.setPressure
    )
      return

    const pointer = this.canvas.getPointer()
    const currentPoint = new fabric.Point(pointer.x, pointer.y)

    if (this.mouseDrawingPressureMode === 'fade') {
      const elapsed = Date.now() - this.mouseDrawingStartTime
      const progress = Math.min(elapsed / this.mouseDrawingFadeTime, 1)
      const pressure =
        this.mouseDrawingMaxPressure -
        progress * (this.mouseDrawingMaxPressure - this.mouseDrawingMinPressure)
      this.canvas.freeDrawingBrush.setPressure(pressure)
    } else if (
      this.mouseDrawingPressureMode === 'distance' &&
      this.mouseDrawingPrevPoint
    ) {
      const distance = this._getCanvasRelativePointDrawingDifference(
        currentPoint,
        this.mouseDrawingPrevPoint,
        this.canvas
      )
      let pressure = Math.max(
        this.mouseDrawingMinPressure,
        this.mouseDrawingMaxPressure -
          distance * this.mouseDrawingDistanceFalloff
      )

      if (this.mouseDrawingPrevPressure !== null) {
        const maxChange = this.mouseDrawingMaxChangeRate
        const pressureDiff = pressure - this.mouseDrawingPrevPressure
        if (Math.abs(pressureDiff) > maxChange) {
          pressure =
            this.mouseDrawingPrevPressure +
            (pressureDiff > 0 ? maxChange : -maxChange)
        }
      }

      this.canvas.freeDrawingBrush.setPressure(pressure)
      this.mouseDrawingPrevPressure = pressure
    }

    this.mouseDrawingPrevPoint = currentPoint
  }

  _getCanvasRelativePointDrawingDifference(p1, p2, canvas) {
    const dimensions = new fabric.Point(canvas.getWidth(), canvas.getHeight())
    const p1_rel = p1.divide(dimensions)
    const p2_rel = p2.divide(dimensions)
    return Math.sqrt(
      Math.pow(Math.abs(p1_rel.x - p2_rel.x), 1) +
        Math.pow(Math.abs(p1_rel.y - p2_rel.y), 1)
    )
  }
}

export default DrawTool
