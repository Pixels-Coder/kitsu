/*
 * Main Annotations class that manages the canvas and tools
 */

import { fabric } from 'fabric'
import { PSStroke, PSBrush } from '@arch-inc/fabricjs-psbrush'
import { markRaw } from 'vue'
import moment from 'moment'
import { formatFullDate } from '@/lib/time'
import clipboard from '@/lib/clipboard'
import { registerArrowFabricShape } from '@/lib/arrowshape'
import { DrawTool, TextTool, ShapeTool, EraserTool } from './annotation-tools'

// Register custom Arrow shape with Fabric.js
registerArrowFabricShape()

/* Monkey patch needed to have text background including the padding. */
if (fabric) {
  fabric.Text.prototype.set({
    _getNonTransformedDimensions() {
      const dim = this.callSuper('_getNonTransformedDimensions')
      return dim.add(this.padding * 2, this.padding * 2)
    },
    _calculateCurrentDimensions() {
      const dim = this.callSuper('_calculateCurrentDimensions')
      return dim.add(this.padding * 2, this.padding * 2)
    }
  })
}

/* Monkey patch _getTransformedDimensions() to return a proper fabric point */
if (typeof PSStroke !== 'undefined') {
  PSStroke.prototype._getTransformedDimensions = function () {
    const width = this.width * this.scaleX
    const height = this.height * this.scaleY
    const dimensions = new fabric.Point(width, height)
    return dimensions
  }

  /* Monkey patches needed to make PSStroke work correctly by adding missing
   * expected methods to deal with Fabric and pressure.
   */
  if (!PSStroke.prototype.getAncestors) {
    PSStroke.prototype.getAncestors = function () {
      return []
    }
  }

  if (!PSStroke.prototype.contextTop) {
    PSStroke.prototype.contextTop = function () {
      return this.canvas.contextTop
    }
  }

  if (!PSStroke.prototype.dispose) {
    PSStroke.prototype.dispose = function () {
      // Clean up resources
    }
  }

  if (!PSStroke.prototype.getRelativeCenterPoint) {
    PSStroke.prototype.getRelativeCenterPoint = function () {
      return this.getCenterPoint()
    }
  }
}

export class Annotations {
  constructor(options = {}) {
    this.canvas = null
    this.canvasComparison = null
    this.canvasElement = options.canvasElement
    this.canvasComparisonElement = options.canvasComparisonElement

    // Annotation data
    this.annotations = []
    this.lastAnnotationTime = ''
    this.additions = []
    this.deletions = []
    this.updates = []
    this.notSaved = false

    // Tools
    this.tools = new Map()
    this.currentTool = null
    this.isLaserModeOn = false

    // Action stacks for undo/redo
    this.doneActionStack = []
    this.undoneActionStack = []

    // Options
    this.isCurrentUserArtist = options.isCurrentUserArtist || false
    this.getCurrentTime = options.getCurrentTime || (() => 0)
    this.getCurrentFrame = options.getCurrentFrame || (() => 0)

    // Callbacks
    this.onAnnotationChanged = options.onAnnotationChanged || (() => {})

    this._initializeTools()
    this._setupEventHandlers()
  }

  _initializeTools() {
    this.tools.set('draw', new DrawTool(this))
    this.tools.set('text', new TextTool(this))
    this.tools.set('shape', new ShapeTool(this))
    this.tools.set('eraser', new EraserTool(this))
  }

  _setupEventHandlers() {
    this.onObjectAdded = this.onObjectAdded.bind(this)
    this.onObjectModified = this.onObjectModified.bind(this)
    this.onMouseDown = this.onMouseDown.bind(this)
    this.onMouseMove = this.onMouseMove.bind(this)
    this.onMouseUp = this.onMouseUp.bind(this)
  }

  /**
   * Initialize the fabric canvas
   */
  setupCanvas(canvasId, comparisonCanvasId = null) {
    if (!canvasId) return

    // Main canvas
    this.canvas = markRaw(
      new fabric.Canvas(canvasId, {
        fireRightClick: true
      })
    )

    this.canvas.setDimensions({ width: 100, height: 100 })

    // Set up PSBrush
    if (!this.canvas.freeDrawingBrush) {
      const brush = new PSBrush(this.canvas)
      brush.width = 20
      brush.color = '#000'
      brush.disableTouch = true
      brush.disableMouse = true
      brush.pressureManager.fallback = 0.5
      this.canvas.freeDrawingBrush = brush
    }

    // Comparison canvas
    if (comparisonCanvasId) {
      this.canvasComparison = new fabric.StaticCanvas(comparisonCanvasId)
    }

    this._configureCanvas()
    return this.canvas
  }

  _configureCanvas() {
    if (!this.canvas) return

    // Remove existing event listeners
    this.canvas.off('object:moved', this.onObjectModified)
    this.canvas.off('text:changed', this.onObjectModified)
    this.canvas.off('object:modified', this.onObjectModified)
    this.canvas.off('object:added', this.onObjectAdded)
    this.canvas.off('mouse:down', this.onMouseDown)
    this.canvas.off('mouse:move', this.onMouseMove)
    this.canvas.off('mouse:up', this.onMouseUp)

    // Add event listeners
    this.canvas.on('object:moved', this.onObjectModified)
    this.canvas.on('object:modified', this.onObjectModified)
    this.canvas.on('text:changed', this.onObjectModified)
    this.canvas.on('object:added', this.onObjectAdded)
    this.canvas.on('erasing:end', this.onObjectAdded)
    this.canvas.on('mouse:down', this.onMouseDown)
    this.canvas.on('mouse:move', this.onMouseMove)
    this.canvas.on('mouse:up', this.onMouseUp)

    // Configure brush
    this.canvas.freeDrawingBrush.color = '#ff3860'
    this.canvas.freeDrawingBrush.width = 4

    // Configure group controls
    fabric.Group.prototype._controlsVisibility = {
      tl: false,
      tr: false,
      br: !this.isCurrentUserArtist,
      bl: false,
      ml: false,
      mr: false,
      mb: false,
      mt: false
    }
    fabric.Group.prototype.hasControls = true
  }

  /**
   * Set canvas dimensions
   */
  setDimensions(width, height) {
    if (this.canvas) {
      this.canvas.setDimensions({ width, height })
    }
    if (this.canvasComparison) {
      this.canvasComparison.setDimensions({ width, height })
    }
  }

  /**
   * Get the canvas HTML element
   */
  getCanvasElement() {
    return this.canvasElement || (this.canvas && this.canvas.upperCanvasEl)
  }

  /**
   * Tool management
   */
  getTool(name) {
    return this.tools.get(name)
  }

  setCurrentTool(tool) {
    if (this.currentTool && this.currentTool !== tool) {
      this.currentTool.onDisable()
    }
    this.currentTool = tool
  }

  enableTool(name) {
    const tool = this.getTool(name)
    if (tool) {
      tool.onEnable()
      return true
    }
    return false
  }

  disableTool(name) {
    const tool = this.getTool(name)
    if (tool) {
      tool.onDisable()
      return true
    }
    return false
  }

  disableCurrentTool() {
    if (this.currentTool) {
      this.currentTool.onDisable()
      this.currentTool = null
    }
    this.canvas.selection = true
    this.canvas.skipTargetFind = false
  }

  /**
   * Event handlers
   */
  onMouseDown(event) {
    if (this.currentTool) {
      this.currentTool.onMouseDown(event)
    }
  }

  onMouseMove(event) {
    if (this.currentTool) {
      this.currentTool.onMouseMove(event)
    }
  }

  onMouseUp(event) {
    if (this.currentTool) {
      this.currentTool.onMouseUp(event)
    }
  }

  onObjectAdded(obj) {
    let o = obj
    if (obj.target) {
      o = obj.target
    } else {
      o = obj
    }

    o = this.setObjectData(o)

    if (this.isLaserModeOn) {
      this.fadeObject(o)
    } else {
      this.addToAdditions(o)
    }
  }

  onObjectModified(event) {
    const movedObject = event.target
    if (!movedObject._objects) {
      this.addToUpdates(movedObject)
    } else {
      // Handle group modifications
      const groupMatrix = movedObject.calcTransformMatrix()
      movedObject._objects.forEach(obj => {
        const objMatrix = obj.calcTransformMatrix()
        const finalMatrix = fabric.util.multiplyTransformMatrices(
          groupMatrix,
          objMatrix
        )
        const point = fabric.util.qrDecompose(finalMatrix)

        obj.set({
          left: point.translateX,
          top: point.translateY,
          scaleX: point.scaleX,
          scaleY: point.scaleY,
          angle: point.angle
        })

        this.addToUpdates(obj)
      })
    }
  }

  /**
   * Object management
   */
  getObjectById(objectId) {
    return this.canvas.getObjects().find(obj => obj.id === objectId)
  }

  setObjectData(object) {
    if (object.set) {
      object.set({
        id: object.id || fabric.util.getRandomInt(1, 1000000),
        canvasWidth: this.canvas.getWidth(),
        canvasHeight: this.canvas.getHeight()
      })
    } else {
      object.id = object.id || fabric.util.getRandomInt(1, 1000000)
      object.canvasWidth = this.canvas.getWidth()
      object.canvasHeight = this.canvas.getHeight()
    }

    if (!object.createdBy) {
      object.createdBy = 'current-user'
    }

    this.addSerialization(object)
    return object
  }

  addSerialization(object) {
    object.serialize = function () {
      return {
        id: this.id,
        type: this.type,
        left: this.left,
        top: this.top,
        width: this.width,
        height: this.height,
        scaleX: this.scaleX,
        scaleY: this.scaleY,
        angle: this.angle,
        fill: this.fill,
        stroke: this.stroke,
        strokeWidth: this.strokeWidth,
        canvasWidth: this.canvasWidth,
        canvasHeight: this.canvasHeight,
        createdBy: this.createdBy,
        path: this.path,
        text: this.text,
        fontFamily: this.fontFamily,
        fontSize: this.fontSize,
        backgroundColor: this.backgroundColor,
        padding: this.padding
      }
    }
    return object
  }

  addObject(activeObject, persist = true) {
    if (activeObject._objects) {
      // Handle groups
      activeObject._objects.forEach(obj => {
        this.setObjectData(obj)
        this.canvas.add(obj)
      })
    } else {
      this.setObjectData(activeObject)
      this.canvas.add(activeObject)
    }

    if (persist) {
      this.saveAnnotations()
    }
  }

  deleteSelection() {
    const activeObject = this.canvas.getActiveObject()
    this.deleteObject(activeObject)
  }

  deleteObject(activeObject) {
    if (activeObject && activeObject._objects) {
      // Handle group deletion
      activeObject._objects.forEach(obj => {
        this.addToDeletions(obj)
        this.removeObjectFromCanvas(obj)
      })
    } else if (activeObject) {
      this.addToDeletions(activeObject)
      this.removeObjectFromCanvas(activeObject)
    }
    this.saveAnnotations()
  }

  removeObjectFromCanvas(deletedObject) {
    const obj = this.getObjectById(deletedObject.id)
    if (obj) {
      this.canvas.remove(obj)
    }
  }

  fadeObject(obj) {
    if (!obj) return
    obj.animate('opacity', '0', {
      duration: 1500,
      onChange: this.canvas.renderAll.bind(this.canvas),
      onComplete: () => {
        this.canvas.remove(obj)
      }
    })
  }

  /**
   * Annotation persistence
   */
  addToAdditions(obj) {
    this.markLastAnnotationTime()
    const currentTime = this.getCurrentTime()
    const currentFrame = this.getCurrentFrame()
    const additions = this.findAnnotation(this.additions, currentTime)

    if (additions) {
      additions.drawing.objects.push(obj.serialize())
    } else {
      this.additions.push({
        time: currentTime,
        frame: currentFrame,
        drawing: {
          objects: [obj.serialize()]
        }
      })
    }

    this.postAnnotationAddition(currentTime, obj.serialize())
  }

  addToDeletions(obj) {
    this.markLastAnnotationTime()
    const currentTime = this.getCurrentTime()
    const currentFrame = this.getCurrentFrame()
    const deletion = this.findAnnotation(this.deletions, currentTime)

    if (deletion) {
      deletion.objects.push(obj.serialize())
    } else {
      this.deletions.push({
        time: currentTime,
        frame: currentFrame,
        objects: [obj.serialize()]
      })
    }

    if (!obj.serialize) {
      this.addSerialization(obj)
    }
    this.postAnnotationDeletion(currentTime, obj.serialize())
  }

  addToUpdates(obj) {
    this.setObjectData(obj)
    this.addToUpdatesSerializedObject(obj.serialize())
  }

  addToUpdatesSerializedObject(obj) {
    this.markLastAnnotationTime()
    const currentTime = this.getCurrentTime()
    const currentFrame = this.getCurrentFrame()
    const updates = this.findAnnotation(this.updates, currentTime)

    if (updates) {
      updates.drawing.objects.push(obj)
    } else {
      this.updates.push({
        time: currentTime,
        frame: currentFrame,
        drawing: {
          objects: [obj]
        }
      })
    }

    this.postAnnotationUpdate(currentTime, obj)
  }

  findAnnotation(list, time) {
    return list.find(a => a.time < time + 0.0001 && a.time > time - 0.0001)
  }

  markLastAnnotationTime() {
    const time = moment().add(2, 'hour').add(6, 'seconds')
    this.lastAnnotationTime = formatFullDate(time).replace(' ', 'T')
  }

  postAnnotationAddition(currentTime, obj) {
    // Hook for subclasses
  }

  postAnnotationDeletion(currentTime, obj) {
    // Hook for subclasses
  }

  postAnnotationUpdate(currentTime, obj) {
    // Hook for subclasses
  }

  /**
   * Canvas operations
   */
  clearCanvas() {
    if (this.canvas) {
      this.canvas.clear()
    }
    if (this.canvasComparison) {
      this.canvasComparison.clear()
    }
  }

  clearSelection() {
    if (this.canvas.activeObject) {
      this.canvas.discardActiveObject().renderAll()
    }
  }

  isEmpty() {
    return this.canvas ? this.canvas.getObjects().length === 0 : true
  }

  /**
   * Undo/Redo functionality
   */
  clearUndoneStack() {
    this.undoneActionStack = []
  }

  stackAddAction({ target }) {
    this.doneActionStack.push({ type: 'add', obj: target })
    target.lockScalingX = true
    target.lockScalingY = true
    target.rotation = true
  }

  undoLastAction() {
    const action = this.doneActionStack.pop()
    if (action && action.obj) {
      if (action.type === 'add') {
        this.removeFromAdditions(action.obj)
        this.canvas.remove(action.obj)
        this.undoneActionStack.push(action)
      }
    }
  }

  redoLastAction() {
    const action = this.undoneActionStack.pop()
    if (action) {
      if (action.type === 'add') {
        this.canvas.add(action.obj)
        this.addToAdditions(action.obj)
        this.doneActionStack.push(action)
      }
    }
  }

  removeFromAdditions(obj) {
    const currentTime = this.getCurrentTime()
    const additions = this.findAnnotation(this.additions, currentTime)
    if (additions) {
      const index = additions.drawing.objects.findIndex(o => o.id === obj.id)
      if (index > -1) {
        additions.drawing.objects.splice(index, 1)
      }
    }
  }

  removeFromDeletions(obj) {
    const currentTime = this.getCurrentTime()
    const deletions = this.findAnnotation(this.deletions, currentTime)
    if (deletions) {
      const index = deletions.objects.findIndex(o => o.id === obj.id)
      if (index > -1) {
        deletions.objects.splice(index, 1)
      }
    }
  }

  /**
   * Clipboard operations
   */
  copyAnnotations() {
    if (!this.canvas) return null

    const activeObject = this.canvas.getActiveObject()
    if (!activeObject) return null

    if (activeObject._objects) {
      clipboard.copyAnnotations(activeObject, activeObject._objects)
    } else {
      clipboard.copyAnnotations(activeObject, [activeObject])
    }

    return activeObject
  }

  pasteAnnotations() {
    if (!this.canvas) return

    this.canvas.discardActiveObject()
    const { mainObject, subObjects } = clipboard.pasteAnnotations()

    if (subObjects?.length > 0) {
      subObjects.forEach(obj => {
        const newObj = this.applyGroupChanges(mainObject, obj)
        this.addObject(newObj)
      })
    } else if (mainObject) {
      this.addObject(mainObject)
    }
  }

  applyGroupChanges(group, obj) {
    if (obj.group) {
      const groupMatrix = group.calcTransformMatrix()
      const objMatrix = obj.calcTransformMatrix()
      const finalMatrix = fabric.util.multiplyTransformMatrices(
        groupMatrix,
        objMatrix
      )
      const point = fabric.util.qrDecompose(finalMatrix)

      obj.set({
        left: point.translateX,
        top: point.translateY,
        scaleX: point.scaleX,
        scaleY: point.scaleY,
        angle: point.angle
      })
    }
    return obj
  }

  /**
   * Annotation loading
   */
  async loadAnnotation(annotation) {
    if (!annotation || !this.canvas) return

    this.clearCanvas()
    await this.loadSingleAnnotation(annotation)
  }

  async loadSingleAnnotation(annotation) {
    if (!annotation || !annotation.drawing || !annotation.drawing.objects)
      return

    for (const obj of annotation.drawing.objects) {
      await this.addObjectToCanvas(annotation, obj)
    }
  }

  async addObjectToCanvas(annotation, obj, canvas = null) {
    if (!obj) return null
    if (this.getObjectById(obj.id) && !canvas) return null

    const targetCanvas = canvas || this.canvas
    let fabricObject = null

    let scaleMultiplierX = 1
    let scaleMultiplierY = 1

    if (annotation?.width) {
      scaleMultiplierX = targetCanvas.getWidth() / annotation.width
    }
    if (annotation?.height) {
      scaleMultiplierY = targetCanvas.getHeight() / annotation.height
    }

    const canvasWidth = obj.canvasWidth || annotation.width
    const canvasHeight = obj.canvasHeight

    if (canvasWidth) {
      scaleMultiplierX = targetCanvas.getWidth() / canvasWidth
    }
    if (canvasHeight) {
      scaleMultiplierY = targetCanvas.getHeight() / canvasHeight
    }

    const base = {
      id: obj.id,
      fill: obj.fill || 'transparent',
      left: obj.left * scaleMultiplierX,
      top: obj.top * scaleMultiplierY,
      stroke: obj.stroke,
      strokeWidth: obj.strokeWidth,
      radius: obj.radius,
      width: obj.width,
      height: obj.height,
      scaleX: obj.scaleX * scaleMultiplierX,
      scaleY: obj.scaleY * scaleMultiplierY,
      angle: obj.angle,
      scale: obj.scale,
      editable: !this.isCurrentUserArtist,
      selectable: !this.isCurrentUserArtist
    }

    if (obj.type === 'path') {
      fabricObject = new fabric.Path(obj.path, base)
    } else if (obj.type === 'i-text') {
      fabricObject = new fabric.IText(obj.text, {
        ...base,
        fontFamily: obj.fontFamily,
        fontSize: obj.fontSize,
        backgroundColor: obj.backgroundColor,
        padding: obj.padding
      })
    } else if (obj.type === 'psstroke') {
      fabricObject = await this.deserializePSBrush(obj)
    }

    if (fabricObject) {
      this.setObjectData(fabricObject)
      targetCanvas.add(fabricObject)
    }

    return fabricObject
  }

  deserializePSBrush(obj) {
    return new Promise((resolve, reject) => {
      if (typeof PSStroke !== 'undefined') {
        PSStroke.fromObject(obj, stroke => {
          resolve(stroke)
        })
      } else {
        resolve(null)
      }
    })
  }

  /**
   * Save annotations
   */
  saveAnnotations() {
    this.notSaved = true

    // Emit change event
    this.onAnnotationChanged({
      additions: this.additions,
      deletions: this.deletions,
      updates: this.updates
    })

    // Start save timer
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }

    this.saveTimeout = setTimeout(() => {
      this.endAnnotationSaving()
    }, 3000)
  }

  endAnnotationSaving() {
    if (this.notSaved) {
      this.notSaved = false
      this.clearModifications()

      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout)
        this.saveTimeout = null
      }
    }
  }

  clearModifications() {
    this.additions = []
    this.updates = []
    this.deletions = []
  }

  /**
   * Cleanup
   */
  destroy() {
    this.endAnnotationSaving()

    if (this.canvas) {
      this.canvas.dispose()
      this.canvas = null
    }

    if (this.canvasComparison) {
      this.canvasComparison.dispose()
      this.canvasComparison = null
    }

    this.tools.clear()
    this.currentTool = null
  }
}

export default Annotations
