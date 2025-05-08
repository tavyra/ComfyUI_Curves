import torch
import numpy as np
import comfy.utils

class CurveVisualize:

    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        """
        Defines the input types for the node. It accepts various numerical formats.
        """
        return {
            "required": {
                # Accepts FLOAT, INT, TENSOR, or potentially lists passed directly.
                # Using '*' makes it flexible, handling will be done in the process method.
                "data_input": ("FLOAT", {}),
            }
        }

    # This node doesn't produce standard outputs for other nodes.
    RETURN_TYPES = ()
    # No standard return names needed.
    RETURN_NAMES = ()

    FUNCTION = "process"
    CATEGORY = "RGB Curve Editor"
    JAVASCRIPT = """
    <script src="./curves_visualize.js" type="module"></script>
    """

    def process(self, data_input):
        """
        Processes the input data, converts it to a list of floats,
        and returns it in the format expected by the JavaScript UI component.
        """
        visualization_data = [] # Default to empty list

        try:
            if isinstance(data_input, torch.Tensor):
                # Handle PyTorch Tensors
                if data_input.numel() == 0: # Check if tensor is empty
                    print("[CurveVisualize] Input tensor is empty.")
                    visualization_data = []
                else:
                     # Ensure tensor is on CPU, detach from graph, convert to numpy, flatten, then list
                    processed_list = data_input.detach().cpu().numpy().flatten().tolist()
                    # Ensure all elements are floats
                    visualization_data = [float(x) for x in processed_list]

            elif isinstance(data_input, np.ndarray):
                # Handle NumPy arrays
                if data_input.size == 0:
                    print("[CurveVisualize] Input NumPy array is empty.")
                    visualization_data = []
                else:
                    processed_list = data_input.flatten().tolist()
                    # Ensure all elements are floats
                    visualization_data = [float(x) for x in processed_list]

            elif isinstance(data_input, list):
                # Handle Python lists - attempt to convert elements to float
                processed_list = []
                valid = True
                for item in data_input:
                    if isinstance(item, (int, float)):
                        processed_list.append(float(item))
                    else:
                        # If an item in the list isn't a number, we might skip it or stop
                        print(f"[CurveVisualize] Warning: Non-numeric item '{item}' (type: {type(item)}) found in input list. Skipping.")
                        # Or you could set valid = False and break if strict checking is needed
                visualization_data = processed_list
                if not visualization_data:
                     print("[CurveVisualize] Input list resulted in empty data after filtering non-numerics.")


            elif isinstance(data_input, (int, float)):
                # Handle single numbers - JS expects an array
                visualization_data = [float(data_input)]

            else:
                # Attempt a generic conversion if possible (e.g., custom objects with tolist())
                if hasattr(data_input, 'tolist') and callable(data_input.tolist):
                     try:
                         data_as_list = data_input.tolist()
                         if isinstance(data_as_list, list):
                              # Basic check and conversion again, similar to list handling
                             processed_list = []
                             for item in data_as_list:
                                 if isinstance(item, (int, float)):
                                     processed_list.append(float(item))
                                 else:
                                     print(f"[CurveVisualize] Warning: Non-numeric item '{item}' found after calling .tolist(). Skipping.")
                             visualization_data = processed_list
                             if not visualization_data:
                                 print("[CurveVisualize] Input data after .tolist() resulted in empty data after filtering.")
                         else:
                              print(f"[CurveVisualize] Warning: Input data's .tolist() method did not return a list (got {type(data_as_list)}). Cannot visualize.")
                              visualization_data = []

                     except Exception as e:
                         print(f"[CurveVisualize] Error calling .tolist() on input type {type(data_input)}: {e}. Cannot visualize.")
                         visualization_data = []
                else:
                    print(f"[CurveVisualize] Warning: Unsupported input type: {type(data_input)}. Cannot visualize.")
                    visualization_data = [] # Return empty list for unsupported types

        except Exception as e:
             print(f"[CurveVisualize] Error processing input data: {e}")
             visualization_data = [] # Ensure it's an empty list on error

        # Structure the output specifically for the UI visualization
        # The JS expects the data list under the key "visualization_data" within a "ui" dictionary
        return {"ui": {"visualization_data": visualization_data}}

class RGBCurves:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "rgb_curve_points": ("rgb_curve_editor_widget",),
            }
        }

    RETURN_TYPES = ("FLOAT", "FLOAT", "FLOAT")
    RETURN_NAMES = ("red", "green", "blue")
    FUNCTION = "process"
    CATEGORY = "RGB Curve Editor"
    JAVASCRIPT = """
    <script src="./rgb_curves.js" type="module"></script>
    """

    def process(self, rgb_curve_points):
        red_curve_np = np.array(rgb_curve_points['red'], dtype=np.float32)
        green_curve_np = np.array(rgb_curve_points['green'], dtype=np.float32)
        blue_curve_np = np.array(rgb_curve_points['blue'], dtype=np.float32)
        red_curve = torch.from_numpy(red_curve_np)
        green_curve = torch.from_numpy(green_curve_np)
        blue_curve = torch.from_numpy(blue_curve_np)

        return (red_curve, green_curve, blue_curve)


class RGBCurvesAdvanced:
    # Added "Saw"
    CURVE_TYPES = ["Linear", "Sine", "Saw", "Triangle", "Square", "Log", "Exponential", "Max"]

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "rgb_curve_points": ("rgb_curve_editor_widget",),
                "curve_type": (s.CURVE_TYPES, {"default": "Linear"}),
                "frequency": ("INT", {"default": 1, "min": 1, "max": 32, "step": 1}),
                "offset": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 0, "step": 0.01, "round": 0.001}),
                "invert": ("BOOLEAN", {"default": False}),
            }
        }

    # Output remains the same: interpolated curves
    RETURN_TYPES = ("FLOAT", "FLOAT", "FLOAT")
    RETURN_NAMES = ("red_curve", "green_curve", "blue_curve")
    FUNCTION = "process"
    CATEGORY = "RGB Curve Editor" # Or your preferred category
    # Assuming the JS file is named rgb_curves_advanced.js and in the correct web/extensions path
    JAVASCRIPT = """
    <script type="module" src="./extensions/ComfyUI-KJNodes/rgb_curves_advanced.js"></script>
    """ # <-- Adjusted path assumption - MAKE SURE THIS MATCHES YOUR SETUP

    # Added offset and invert to signature
    def process(self, rgb_curve_points, curve_type, frequency, offset, invert):
        # The rgb_curve_points already contain the *interpolated* data
        # generated by the JavaScript widget based on user interactions
        # (including applying the selected curve type/frequency/offset/invert).
        # The curve_type, frequency, offset, and invert inputs primarily control the JS widget's behavior.

        # Ensure the received data is in the expected format
        if not isinstance(rgb_curve_points, dict) or 'red' not in rgb_curve_points:
            # Handle error or provide default curves
            print("Warning: Invalid rgb_curve_points data received. Using default linear curves.")
            # Use torch.linspace directly for default
            default_linear = torch.linspace(0.0, 1.0, 256, dtype=torch.float32)
            return (default_linear, default_linear, default_linear)

        # Convert the received interpolated points (arrays of 256 floats) to tensors
        # Provide default linear if a channel is missing
        default_linear_np = np.linspace(0.0, 1.0, 256, dtype=np.float32)
        red_curve_np = np.array(rgb_curve_points.get('red', default_linear_np), dtype=np.float32)
        green_curve_np = np.array(rgb_curve_points.get('green', default_linear_np), dtype=np.float32)
        blue_curve_np = np.array(rgb_curve_points.get('blue', default_linear_np), dtype=np.float32)

        # Clamp values just in case JS interpolation goes slightly out of bounds
        np.clip(red_curve_np, 0.0, 1.0, out=red_curve_np)
        np.clip(green_curve_np, 0.0, 1.0, out=green_curve_np)
        np.clip(blue_curve_np, 0.0, 1.0, out=blue_curve_np)

        red_curve = torch.from_numpy(red_curve_np)
        green_curve = torch.from_numpy(green_curve_np)
        blue_curve = torch.from_numpy(blue_curve_np)

        return (red_curve, green_curve, blue_curve)


NODE_CLASS_MAPPINGS = {
    "RGB Curve Editor": RGBCurves,
    "Curve Visualizer": CurveVisualize,
    "RGBCurvesAdvanced": RGBCurvesAdvanced
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RGB Curve Editor": "RGB Curve Editor",
    "Curve Visualizer": "Curve Debugger",
    "RGBCurvesAdvanced": "RGB Curves (Advanced)"
}
