import { fabric } from 'fabric'
import localPreferences from '@/lib/preferences'
import { BaseTool } from './BaseTool'

/**
 * Text tool for adding text annotations
 */
export class TextTool extends BaseTool {
  constructor(annotations) {
    super(annotations)
    this.name = 'text'
    this.color = '#ff3860'
  }

  onEnable() {
    super.onEnable()
    this.canvas.selection = true
    this.canvas.skipTargetFind = false
  }

  onDisable() {
    super.onDisable()
  }

  onMouseDown(event) {
    if (this.canvas.getActiveObject()) return

    const canvasElement = this.annotations.getCanvasElement()
    const offsetCanvas = canvasElement.getBoundingClientRect()
    const posX = this.getClientX(event) - offsetCanvas.x
    const posY = this.getClientY(event) - offsetCanvas.y

    const baseHeight = 320
    let fontSize = 12
    if (this.canvas.getHeight() > baseHeight) {
      fontSize = Math.round((this.canvas.getHeight() / baseHeight) * fontSize)
    }

    const fabricText = new fabric.IText('Type...', {
      left: posX,
      top: posY,
      fontFamily: 'arial',
      fill: this.color,
      fontSize: fontSize,
      backgroundColor: 'rgba(255,255,255, 0.8)',
      padding: 10
    })

    this.canvas.add(fabricText)
    this.canvas.setActiveObject(fabricText)
    fabricText.enterEditing()
    fabricText.selectAll()

    fabricText.hiddenTextarea.onblur = () => {
      if (fabricText.text === 'Type...') {
        this.canvas.remove(fabricText)
      } else {
        this.annotations.saveAnnotations()
      }
    }
  }

  setColor(color) {
    this.color = color
    localPreferences.setPreference('player:text-color', this.color)
  }
}

export default TextTool
