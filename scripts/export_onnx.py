import argparse
import torch
from spandrel import ModelLoader


def export_model(safetensors_path: str, onnx_path: str):
    descriptor = ModelLoader().load_from_file(safetensors_path)
    model = descriptor.model.eval()

    dummy = torch.randn(1, 3, 64, 64)
    torch.onnx.export(
        model,
        dummy,
        onnx_path,
        opset_version=17,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={
            "input": {2: "height", 3: "width"},
            "output": {2: "height", 3: "width"},
        }z
        dynamo=True,
    )
    print(f"Exported {onnx_path} (Detected architecture: {descriptor.architecture.name})")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to .safetensors")
    parser.add_argument("--output", required=True, help="Path to write .onnx")
    parser.add_argument("--arch", required=False, choices=["rgt", "atd", "bhi"])
    parser.add_argument("--scale", type=int, default=4)
    args = parser.parse_args()

    export_model(args.input, args.output)


if __name__ == "__main__":
    main()
