import { fabric } from 'fabric'
import { BaseTool } from './BaseTool'

/**
 * Eraser tool for erasing annotations
 */
export class EraserTool extends BaseTool {
  constructor(annotations) {
    super(annotations)
    this.name = 'eraser'
  }

  onEnable() {
    super.onEnable()
    this.canvas.isDrawingMode = true
    this.canvas.selection = false
    this.canvas.skipTargetFind = true

    // Set up eraser brush
    if (this.canvas.freeDrawingBrush) {
      this.canvas.freeDrawingBrush = new fabric.EraserBrush(this.canvas)
      this.canvas.freeDrawingBrush.width = 10
    }
  }

  onDisable() {
    super.onDisable()
    this.canvas.isDrawingMode = false
    this.canvas.selection = true
    this.canvas.skipTargetFind = false
  }

  onMouseUp(event) {
    this.annotations.saveAnnotations()
  }
}

export default EraserTool
