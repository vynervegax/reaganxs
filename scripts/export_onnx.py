import argparse
import torch
from spandrel import ModelLoader


def export_model(safetensors_path: str, onnx_path: str):
    descriptor = ModelLoader().load_from_file(safetensors_path)
    model = descriptor.model.eval().cpu()

    dummy = torch.randn(1, 3, 64, 64)

    # Prefer classic exporter for SR models (more compatible than dynamo)
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
        },
        do_constant_folding=True,
    )
    print(
        f"Exported {onnx_path} (architecture: {descriptor.architecture.name})"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    export_model(args.input, args.output)


if __name__ == "__main__":
    main()