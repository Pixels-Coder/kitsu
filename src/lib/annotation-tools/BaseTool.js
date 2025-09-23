/**
 * Base tool class that all annotation tools inherit from
 */
export class BaseTool {
  constructor(annotations) {
    this.annotations = annotations
    this.canvas = annotations.canvas
    this.isActive = false
    this.name = 'base'
  }

  onEnable() {
    this.isActive = true
    this.annotations.setCurrentTool(this)
  }

  onDisable() {
    this.isActive = false
    if (this.annotations.currentTool === this) {
      this.annotations.currentTool = null
    }
  }

  onMouseDown(event) {
    // Override in subclasses
  }

  onMouseMove(event) {
    // Override in subclasses
  }

  onMouseUp(event) {
    // Override in subclasses
  }

  onKeyDown(event) {
    // Override in subclasses
  }

  getClientX(event) {
    return (
      event.clientX ||
      (event.touches && event.touches[0] && event.touches[0].clientX) ||
      0
    )
  }

  getClientY(event) {
    return (
      event.clientY ||
      (event.touches && event.touches[0] && event.touches[0].clientY) ||
      0
    )
  }
}

export default BaseTool
