import { app } from "../../../scripts/app.js";
import { api } from '../../../scripts/api.js';

// --- Helper Functions ---
function lerp(a, b, t) {
    return a + (b - a) * t;
}

function mapDataToCanvas(x, y, rect) {
    const canvasX = lerp(rect.x, rect.x + rect.width, x);
    const canvasY = lerp(rect.y + rect.height, rect.y, y); // Invert Y for canvas
    return [canvasX, canvasY];
}

function mapCanvasToData(px, py, rect) {
    const dataX = (px - rect.x) / rect.width;
    const dataY = 1.0 - (py - rect.y) / rect.height; // Invert Y from canvas
    return [
        Math.max(0, Math.min(1, dataX)),
        Math.max(0, Math.min(1, dataY))
    ];
}

/**
 * Interpolates a curve defined by points into a 256-value array.
 * Also scales the output if it exceeds [0,1] bounds, then clamps.
 * @param {Array<Array<number>>} points Array of [x, y] points, sorted by x.
 * @returns {Array<number>} Array of 256 float values.
 */
function interpolateCurve(points) {
    if (!points || points.length < 2) {
        const defaultOutput = new Float32Array(256);
        defaultOutput.fill(0.5); // Default to half
        return Array.from(defaultOutput);
    }

    points.sort((a, b) => a[0] - b[0]);

    if (points[0][0] > 0) points.unshift([0, points[0][1]]);
    if (points[points.length - 1][0] < 1) points.push([1, points[points.length - 1][1]]);

    const output = new Float32Array(256);

    for (let i = 0; i < 256; i++) {
        const x = i / 255.0;
        let p1 = points[0];
        let p2 = points[points.length - 1];

        for (let j = 0; j < points.length - 1; j++) {
            if (x >= points[j][0] && x <= points[j + 1][0]) {
                if (points[j][0] === points[j+1][0]) {
                    if (x === points[j][0]){
                        output[i] = points[j+1][1];
                        continue;
                    } else {
                        continue;
                    }
                }
                p1 = points[j];
                p2 = points[j + 1];
                break;
            }
        }

        if (x < points[0][0]) {
            output[i] = points[0][1];
        } else if (x > points[points.length - 1][0]) {
            output[i] = points[points.length - 1][1];
        } else if (p1[0] === p2[0]) {
            output[i] = p1[1];
        } else {
            const t = (x - p1[0]) / (p2[0] - p1[0]);
            output[i] = lerp(p1[1], p2[1], t);
        }
        // Initial clamp during generation, comprehensive scaling/clamping will follow
        output[i] = Math.max(0, Math.min(1, output[i]));
    }

    // Scaling logic for out-of-bounds values
    let min_actual = output[0];
    let max_actual = output[0];
    for (let k = 1; k < 256; k++) {
        if (output[k] < min_actual) min_actual = output[k];
        if (output[k] > max_actual) max_actual = output[k];
    }

    const needs_scaling_min = min_actual < 0.0;
    const needs_scaling_max = max_actual > 1.0;

    if (needs_scaling_min || needs_scaling_max) {
        if (min_actual >= max_actual) { // Flat line or problematic range
            const clamped_val = Math.max(0, Math.min(1, min_actual));
            for (let k = 0; k < 256; k++) output[k] = clamped_val;
        } else {
            const current_range = max_actual - min_actual;
            let scale_target_min = min_actual;
            let scale_target_max = max_actual;

            if (needs_scaling_min && needs_scaling_max) { // Both bounds crossed
                scale_target_min = 0.0;
                scale_target_max = 1.0;
            } else if (needs_scaling_min) { // Only min crossed
                scale_target_min = 0.0;
                // scale_target_max remains max_actual (original max)
            } else { // Only max crossed (needs_scaling_max is true)
                // scale_target_min remains min_actual (original min)
                scale_target_max = 1.0;
            }

            if (current_range > EPSILON) { // Avoid division by zero if somehow min_actual ~ max_actual
                 for (let k = 0; k < 256; k++) {
                    output[k] = (output[k] - min_actual) / current_range * (scale_target_max - scale_target_min) + scale_target_min;
                }
            } else { // If range is effectively zero (flat line that was out of bounds)
                 const clamped_val = Math.max(0, Math.min(1, (needs_scaling_min ? 0 : (needs_scaling_max ? 1 : min_actual)) ));
                 for (let k = 0; k < 256; k++) output[k] = clamped_val;
            }
        }
    }

    // Final safety clamp after any scaling
    for (let k = 0; k < 256; k++) {
        output[k] = Math.max(0, Math.min(1, output[k]));
    }

    return Array.from(output);
}

// --- Curve Generation Functions ---
const SEGMENTS_PER_CYCLE = 32;
const EPSILON = 0.00001;

function applyInvert(y, invert) {
    return invert ? 1.0 - y : y;
}

function generateSinePoints(frequency, offset, invert) {
    const points = [];
    const numSegments = Math.max(4, Math.ceil(frequency * SEGMENTS_PER_CYCLE));
    let initialPhase = -offset * 2.0 * Math.PI;
    let initialY = 0.5 * (1.0 - Math.cos(initialPhase));
    initialY = applyInvert(initialY, invert);
    points.push([0, Math.max(0, Math.min(1, initialY))]);

    for (let i = 1; i <= numSegments; i++) {
        const x = i / numSegments;
        const phase = frequency * x * 2.0 * Math.PI - offset * 2.0 * Math.PI;
        let y = 0.5 * (1.0 - Math.cos(phase));
        y = applyInvert(y, invert);
        points.push([x, Math.max(0, Math.min(1, y))]);
    }
    const finalPhase = frequency * 1.0 * 2.0 * Math.PI - offset * 2.0 * Math.PI;
    let finalY = 0.5 * (1.0 - Math.cos(finalPhase));
    finalY = applyInvert(finalY, invert);
    if (points[points.length - 1][0] < 1.0) {
        points.push([1.0, Math.max(0, Math.min(1, finalY))]);
    } else {
        points[points.length - 1][0] = 1.0;
        points[points.length - 1][1] = Math.max(0, Math.min(1, finalY));
    }
    return points;
}

function generateSquarePoints(frequency, offset, invert) {
    const points = [];
    const initialPhase = (-offset % 1.0 + 1.0) % 1.0;
    let initialY = (initialPhase >= 0.5) ? 1 : 0;
    initialY = applyInvert(initialY, invert);
    points.push([0, initialY]);

    const transitionPointsX = [];
    for(let n = Math.floor(offset - 1); n < frequency + Math.abs(offset) + 1; n++) {
        const x_up = (n + 0.5 + offset) / frequency;
        const x_down = (n + 1.0 + offset) / frequency;
        if (x_up > EPSILON && x_up < 1.0 - EPSILON) transitionPointsX.push({x: x_up, type: 'up'});
        if (x_down > EPSILON && x_down < 1.0 - EPSILON) transitionPointsX.push({x: x_down, type: 'down'});
    }
    transitionPointsX.sort((a, b) => a.x - b.x);

    let currentY = initialY;
    for (const tp of transitionPointsX) {
        let y_after = (tp.type === 'up') ? (invert ? 0 : 1) : (invert ? 1 : 0);
        if (currentY !== y_after) {
            points.push([tp.x - EPSILON, currentY]);
            points.push([tp.x, y_after]);
            currentY = y_after;
        }
    }

    const finalPhase = (frequency * 1.0 - offset) % 1.0;
    let endY = (finalPhase >= 0.5) ? 1 : 0;
    endY = applyInvert(endY, invert);

    let lastPoint = points[points.length - 1];
    if (lastPoint[0] < 1.0) {
        points.push([1.0, lastPoint[1]]);
        if (lastPoint[1] !== endY && Math.abs(lastPoint[0] - 1.0) < EPSILON * 2) {
            points[points.length-1][1] = endY;
        } else if (lastPoint[1] !== endY){
            points.push([1.0 - EPSILON, lastPoint[1]]);
            points.push([1.0, endY]);
        }
    } else {
        points[points.length - 1][0] = 1.0;
        points[points.length - 1][1] = endY;
    }

    const uniquePoints = [];
    if (points.length > 0) {
        uniquePoints.push(points[0]);
        for (let i = 1; i < points.length; i++) {
            if (Math.abs(points[i][0] - points[i-1][0]) > EPSILON / 2 || points[i][1] !== points[i-1][1]) {
                uniquePoints.push(points[i]);
            } else {
                uniquePoints[uniquePoints.length - 1][0] = points[i][0];
                uniquePoints[uniquePoints.length - 1][1] = points[i][1];
            }
        }
    }
    if (uniquePoints.length > 0) {
        uniquePoints[0][0] = 0.0; uniquePoints[0][1] = initialY;
        uniquePoints[uniquePoints.length-1][0] = 1.0; uniquePoints[uniquePoints.length-1][1] = endY;
    } else {
        uniquePoints.push([0.0, initialY]); uniquePoints.push([1.0, endY]);
    }
    return uniquePoints;
}

function generateTrianglePoints(frequency, offset, invert) {
    const points = [];
    const numSegments = Math.max(4, Math.ceil(frequency * SEGMENTS_PER_CYCLE));
    const initialPhase = (-offset % 1.0 + 1.0) % 1.0;
    let initialY = 1.0 - Math.abs(initialPhase * 2.0 - 1.0);
    initialY = applyInvert(initialY, invert);
    points.push([0, Math.max(0, Math.min(1, initialY))]);

    for (let i = 1; i <= numSegments; i++) {
        const x = i / numSegments;
        const phase = (frequency * x - offset) % 1.0;
        let y = 1.0 - Math.abs(phase * 2.0 - 1.0);
        y = applyInvert(y, invert);
        points.push([x, Math.max(0, Math.min(1, y))]);
    }
    const finalPhase = (frequency * 1.0 - offset) % 1.0;
    let finalY = 1.0 - Math.abs(finalPhase * 2.0 - 1.0);
    finalY = applyInvert(finalY, invert);
    if (points[points.length - 1][0] < 1.0) {
        points.push([1.0, Math.max(0, Math.min(1, finalY))]);
    } else {
        points[points.length - 1][0] = 1.0;
        points[points.length - 1][1] = Math.max(0, Math.min(1, finalY));
    }
    return points;
}

function generateSawPoints(frequency, offset, invert) {
    const points = [];
    const numSegments = Math.max(4, Math.ceil(frequency * SEGMENTS_PER_CYCLE));

    const correctInitialPhase = (-offset % 1.0 + 1.0) % 1.0;
    let initialY = correctInitialPhase;
    initialY = applyInvert(initialY, invert);
    points.push([0, Math.max(0, Math.min(1, initialY))]);

    for (let i = 1; i <= numSegments; i++) {
        const x = i / numSegments;
        const currentRawPhase = frequency * x - offset;
        let phaseForCalc = (currentRawPhase % 1.0 + 1.0) % 1.0;
        // If at the end of a segment and it's the end of a cycle, use 1.0 for phase
        if (x < 1.0 && phaseForCalc < EPSILON && currentRawPhase > EPSILON) { // Approx end of cycle before x=1
             // This helps make sure the point *before* a drop is high
            const prevRawPhase = frequency * (x - 1/numSegments) - offset;
            if (Math.floor(currentRawPhase) > Math.floor(prevRawPhase)) { // A cycle just ended
                phaseForCalc = 1.0;
            }
        }
        let y = phaseForCalc;
        y = applyInvert(y, invert);
        points.push([x, Math.max(0, Math.min(1, y))]);
    }

    let rawFinalVal = frequency * 1.0 - offset;
    let correctFinalPhase;
    // If x=1 is the exact end of an integer number of cycles, phase for Y calc should be 1.0
    // (So Saw ends high, e.g. 0 to 1 for freq=1)
    // Otherwise, it's the usual phase value.
    if (Math.abs(rawFinalVal % 1.0) < EPSILON && rawFinalVal > EPSILON && frequency >= 1) {
        correctFinalPhase = 1.0;
    } else {
        correctFinalPhase = (rawFinalVal % 1.0 + 1.0) % 1.0;
    }
    let finalY = correctFinalPhase;
    finalY = applyInvert(finalY, invert);

    // Ensure last point uses the calculated finalY
    if (points[points.length - 1][0] < 1.0) {
        points.push([1.0, Math.max(0, Math.min(1, finalY))]);
    } else {
        points[points.length - 1][0] = 1.0;
        points[points.length - 1][1] = Math.max(0, Math.min(1, finalY));
    }

    const uniquePoints = [];
    if (points.length > 0) uniquePoints.push(points[0]);
    for(let i = 1; i < points.length; i++) {
        const prev_x = points[i-1][0]; const curr_x = points[i][0];
        const prevRawPhase = frequency * prev_x - offset;
        const currRawPhase = frequency * curr_x - offset;

        if (Math.floor(currRawPhase) > Math.floor(prevRawPhase)) { // Cycle wrap detected
            const N = Math.floor(currRawPhase); // Integer part of current phase
            const wrapX = (N + offset) / frequency; // x where phase becomes N

            if (wrapX > prev_x + EPSILON && wrapX < curr_x + EPSILON) {
                // Point just before wrap (should be high, phase ~1.0)
                let y_before_wrap = applyInvert(1.0, invert);
                // Point just after wrap (should be low, phase ~0.0)
                let y_after_wrap = applyInvert(0.0, invert);

                // Add previous point if not already the start of unique list for this segment
                if (uniquePoints.length === 0 || uniquePoints[uniquePoints.length-1][0] < prev_x - EPSILON) {
                     uniquePoints.push(points[i-1]);
                } else if (Math.abs(uniquePoints[uniquePoints.length-1][0] - points[i-1][0]) > EPSILON) {
                     uniquePoints.push(points[i-1]);
                }


                uniquePoints.push([wrapX - EPSILON, Math.max(0, Math.min(1, y_before_wrap))]);
                uniquePoints.push([wrapX, Math.max(0, Math.min(1, y_after_wrap))]);
            }
        }
        // Add current point from loop, if it's not too close to the artificially added wrap points
        let lastUniqueX = uniquePoints.length > 0 ? uniquePoints[uniquePoints.length-1][0] : -1;
        if (curr_x > lastUniqueX + EPSILON) {
            uniquePoints.push(points[i]);
        } else if (uniquePoints.length > 0 && Math.abs(curr_x - lastUniqueX) < EPSILON) {
            // If x is same, overwrite with current point's Y (likely the one from loop, not artificial)
             uniquePoints[uniquePoints.length-1][1] = points[i][1];
        }


    }
    const finalUniquePoints = []; // Clean up nearly duplicate X values
    if(uniquePoints.length > 0) {
        finalUniquePoints.push(uniquePoints[0]);
        for(let i=1; i<uniquePoints.length; i++) {
            if(uniquePoints[i][0] > finalUniquePoints[finalUniquePoints.length-1][0] + EPSILON) {
                finalUniquePoints.push(uniquePoints[i]);
            } else { // X is very close or same, overwrite previous to take the latter Y value
                finalUniquePoints[finalUniquePoints.length-1] = uniquePoints[i];
            }
        }
    }

    // Force start and end points after all processing
    if (finalUniquePoints.length > 0) {
        finalUniquePoints[0][0]=0;
        finalUniquePoints[0][1]= Math.max(0, Math.min(1, applyInvert(correctInitialPhase, invert)));
        finalUniquePoints[finalUniquePoints.length-1][0]=1;
        finalUniquePoints[finalUniquePoints.length-1][1]= Math.max(0, Math.min(1, applyInvert(correctFinalPhase, invert))); // Uses the adjusted correctFinalPhase
    } else { // Fallback if list became empty
        finalUniquePoints.push([0, Math.max(0, Math.min(1, applyInvert(correctInitialPhase, invert)))]);
        finalUniquePoints.push([1, Math.max(0, Math.min(1, applyInvert(correctFinalPhase, invert)))]);
    }
    return finalUniquePoints;
}


function generateLogPoints(frequency, offset, invert) {
    const points = [];
    const numSegments = Math.max(4, Math.ceil(frequency * SEGMENTS_PER_CYCLE));
    const initialPhase = (-offset % 1.0 + 1.0) % 1.0;
    let initialY = Math.log(1 + (Math.E - 1) * initialPhase); // Use actual initialPhase for x=0
    initialY = applyInvert(initialY, invert);
    points.push([0, Math.max(0, Math.min(1, initialY))]);

    for (let i = 1; i <= numSegments; i++) {
        const x = i / numSegments;
        const phase = (frequency * x - offset) % 1.0;
        const currentPhaseX = (phase === 0 && x > 0 && x < 1.0) ? 1.0 : phase; // If phase is 0 mid-curve, treat as end of a sub-cycle
        let y = Math.log(1 + (Math.E - 1) * currentPhaseX);
        y = applyInvert(y, invert);
        points.push([x, Math.max(0, Math.min(1, y))]);
    }

    const finalPhaseRaw = (frequency * 1.0 - offset) % 1.0;
    const finalPhaseX = (finalPhaseRaw === 0 && frequency >= 1) ? 1.0 : finalPhaseRaw; // If end phase is 0, use 1.0 for calc
    let finalY = Math.log(1 + (Math.E - 1) * finalPhaseX);
    finalY = applyInvert(finalY, invert);

    if (points[points.length - 1][0] < 1.0) {
        points.push([1.0, Math.max(0, Math.min(1, finalY))]);
    } else {
        points[points.length - 1][0] = 1.0;
        points[points.length - 1][1] = Math.max(0, Math.min(1, finalY));
    }
    return points;
}

function generateExponentialPoints(frequency, offset, invert) {
    const points = [];
    const numSegments = Math.max(4, Math.ceil(frequency * SEGMENTS_PER_CYCLE));
    const initialPhase = (-offset % 1.0 + 1.0) % 1.0;
    let initialY = (Math.exp(initialPhase) - 1) / (Math.E - 1); // Use actual initialPhase for x=0
    initialY = applyInvert(initialY, invert);
    points.push([0, Math.max(0, Math.min(1, initialY))]);

    for (let i = 1; i <= numSegments; i++) {
        const x = i / numSegments;
        const phase = (frequency * x - offset) % 1.0;
        const currentPhaseX = (phase === 0 && x > 0 && x < 1.0) ? 1.0 : phase;
        let y = (Math.exp(currentPhaseX) - 1) / (Math.E - 1);
        y = applyInvert(y, invert);
        points.push([x, Math.max(0, Math.min(1, y))]);
    }
    const finalPhaseRaw = (frequency * 1.0 - offset) % 1.0;
    const finalPhaseX = (finalPhaseRaw === 0 && frequency >= 1) ? 1.0 : finalPhaseRaw;
    let finalY = (Math.exp(finalPhaseX) - 1) / (Math.E - 1);
    finalY = applyInvert(finalY, invert);
    if (points[points.length - 1][0] < 1.0) {
        points.push([1.0, Math.max(0, Math.min(1, finalY))]);
    } else {
        points[points.length - 1][0] = 1.0;
        points[points.length - 1][1] = Math.max(0, Math.min(1, finalY));
    }
    return points;
}

function generateLinearPoints(invert) {
    return invert ? [[0, 1], [1, 0]] : [[0, 0], [1, 1]];
}

function generateMaxPoints(invert) {
    const y = applyInvert(1.0, invert);
    return [[0, y], [1, y]];
}

function generateHalfPoints(invert) {
    const y = applyInvert(0.5, invert);
    return [[0, y], [1, y]];
}

function generateCurvePoints(type, frequency, offset, invert) {
    frequency = Math.max(1, frequency);
    offset = Math.max(-1.0, Math.min(1.0, offset));

    switch (type) {
        case "Sine": return generateSinePoints(frequency, offset, invert);
        case "Square": return generateSquarePoints(frequency, offset, invert);
        case "Triangle": return generateTrianglePoints(frequency, offset, invert);
        case "Saw": return generateSawPoints(frequency, offset, invert);
        case "Log": return generateLogPoints(frequency, offset, invert);
        case "Exponential": return generateExponentialPoints(frequency, offset, invert);
        case "Max": return generateMaxPoints(invert);
        case "Half": return generateHalfPoints(invert);
        case "Linear":
        default:
            return generateLinearPoints(invert);
    }
}

// --- Widget Constants ---
const PAD = 10;
const BUTTON_HEIGHT = 25;
const TOP_BUTTON_HEIGHT = 20;
const POINT_RADIUS = 5;
const HIT_TOLERANCE = 10;
const CURVE_AREA_HEIGHT = 120;
const WIDGET_TYPE_STRING = "rgb_curve_editor_widget";

app.registerExtension({
    name: "comfyui.rgb_curve_editor_advanced",
    getCustomWidgets: () => {
        return {
            [WIDGET_TYPE_STRING]: (node, inputName, inputData, appInstance) => {
                const widget = {
                    element: document.createElement("div"),
                    parent: node, name: inputName, type: WIDGET_TYPE_STRING, value: {},
                    draggingPoint: null, dragOffset: [0, 0], activeChannel: 'red',
                    buttons: {}, widgetY: 0, lastSelectedPointRef: null,
                    curves: {
                        red: generateHalfPoints(false),
                        green: generateHalfPoints(false),
                        blue: generateHalfPoints(false)
                    },
                    draw: function(ctx, node, width, y) {
                        this.computeSize(width);
                        const [widgetWidth, widgetHeight] = this.size;
                        this.widgetY = y;
                        ctx.fillStyle = LiteGraph.WIDGET_BGCOLOR;
                        ctx.fillRect(0, y, widgetWidth, widgetHeight);
                        let currentY = y + PAD;
                        const topButtonLabels = ['Reset Channel', 'Delete Point', 'Apply Curve'];
                        const topButtonWidth = (widgetWidth - PAD * (topButtonLabels.length + 1)) / topButtonLabels.length;
                        this.buttons = {};
                        ctx.textAlign = "center"; ctx.textBaseline = "middle";
                        for (let i = 0; i < topButtonLabels.length; i++) {
                            const btnLabel = topButtonLabels[i];
                            const btnX = PAD + i * (topButtonWidth + PAD); const btnY = currentY;
                            ctx.fillStyle = "#555"; ctx.fillRect(btnX, btnY, topButtonWidth, TOP_BUTTON_HEIGHT);
                            ctx.fillStyle = "#fff"; ctx.font = `${TOP_BUTTON_HEIGHT * 0.6}px Arial`;
                            ctx.fillText(btnLabel, btnX + topButtonWidth / 2, btnY + TOP_BUTTON_HEIGHT / 2);
                            this.buttons[btnLabel] = { x: btnX, y: btnY, width: topButtonWidth, height: TOP_BUTTON_HEIGHT };
                        }
                        currentY += TOP_BUTTON_HEIGHT + PAD;
                        const curveRect = { x: PAD, y: currentY, width: widgetWidth - PAD * 2, height: CURVE_AREA_HEIGHT };
                        this.curveRect = curveRect;
                        ctx.fillStyle = "#222"; ctx.fillRect(curveRect.x, curveRect.y, curveRect.width, curveRect.height);
                        const channels = ['red', 'green', 'blue'];
                        ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
                        for (const channel of channels) {
                            if (channel !== this.activeChannel) {
                                const curvePoints = this.curves[channel];
                                if (curvePoints && curvePoints.length > 0) {
                                    ctx.globalAlpha = 0.5; ctx.strokeStyle = channel; ctx.beginPath();
                                    let firstPt = mapDataToCanvas(curvePoints[0][0], curvePoints[0][1], curveRect);
                                    ctx.moveTo(firstPt[0], firstPt[1]);
                                    for (let i = 1; i < curvePoints.length; i++) {
                                        const pt = mapDataToCanvas(curvePoints[i][0], curvePoints[i][1], curveRect);
                                        ctx.lineTo(pt[0], pt[1]);
                                    }
                                    ctx.stroke();
                                }
                            }
                        }
                        const activeCurvePoints = this.curves[this.activeChannel];
                        if (activeCurvePoints && activeCurvePoints.length > 0) {
                            ctx.globalAlpha = 1.0; ctx.strokeStyle = this.activeChannel; ctx.beginPath();
                            let firstPt = mapDataToCanvas(activeCurvePoints[0][0], activeCurvePoints[0][1], curveRect);
                            ctx.moveTo(firstPt[0], firstPt[1]);
                            for (let i = 1; i < activeCurvePoints.length; i++) {
                                const pt = mapDataToCanvas(activeCurvePoints[i][0], activeCurvePoints[i][1], curveRect);
                                ctx.lineTo(pt[0], pt[1]);
                            }
                            ctx.stroke();
                            ctx.fillStyle = this.activeChannel;
                            for (let i = 0; i < activeCurvePoints.length; i++) {
                                const pointData = activeCurvePoints[i];
                                const pointCanvas = mapDataToCanvas(pointData[0], pointData[1], curveRect);
                                ctx.beginPath();
                                const radius = (pointData === this.lastSelectedPointRef) ? POINT_RADIUS * 1.5 : POINT_RADIUS;
                                ctx.arc(pointCanvas[0], pointCanvas[1], radius, 0, Math.PI * 2);
                                ctx.fill();
                                ctx.strokeStyle = "white"; ctx.lineWidth = 0.5; ctx.stroke();
                            }
                        }
                        ctx.globalAlpha = 1.0; ctx.lineWidth = 1;
                        currentY += CURVE_AREA_HEIGHT + PAD;
                        const channelButtons = ['red', 'green', 'blue'];
                        const channelButtonWidth = (widgetWidth - PAD * (channelButtons.length + 1)) / channelButtons.length;
                        ctx.textAlign = "center"; ctx.textBaseline = "middle";
                        for (let i = 0; i < channelButtons.length; i++) {
                            const btnColor = channelButtons[i];
                            const btnX = PAD + i * (channelButtonWidth + PAD); const btnY = currentY;
                            ctx.fillStyle = (this.activeChannel === btnColor) ? btnColor : "#555";
                            ctx.fillRect(btnX, btnY, channelButtonWidth, BUTTON_HEIGHT);
                            ctx.fillStyle = "#fff"; ctx.font = `${BUTTON_HEIGHT * 0.7}px Arial`;
                            ctx.fillText(btnColor.toUpperCase().charAt(0), btnX + channelButtonWidth / 2, btnY + BUTTON_HEIGHT / 2);
                            this.buttons[btnColor] = { x: btnX, y: btnY, width: channelButtonWidth, height: BUTTON_HEIGHT };
                        }
                        this.value = this.serializeValue();
                    },
                    computeSize: function(width) {
                        this.size = [width, PAD + TOP_BUTTON_HEIGHT + PAD + CURVE_AREA_HEIGHT + PAD + BUTTON_HEIGHT + PAD];
                        return this.size;
                    },
                    serializeValue: function() {
                        const safeInterpolate = (points) => {
                            if (!points || points.length < 2) return Array.from({ length: 256 }, () => 0.5);
                            const sortedPoints = [...points].sort((a, b) => a[0] - b[0]);
                            return interpolateCurve(sortedPoints); // interpolateCurve now handles scaling
                        };
                        return {
                            red: safeInterpolate(this.curves.red),
                            green: safeInterpolate(this.curves.green),
                            blue: safeInterpolate(this.curves.blue)
                        };
                    },
                    mouse: function(event, pos, node) {
                        const mouseX = pos[0]; const mouseY = pos[1];
                        let pointsChanged = false;
                        if (event.type === LiteGraph.pointerevents_method + 'down') {
                            for (const btnLabel of ['Reset Channel', 'Delete Point', 'Apply Curve']) {
                                const btnRect = this.buttons[btnLabel];
                                if (btnRect && mouseX >= btnRect.x && mouseX <= btnRect.x + btnRect.width && mouseY >= btnRect.y && mouseY <= btnRect.y + btnRect.height) {
                                    const activeCurve = this.curves[this.activeChannel];
                                    switch (btnLabel) {
                                        case 'Reset Channel':
                                            this.curves[this.activeChannel] = generateHalfPoints(false); this.lastSelectedPointRef = null; pointsChanged = true; break;
                                        case 'Delete Point':
                                            if (this.lastSelectedPointRef) {
                                                const idx = activeCurve.indexOf(this.lastSelectedPointRef);
                                                if (idx > 0 && idx < activeCurve.length - 1) { activeCurve.splice(idx, 1); this.lastSelectedPointRef = null; pointsChanged = true; }
                                            } break;
                                        case 'Apply Curve':
                                            const typeW = node.widgets.find(w=>w.name==="curve_type"), freqW=node.widgets.find(w=>w.name==="frequency"), offW=node.widgets.find(w=>w.name==="offset"), invW=node.widgets.find(w=>w.name==="invert");
                                            if(typeW&&freqW&&offW&&invW){ this.curves[this.activeChannel] = generateCurvePoints(typeW.value, freqW.value, offW.value, invW.value); this.lastSelectedPointRef = null; pointsChanged = true;}
                                            break;
                                    }
                                    if (pointsChanged) { node.setDirtyCanvas(true, true); this.value = this.serializeValue(); if (node.graph) node.graph.setDirtyCanvas(true, true); }
                                    event.stopPropagation(); return true;
                                }
                            }
                            for (const btnColor of ['red', 'green', 'blue']) {
                                const btnRect = this.buttons[btnColor];
                                if (btnRect && mouseX >= btnRect.x && mouseX <= btnRect.x + btnRect.width && mouseY >= btnRect.y && mouseY <= btnRect.y + btnRect.height) {
                                    if (this.activeChannel !== btnColor) { this.activeChannel = btnColor; this.lastSelectedPointRef = null; node.setDirtyCanvas(true,true); if(node.graph)node.graph.setDirtyCanvas(true,true); }
                                    event.stopPropagation(); return true;
                                }
                            }
                        }
                        const curveRect = this.curveRect;
                        if (curveRect && mouseX >= curveRect.x && mouseX <= curveRect.x + curveRect.width && mouseY >= curveRect.y && mouseY <= curveRect.y + curveRect.height) {
                            const currentCurvePoints = this.curves[this.activeChannel];
                            if (event.type === LiteGraph.pointerevents_method + 'down') {
                                let foundPt = false;
                                for (let i = currentCurvePoints.length - 1; i >= 0; i--) {
                                    const pData = currentCurvePoints[i], pCanvas = mapDataToCanvas(pData[0],pData[1],curveRect);
                                    if (((mouseX-pCanvas[0])**2 + (mouseY-pCanvas[1])**2) <= HIT_TOLERANCE**2) {
                                        this.draggingPoint={channel:this.activeChannel,index:i}; this.dragOffset=[mouseX-pCanvas[0],mouseY-pCanvas[1]]; this.lastSelectedPointRef=pData; foundPt=true; node.setDirtyCanvas(true,true); if(node.graph)node.graph.setDirtyCanvas(true,true); break;
                                    }
                                }
                                if (!foundPt) {
                                    const [dataX,dataY]=mapCanvasToData(mouseX,mouseY,curveRect);
                                    if(dataX > 0.01 && dataX < 0.99){
                                        let tooClose=false; for(const p of currentCurvePoints) if(Math.abs(p[0]-dataX)<0.02){tooClose=true;break;}
                                        if(!tooClose){const newPt=[dataX,dataY]; currentCurvePoints.push(newPt); currentCurvePoints.sort((a,b)=>a[0]-b[0]); this.lastSelectedPointRef=newPt; pointsChanged=true; const newIdx=currentCurvePoints.indexOf(newPt),pCanv=mapDataToCanvas(newPt[0],newPt[1],curveRect); this.draggingPoint={channel:this.activeChannel,index:newIdx};this.dragOffset=[mouseX-pCanv[0],mouseY-pCanv[1]];}
                                    }
                                }
                                event.stopPropagation(); if(pointsChanged){node.setDirtyCanvas(true,true);if(node.graph)node.graph.setDirtyCanvas(true,true);} return true;
                            } else if (event.type === LiteGraph.pointerevents_method + 'move' && this.draggingPoint) {
                                if(this.draggingPoint.channel!==this.activeChannel){this.draggingPoint=null; return false;}
                                const [dataX,dataY]=mapCanvasToData(mouseX-this.dragOffset[0],mouseY-this.dragOffset[1],curveRect);
                                const idx=this.draggingPoint.index, pts=this.curves[this.draggingPoint.channel];
                                if(idx===0){pts[idx][0]=0;pts[idx][1]=Math.max(0,Math.min(1,dataY));}
                                else if(idx===pts.length-1){pts[idx][0]=1;pts[idx][1]=Math.max(0,Math.min(1,dataY));}
                                else{pts[idx][0]=Math.max(pts[idx-1][0]+EPSILON,Math.min(pts[idx+1][0]-EPSILON,dataX)); pts[idx][1]=Math.max(0,Math.min(1,dataY));}
                                pointsChanged=true; event.stopPropagation(); if(pointsChanged){node.setDirtyCanvas(true,true);this.value=this.serializeValue();if(node.graph)node.graph.setDirtyCanvas(true,true);} return true;
                            } else if (event.type === LiteGraph.pointerevents_method + 'dblclick') {
                                for (let i=currentCurvePoints.length-2;i>0;i--) {
                                    const pData=currentCurvePoints[i],pCanv=mapDataToCanvas(pData[0],pData[1],curveRect);
                                    if(((mouseX-pCanv[0])**2 + (mouseY-pCanv[1])**2) <= HIT_TOLERANCE**2){currentCurvePoints.splice(i,1);this.lastSelectedPointRef=null;pointsChanged=true;break;}
                                }
                                if(pointsChanged){node.setDirtyCanvas(true,true);this.value=this.serializeValue();if(node.graph)node.graph.setDirtyCanvas(true,true);} event.stopPropagation();return true;
                            }
                        }
                        if (event.type === LiteGraph.pointerevents_method + 'up' && this.draggingPoint) {
                            this.draggingPoint=null;this.dragOffset=[0,0]; this.curves[this.activeChannel].sort((a,b)=>a[0]-b[0]);
                            this.value=this.serializeValue(); node.setDirtyCanvas(true,true);if(node.graph)node.graph.setDirtyCanvas(true,true);
                            event.stopPropagation();return true;
                        }
                        return false;
                    },
                    configure: function(data) {
                        const defaultHalf = {red:generateHalfPoints(false),green:generateHalfPoints(false),blue:generateHalfPoints(false)};
                        if (node.properties && node.properties['//RGB Curve Points']) {
                            try {
                                const sCrv = JSON.parse(node.properties['//RGB Curve Points']);
                                if (sCrv && sCrv.red && Array.isArray(sCrv.red) && sCrv.green && Array.isArray(sCrv.green) && sCrv.blue && Array.isArray(sCrv.blue)) {
                                    const valPts=(arr)=>arr.filter(p=>Array.isArray(p)&&p.length===2&&typeof p[0]==='number'&&!isNaN(p[0])&&typeof p[1]==='number'&&!isNaN(p[1])).map(p=>[Math.max(0,Math.min(1,p[0])),Math.max(0,Math.min(1,p[1]))]);
                                    const ensEnds=(arr)=>{if(!arr.find(p=>p[0]===0))arr.push([0,arr[0]?.[1]??0.5]); if(!arr.find(p=>p[0]===1))arr.push([1,arr[arr.length-1]?.[1]??0.5]); arr.sort((a,b)=>a[0]-b[0]); return arr.reduce((acc,p)=>{if(acc.length===0||acc[acc.length-1][0]!==p[0])acc.push(p);else acc[acc.length-1]=p;return acc;},[]);};
                                    this.curves.red=ensEnds(valPts(sCrv.red)); this.curves.green=ensEnds(valPts(sCrv.green)); this.curves.blue=ensEnds(valPts(sCrv.blue));
                                } else {this.curves = defaultHalf;}
                            } catch (e) {this.curves = defaultHalf;}
                        } else {this.curves = defaultHalf;}
                        this.lastSelectedPointRef=null; this.value=this.serializeValue(); node.setDirtyCanvas(true,true);
                    },
                    onSerialize: function(o) { o.properties=o.properties||{}; o.properties['//RGB Curve Points']=JSON.stringify(this.curves); }
                };
                const addW = node.addCustomWidget(widget);
                const origSer=node.onSerialize; node.onSerialize=function(o){if(origSer)origSer.call(node,o); const cW=node.widgets.find(w=>w.name===widget.name&&w.type===WIDGET_TYPE_STRING); if(cW&&cW.onSerialize)cW.onSerialize(o);};
                const origConf=node.configure; node.configure=function(i){if(origConf)origConf.call(node,i); const cW=node.widgets.find(w=>w.name===widget.name&&w.type===WIDGET_TYPE_STRING); if(cW&&cW.configure)cW.configure(i);};
                return {widget:addW,minWidth:200,minHeight:widget.computeSize(200)[1]};
            }
        };
    },
});

console.log("Advanced RGB Curve Editor Extension Registered");
