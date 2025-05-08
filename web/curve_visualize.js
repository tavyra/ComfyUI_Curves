import { app } from "../../../scripts/app.js";

// Helper function to map a value from one range to another
function mapValue(value, fromMin, fromMax, toMin, toMax) {
    // Handle the case where the input range is zero
    if (fromMax === fromMin) {
        return (toMin + toMax) / 2; // Return the middle of the target range
    }
    // Perform linear interpolation
    const mapped = toMin + (toMax - toMin) * ((value - fromMin) / (fromMax - fromMin));
    // Clamp the value to the target range to prevent drawing outside bounds
    // return Math.max(toMin, Math.min(toMax, mapped)); // Optional clamping
    return mapped;
}

app.registerExtension({
    // Unique name for this extension
    name: "comfyui.curve_visualizer_display",

    // This function runs when a node is created in the UI graph
    nodeCreated(node) {
        // Check if the created node is our 'Curve Visualizer' type
        // 'Curve Visualizer' is the KEY used in NODE_CLASS_MAPPINGS in Python
        if (node.comfyClass === "Curve Visualizer") {

            console.log(`[CurveVisualizerDisplay] Found node: ${node.title} (ID: ${node.id})`);

            // --- Create the Custom Widget Object ---
            const widget = {
                type: "curve_plot_display", // Define a custom type for this widget
                name: "curvePlot",         // Give the widget instance a name
                y: 0,                      // Current Y position (updated in draw)
                computedHeight: 120,       // Default/initial height
                _value: null,              // Internal storage for the data list received from Python

                // Use getter/setter for the data value
                get value() {
                    return this._value;
                },
                set value(newVal) {
                    this._value = newVal;
                },

                // --- The main drawing function for the widget ---
                draw: function (ctx, node, widgetWidth, widgetY, H) {
                    this.y = widgetY; // Update the widget's Y position

                    const margin = 10; // Pixels of padding around the graph
                    const graphRect = { // Define the plotting area bounds
                        x: margin,
                        y: widgetY + margin,
                        width: widgetWidth - margin * 2,
                        // Use computed height to ensure consistency
                        height: this.computedHeight - margin * 2
                    };

                    // Draw the background for the entire widget space
                    ctx.fillStyle = LiteGraph.WIDGET_BGCOLOR || "#222";
                    ctx.fillRect(0, widgetY, widgetWidth, this.computedHeight);

                    // Draw the background and border for the graph plotting area
                    ctx.strokeStyle = "#555"; // Border color
                    ctx.fillStyle = "#111";   // Background color for plot area
                    ctx.lineWidth = 1;
                    ctx.strokeRect(graphRect.x, graphRect.y, graphRect.width, graphRect.height);
                    ctx.fillRect(graphRect.x, graphRect.y, graphRect.width, graphRect.height);

                    // Get the data that was stored by the event listener
                    const data = this.value;

                    // --- Handle cases with no data or insufficient data ---
                    if (!data || !Array.isArray(data) || data.length < 1) {
                        ctx.fillStyle = "#888"; // Text color for messages
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.font = "12px Arial";
                        ctx.fillText("No Data Received", graphRect.x + graphRect.width / 2, graphRect.y + graphRect.height / 2);
                        return; // Stop drawing here
                    }
                    if (data.length === 1) {
                        ctx.fillStyle = "#888";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.font = "12px Arial";
                        // Display the single scalar value
                        ctx.fillText(`Scalar Value: ${data[0].toFixed(4)}`, graphRect.x + graphRect.width / 2, graphRect.y + graphRect.height / 2);
                        return; // Stop drawing here
                    }

                    // --- Draw the Line Graph ---
                    ctx.strokeStyle = "orange"; // Line color
                    ctx.lineWidth = 1.5;      // Line thickness
                    ctx.beginPath();          // Start drawing the line path

                    // --- Calculate Data Range for Scaling ---
                    let yMin = data[0];
                    let yMax = data[0];
                    for (let i = 1; i < data.length; i++) {
                        if (data[i] < yMin) yMin = data[i];
                        if (data[i] > yMax) yMax = data[i];
                    }

                    // Add vertical padding if data range is very small or zero
                    if (yMax === yMin) {
                        yMin -= 0.5;
                        yMax += 0.5;
                    } else {
                        const yRange = yMax - yMin;
                        yMin -= yRange * 0.05; // 5% padding below min
                        yMax += yRange * 0.05; // 5% padding above max
                    }

                    // --- Plot the points ---
                    // Map the very first point
                    let canvasX = mapValue(0, 0, data.length - 1, graphRect.x, graphRect.x + graphRect.width);
                    // Note: Canvas Y coordinates are inverted (0 is top), so map to graphRect.y+height (bottom) -> graphRect.y (top)
                    let canvasY = mapValue(data[0], yMin, yMax, graphRect.y + graphRect.height, graphRect.y);
                    ctx.moveTo(canvasX, canvasY);

                    // Map and draw lines to the remaining points
                    for (let i = 1; i < data.length; i++) {
                        canvasX = mapValue(i, 0, data.length - 1, graphRect.x, graphRect.x + graphRect.width);
                        canvasY = mapValue(data[i], yMin, yMax, graphRect.y + graphRect.height, graphRect.y);
                        ctx.lineTo(canvasX, canvasY);
                    }
                    ctx.stroke(); // Render the line path

                    // --- Optional: Draw Labels ---
                    ctx.fillStyle = "#999"; // Label text color
                    ctx.font = "10px Arial";
                    ctx.textAlign = "left";
                    // Max label (top-left)
                    ctx.textBaseline = "top";
                    ctx.fillText(`Max: ${yMax.toFixed(3)}`, graphRect.x + 3, graphRect.y + 3);
                    // Min label (bottom-left)
                    ctx.textBaseline = "bottom";
                    ctx.fillText(`Min: ${yMin.toFixed(3)}`, graphRect.x + 3, graphRect.y + graphRect.height - 3);
                    // Point count label (bottom-right)
                    ctx.textAlign = "right";
                    ctx.fillText(`${data.length} pts`, graphRect.x + graphRect.width - 3, graphRect.y + graphRect.height - 3);

                }, // End of draw function

                // --- Define the widget's size ---
                computeSize: function (width) {
                    // You can adjust the fixed height here
                    const height = 120;
                    this.computedHeight = height; // Store for use in draw function
                    // Return [width, height]. Use 'null' for width to make it use the node's width.
                    return [null, height];
                },

            }; // End of widget definition

            // --- Add the widget to the node ---
            node.addCustomWidget(widget);
            console.log(`[CurveVisualizerDisplay] Widget added to node ${node.id}`);

            // --- Event Listener to receive data when the node executes ---
            const onExecuted = (event) => {
                // Check if the 'executed' event is specifically for this node instance
                // Use loose comparison (==) to handle potential string/number type differences for ID
                if (event.detail?.node == node.id) {
                    // Access the data sent from Python within the 'ui' -> 'visualization_data' structure
                    const data = event.detail?.output?.visualization_data;
                    console.log(`[CurveVisualizerDisplay] Node ${node.id} executed. Received data:`, (data ? `Array[${data.length}]` : data)); // Log confirmation

                    if (data !== undefined && Array.isArray(data)) {
                        widget.value = data; // Store the received data array in the widget
                        node.setDirtyCanvas(true, true); // IMPORTANT: Trigger a redraw to show the new graph
                    } else {
                        console.warn(`[CurveVisualizerDisplay] Node ${node.id} executed, but 'visualization_data' was missing or not an array in output.ui.`);
                        widget.value = null; // Clear previous data if none received
                        node.setDirtyCanvas(true, true); // Redraw to show "No Data"
                    }
                }
            };

            // Store the listener function ON THE NODE object itself
            // This allows us to easily find and remove it later
            node.curveVisualizerListener = onExecuted;

            // Register the listener with ComfyUI's API
            app.api.addEventListener("executed", onExecuted);
            console.log(`[CurveVisualizerDisplay] Added 'executed' listener for node ${node.id}.`);

            // --- Cleanup Logic: Remove listener when node is removed ---
            // Store the original onRemoved function if it exists
            const originalOnRemoved = node.onRemoved;
            node.onRemoved = () => {
                // Check if our listener exists on the node
                if (node.curveVisualizerListener) {
                    console.log(`[CurveVisualizerDisplay] Removing 'executed' listener for node ${node.id}`);
                    // Remove the listener from the API
                    app.api.removeEventListener("executed", node.curveVisualizerListener);
                    node.curveVisualizerListener = null; // Clear the reference on the node
                }
                // Call the original onRemoved function if it existed, preserving other cleanup behavior
                originalOnRemoved?.apply(node, arguments);
            };

            // Give the node an initial size calculation and redraw
            node.computeSize();
            node.setDirtyCanvas(true, true);

        } // End if (node.comfyClass === "Curve Visualizer")
    } // End nodeCreated method
}); // End registerExtension
