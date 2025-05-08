import { app } from "../../scripts/app.js";

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function mapDataToCanvas(x, y, rect) {
    const canvasX = lerp(rect.x, rect.x + rect.width, x);
    const canvasY = lerp(rect.y + rect.height, rect.y, y);
    return [canvasX, canvasY];
}

function mapCanvasToData(px, py, rect) {
    const dataX = (px - rect.x) / rect.width;
    const dataY = 1.0 - (py - rect.y) / rect.height;
    return [
        Math.max(0, Math.min(1, dataX)),
        Math.max(0, Math.min(1, dataY))
    ];
}

function interpolateCurve(points) {
    points.sort((a, b) => a[0] - b[0]);
    const output = new Float32Array(256);

    for (let i = 0; i < 256; i++) {
        const x = i / 255.0;
        let p1 = points[0];
        let p2 = points[points.length - 1];

        for (let j = 0; j < points.length - 1; j++) {
            if (x >= points[j][0] && x <= points[j + 1][0]) {
                p1 = points[j];
                p2 = points[j + 1];
                break;
            }
        }
        if (x < points[0][0]) {
             p1 = p2 = points[0];
        } else if (x > points[points.length - 1][0]) {
             p1 = p2 = points[points.length - 1];
        }

        if (p1[0] === p2[0]) {
            output[i] = p1[1];
        } else {
            const t = (x - p1[0]) / (p2[0] - p1[0]);
            output[i] = lerp(p1[1], p2[1], t);
        }
        output[i] = Math.max(0, Math.min(1, output[i]));
    }

    return Array.from(output);
}

const PAD = 10;
const BUTTON_HEIGHT = 25;
const TOP_BUTTON_HEIGHT = 20;
const POINT_RADIUS = 5;
const HIT_TOLERANCE = 10;
const CURVE_AREA_HEIGHT = 120;
const WIDGET_TYPE_STRING = "rgb_curve_editor_widget";

app.registerExtension({
    name: "comfyui.rgb_curve_editor",
    getCustomWidgets: () => {
        return {
            [WIDGET_TYPE_STRING]: function(node, inputName, inputData, app) {
                const widget = {
                    element: document.createElement("div"),
                    parent: node,
                    name: inputName,
                    type: WIDGET_TYPE_STRING,
                    value: {},

                    draggingPoint: null,
                    dragOffset: [0, 0],
                    activeChannel: 'red',
                    buttons: {},
                    widgetY: 0,
                    lastSelectedPointRef: null,

                    curves: {
                        red: [[0, 0], [1, 1]],
                        green: [[0, 0], [1, 1]],
                        blue: [[0, 0], [1, 1]]
                    },

                    draw: function(ctx, node, width, y) {
                        this.computeSize(width);
                        const [widgetWidth, widgetHeight] = this.size;
                        this.widgetY = y;

                        ctx.fillStyle = LiteGraph.WIDGET_BGCOLOR;
                        ctx.fillRect(0, y, widgetWidth, widgetHeight);

                        let currentY = y + PAD;

                        // Draw Top Action Buttons
                        const topButtonLabels = ['Reset Linear', 'Delete Point', 'Square Wave'];
                        const topButtonWidth = (widgetWidth - PAD * (topButtonLabels.length + 1)) / topButtonLabels.length;
                        this.buttons = {};

                        for (let i = 0; i < topButtonLabels.length; i++) {
                             const btnLabel = topButtonLabels[i];
                             const btnX = PAD + i * (topButtonWidth + PAD);
                             const btnY = currentY;

                             ctx.fillStyle = "#555";
                             ctx.fillRect(btnX, btnY, topButtonWidth, TOP_BUTTON_HEIGHT);

                             ctx.fillStyle = "#fff";
                             ctx.font = `${TOP_BUTTON_HEIGHT * 0.6}px Arial`;
                             ctx.textAlign = "center";
                             ctx.textBaseline = "middle";
                             ctx.fillText(btnLabel, btnX + topButtonWidth / 2, btnY + TOP_BUTTON_HEIGHT / 2);

                             this.buttons[btnLabel] = {
                                 x: btnX,
                                 y: btnY,
                                 width: topButtonWidth,
                                 height: TOP_BUTTON_HEIGHT
                             };
                        }

                        currentY += TOP_BUTTON_HEIGHT + PAD;

                        const curveRect = {
                            x: PAD,
                            y: currentY,
                            width: widgetWidth - PAD * 2,
                            height: CURVE_AREA_HEIGHT
                        };

                        ctx.fillStyle = "#222";
                        ctx.fillRect(curveRect.x, curveRect.y, curveRect.width, curveRect.height);

                        // Draw Inactive Curves
                        const channels = ['red', 'green', 'blue'];
                        ctx.lineWidth = 2;
                        for (const channel of channels) {
                             if (channel !== this.activeChannel) {
                                 const curvePoints = this.curves[channel];
                                 if (curvePoints.length > 0) {
                                     ctx.globalAlpha = 0.5;
                                     ctx.strokeStyle = channel;
                                     ctx.beginPath();
                                     let firstPoint = mapDataToCanvas(curvePoints[0][0], curvePoints[0][1], curveRect);
                                     ctx.moveTo(firstPoint[0], firstPoint[1]);
                                     for (let i = 1; i < curvePoints.length; i++) {
                                         const point = mapDataToCanvas(curvePoints[i][0], curvePoints[i][1], curveRect);
                                         ctx.lineTo(point[0], point[1]);
                                     }
                                     ctx.stroke();
                                 }
                             }
                        }

                        // Draw Active Curve
                         const activeCurvePoints = this.curves[this.activeChannel];
                         if (activeCurvePoints.length > 0) {
                             ctx.globalAlpha = 1.0;
                             ctx.strokeStyle = this.activeChannel;
                             ctx.beginPath();

                             let firstPoint = mapDataToCanvas(activeCurvePoints[0][0], activeCurvePoints[0][1], curveRect);
                             ctx.moveTo(firstPoint[0], firstPoint[1]);

                             for (let i = 1; i < activeCurvePoints.length; i++) {
                                 const point = mapDataToCanvas(activeCurvePoints[i][0], activeCurvePoints[i][1], curveRect);
                                 ctx.lineTo(point[0], point[1]);
                             }
                             ctx.stroke();

                             // Draw points for the active channel
                             ctx.fillStyle = this.activeChannel;
                             for (let i = 0; i < activeCurvePoints.length; i++) {
                                 const point = mapDataToCanvas(activeCurvePoints[i][0], activeCurvePoints[i][1], curveRect);
                                 ctx.beginPath();
                                 const radius = (activeCurvePoints[i] === this.lastSelectedPointRef) ? POINT_RADIUS * 1.5 : POINT_RADIUS;
                                 ctx.arc(point[0], point[1], radius, 0, Math.PI * 2);
                                 ctx.fill();
                             }
                         }

                        ctx.globalAlpha = 1.0;

                        currentY += CURVE_AREA_HEIGHT + PAD;

                        // Draw Channel Buttons
                        const channelButtons = ['red', 'green', 'blue'];
                        const channelButtonWidth = (widgetWidth - PAD * (channelButtons.length + 1)) / channelButtons.length;

                        for (let i = 0; i < channelButtons.length; i++) {
                             const btnColor = channelButtons[i];
                             const btnX = PAD + i * (channelButtonWidth + PAD);
                             const btnY = currentY;

                             ctx.fillStyle = (this.activeChannel === btnColor) ? btnColor : "#555";
                             ctx.fillRect(btnX, btnY, channelButtonWidth, BUTTON_HEIGHT);

                             ctx.fillStyle = "#fff";
                             ctx.font = `${BUTTON_HEIGHT * 0.7}px Arial`;
                             ctx.textAlign = "center";
                             ctx.textBaseline = "middle";
                             ctx.fillText(btnColor.toUpperCase().charAt(0), btnX + channelButtonWidth / 2, btnY + BUTTON_HEIGHT / 2);

                             this.buttons[btnColor] = {
                                x: btnX,
                                y: btnY,
                                width: channelButtonWidth,
                                height: BUTTON_HEIGHT
                             };
                         }

                        this.value = this.serializeValue();
                    },

                    computeSize: function(width) {
                        const widgetWidth = width;
                        const widgetHeight = PAD + TOP_BUTTON_HEIGHT + PAD + CURVE_AREA_HEIGHT + PAD + BUTTON_HEIGHT + PAD;
                        this.size = [widgetWidth, widgetHeight];
                        return this.size;
                    },

                    serializeValue: function() {
                        return {
                            red: interpolateCurve(this.curves.red),
                            green: interpolateCurve(this.curves.green),
                            blue: interpolateCurve(this.curves.blue)
                        };
                    },

                    mouse: function(event, pos, node) {
                        const mouseX = pos[0];
                        const mouseY = pos[1];

                        // Check for Top Button Clicks
                        const topButtonLabels = ['Reset Linear', 'Delete Point', 'Square Wave'];
                        if (event.type === LiteGraph.pointerevents_method + 'down') {
                             for (const btnLabel of topButtonLabels) {
                                 const btnRect = this.buttons[btnLabel];
                                 if (mouseX >= btnRect.x && mouseX <= btnRect.x + btnRect.width &&
                                     mouseY >= btnRect.y && mouseY <= btnRect.y + btnRect.height) {
                                     const activeCurve = this.curves[this.activeChannel];
                                     let pointsChanged = false;
                                     switch (btnLabel) {
                                         case 'Reset Linear':
                                             activeCurve.length = 0;
                                             activeCurve.push([0, 0], [1, 1]);
                                             this.lastSelectedPointRef = null;
                                             pointsChanged = true;
                                             break;
                                         case 'Delete Point':
                                              if (this.lastSelectedPointRef) {
                                                  const indexToDelete = activeCurve.indexOf(this.lastSelectedPointRef);
                                                  if (indexToDelete > 0 && indexToDelete < activeCurve.length - 1) {
                                                      activeCurve.splice(indexToDelete, 1);
                                                      this.lastSelectedPointRef = null;
                                                      pointsChanged = true;
                                                  }
                                              }
                                             break;
                                         case 'Square Wave':
                                             activeCurve.length = 0;
                                             activeCurve.push([0, 0], [0.5, 0], [0.5, 1], [1, 1]);
                                             activeCurve.sort((a, b) => a[0] - b[0]);
                                             this.lastSelectedPointRef = null;
                                             pointsChanged = true;
                                             break;
                                     }
                                     if (pointsChanged) {
                                        node.setDirtyCanvas(true, true);
                                     }
                                     event.stopPropagation();
                                     return true;
                                 }
                             }
                        }

                        // Check for Channel Button Clicks
                        const channelButtons = ['red', 'green', 'blue'];
                        for (let i = 0; i < channelButtons.length; i++) {
                            const btnColor = channelButtons[i];
                            const btnRect = this.buttons[btnColor];

                            if (mouseX >= btnRect.x && mouseX <= btnRect.x + btnRect.width &&
                                mouseY >= btnRect.y && mouseY <= btnRect.y + btnRect.height) {

                                if (event.type === LiteGraph.pointerevents_method + 'down') {
                                    this.activeChannel = btnColor;
                                    this.lastSelectedPointRef = null;
                                    node.setDirtyCanvas(true, true);
                                    event.stopPropagation();
                                    return true;
                                }
                            }
                        }

                        const curveAreaTopY = this.widgetY + PAD + TOP_BUTTON_HEIGHT + PAD;
                        const curveRect = {
                            x: PAD,
                            y: curveAreaTopY,
                            width: this.size[0] - PAD * 2,
                            height: CURVE_AREA_HEIGHT
                        };

                        if (mouseX >= curveRect.x && mouseX <= curveRect.x + curveRect.width &&
                            mouseY >= curveRect.y && mouseY <= curveRect.y + curveRect.height) {

                            const currentCurvePoints = this.curves[this.activeChannel];

                            if (event.type === LiteGraph.pointerevents_method + 'down') {
                                let foundPoint = false;
                                for (let i = 0; i < currentCurvePoints.length; i++) {
                                    const pointData = currentCurvePoints[i];
                                    const pointCanvas = mapDataToCanvas(pointData[0], pointData[1], curveRect);
                                    const distSq = (mouseX - pointCanvas[0]) * (mouseX - pointCanvas[0]) +
                                                   (mouseY - pointCanvas[1]) * (mouseY - pointCanvas[1]);
                                    if (distSq <= HIT_TOLERANCE * HIT_TOLERANCE) {
                                        this.draggingPoint = { channel: this.activeChannel, index: i };
                                        this.dragOffset = [mouseX - pointCanvas[0], mouseY - pointCanvas[1]];
                                        this.lastSelectedPointRef = currentCurvePoints[i];
                                        foundPoint = true;
                                        break;
                                    }
                                }

                                // Add new point if clicked and not near an existing one
                                if (!foundPoint) {
                                    const newPointData = mapCanvasToData(mouseX, mouseY, curveRect);
                                    if (newPointData[0] > 0.01 && newPointData[0] < 0.99) {
                                        let pointExists = false;
                                        for(const point of currentCurvePoints) {
                                            const dist = Math.sqrt(Math.pow(point[0] - newPointData[0], 2) + Math.pow(point[1] - newPointData[1], 2));
                                            if (dist < 0.02) {
                                                pointExists = true;
                                                break;
                                            }
                                        }
                                        if (!pointExists) {
                                            const newPoint = newPointData;
                                            currentCurvePoints.push(newPoint);
                                            currentCurvePoints.sort((a, b) => a[0] - b[0]);
                                            this.lastSelectedPointRef = newPoint;
                                            node.setDirtyCanvas(true, true);
                                        }
                                    }
                                }

                                event.stopPropagation();
                                return true;
                            } else if (event.type === LiteGraph.pointerevents_method + 'move' && this.draggingPoint) {
                                if (this.draggingPoint.channel !== this.activeChannel) {
                                    this.draggingPoint = null;
                                    this.lastSelectedPointRef = null;
                                    return false;
                                }
                                const targetX = mouseX - this.dragOffset[0];
                                const targetY = mouseY - this.dragOffset[1];
                                const newPointData = mapCanvasToData(targetX, targetY, curveRect);
                                const index = this.draggingPoint.index;
                                const points = this.curves[this.draggingPoint.channel];

                                if (index === 0) {
                                    points[index][0] = 0;
                                    points[index][1] = newPointData[1];
                                } else if (index === points.length - 1) {
                                    points[index][0] = 1;
                                    points[index][1] = newPointData[1];
                                } else {
                                    const prevX = points[index - 1][0];
                                    const nextX = points[index + 1][0];
                                    newPointData[0] = Math.max(prevX + 0.001, Math.min(nextX - 0.001, newPointData[0]));

                                    points[index][0] = newPointData[0];
                                    points[index][1] = newPointData[1];
                                }

                                node.setDirtyCanvas(true, true);
                                event.stopPropagation();
                                return true;
                            } else if (event.type === LiteGraph.pointerevents_method + 'up' && this.draggingPoint) {
                                this.draggingPoint = null;
                                this.dragOffset = [0, 0];
                                node.setDirtyCanvas(true, true);
                                event.stopPropagation();
                                return true;
                            } else if (event.type === LiteGraph.pointerevents_method + 'dblclick') {
                                const currentCurvePoints = this.curves[this.activeChannel];
                                for (let i = currentCurvePoints.length - 2; i > 0; i--) {
                                    const pointData = currentCurvePoints[i];
                                    const pointCanvas = mapDataToCanvas(pointData[0], pointData[1], curveRect);
                                    const distSq = (mouseX - pointCanvas[0]) * (mouseX - pointCanvas[0]) +
                                                   (mouseY - pointCanvas[1]) * (mouseY - pointCanvas[1]);
                                    if (distSq <= HIT_TOLERANCE * HIT_TOLERANCE) {
                                         currentCurvePoints.splice(i, 1);
                                         this.lastSelectedPointRef = null;
                                         node.setDirtyCanvas(true, true);
                                         event.stopPropagation();
                                         return true;
                                    }
                                }
                            }
                        }

                        return false;
                    },

                    configure: function(data) {
                       if (data && data[this.name]) {
                           const savedData = data[this.name];
                            if (savedData && savedData.red && Array.isArray(savedData.red) && savedData.red.length > 0 && Array.isArray(savedData.red[0]) && savedData.red[0].length === 2) {
                                this.curves = JSON.parse(JSON.stringify(savedData));
                                this.curves.red.sort((a, b) => a[0] - b[0]);
                                this.curves.green.sort((a, b) => a[0] - b[0]);
                                this.curves.blue.sort((a, b) => a[0] - b[0]);
                                this.lastSelectedPointRef = null;
                           } else {
                               this.curves = { red: [[0, 0], [1, 1]], green: [[0, 0], [1, 1]], blue: [[0, 0], [1, 1]] };
                               this.lastSelectedPointRef = null;
                           }
                            node.setDirtyCanvas(true, true);
                       } else {
                           this.curves = { red: [[0, 0], [1, 1]], green: [[0, 0], [1, 1]], blue: [[0, 0], [1, 1]] };
                           this.lastSelectedPointRef = null;
                       }
                    }
                };

                const addedWidget = node.addCustomWidget(widget);

                return {
                    widget: addedWidget,
                    minWidth: 150,
                };
            },
        };
    },
});
