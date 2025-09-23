import { fabric } from 'fabric'
import localPreferences from '@/lib/preferences'
import { BaseTool } from './BaseTool'

/**
 * Shape tool for drawing shapes
 */
export class ShapeTool extends BaseTool {
  constructor(annotations) {
    super(annotations)
    this.name = 'shape'
    this.shape = 'rectangle'
    this.color = '#ff3860'
    this.strokeWidth = 'big'
    this.startPos = null
    this.drawingShape = null
  }

  onEnable() {
    super.onEnable()
    this.canvas.selection = false
    this.canvas.skipTargetFind = true
  }

  onDisable() {
    super.onDisable()
    this.canvas.selection = true
    this.canvas.skipTargetFind = false
    if (this.drawingShape) {
      this.canvas.remove(this.drawingShape)
      this.drawingShape = null
    }
  }

  onMouseDown(event) {
    const canvasElement = this.annotations.getCanvasElement()
    const offsetCanvas = canvasElement.getBoundingClientRect()
    const posX = this.getClientX(event) - offsetCanvas.x
    const posY = this.getClientY(event) - offsetCanvas.y
    this.startPos = { x: posX, y: posY }

    if (this.shape === 'rectangle') {
      this.drawingShape = new fabric.Rect({
        left: posX,
        top: posY,
        width: 0,
        height: 0,
        fill: 'transparent',
        stroke: this.color,
        strokeWidth: this._getStrokeWidth()
      })
    } else if (this.shape === 'arrow') {
      this.drawingShape = this._createArrowShape({
        start: [posX, posY],
        end: [posX, posY],
        stroke: this.color,
        strokeWidth: this._getStrokeWidth()
      })
    }

    if (this.drawingShape) {
      this.canvas.add(this.drawingShape)
    }
  }

  onMouseMove(event) {
    if (!this.drawingShape || !this.startPos) return

    const canvasElement = this.annotations.getCanvasElement()
    const offsetCanvas = canvasElement.getBoundingClientRect()
    const posX = this.getClientX(event) - offsetCanvas.x
    const posY = this.getClientY(event) - offsetCanvas.y

    if (this.shape === 'rectangle') {
      const width = posX - this.startPos.x
      const height = posY - this.startPos.y
      this.drawingShape.set({
        width: Math.abs(width),
        height: Math.abs(height),
        left: width < 0 ? posX : this.startPos.x,
        top: height < 0 ? posY : this.startPos.y
      })
    } else if (this.shape === 'arrow') {
      this._updateArrowShape({
        start: [this.startPos.x, this.startPos.y],
        end: [posX, posY]
      })
    }

    this.drawingShape.setCoords()
    this.canvas.renderAll()
  }

  onMouseUp(event) {
    if (!this.drawingShape) return

    this.drawingShape.set({
      stroke: this.color,
      fill: 'transparent'
    })
    this.drawingShape.setCoords()
    this.canvas.renderAll()

    this.annotations.saveAnnotations()
    this.drawingShape = null
    this.startPos = null
  }

  setShape(shape) {
    this.shape = shape
    localPreferences.setPreference('player:shape', this.shape)
  }

  setColor(color) {
    this.color = color
    localPreferences.setPreference('player:shape-color', this.color)
  }

  setStrokeWidth(width) {
    this.strokeWidth = width
  }

  _getStrokeWidth() {
    const converter = {
      big: 10,
      medium: 5,
      small: 2
    }
    return converter[this.strokeWidth] || 5
  }

  _createArrowShape(options) {
    const { start, end, stroke, strokeWidth } = options
    const x1 = start[0]
    const y1 = start[1]
    const x2 = end[0]
    const y2 = end[1]

    // Create custom Arrow object
    const arrow = new fabric.Arrow([x1, y1, x2, y2], {
      stroke: stroke || this.color,
      strokeWidth: strokeWidth || this._getStrokeWidth(),
      fill: 'transparent',
      arrowHeadSize: 15,
      arrowHeadWidth: 12
    })
    return arrow
  }

  _updateArrowShape(options) {
    const { start, end } = options
    if (this.drawingShape && this.shape === 'arrow') {
      this.drawingShape.set({
        x1: start[0],
        y1: start[1],
        x2: end[0],
        y2: end[1]
      })
    }
  }
}

export default ShapeTool
