import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as tf from "@tensorflow/tfjs";
import { env } from "../../config/env";
import { internalError } from "../../lib/errors";
import type { MlPreprocessingMetadata } from "./types";

type SerializedModelArtifacts = {
  modelTopology: unknown;
  weightSpecs: tf.io.WeightsManifestEntry[];
  weightDataBase64: string;
  saved_at: string;
};

function normalizeWeightData(weightData: tf.io.WeightData | null | undefined): ArrayBuffer {
  if (!weightData) {
    return new ArrayBuffer(0);
  }

  if (ArrayBuffer.isView(weightData)) {
    return (weightData.buffer as any).slice(
      weightData.byteOffset,
      weightData.byteOffset + weightData.byteLength
    ) as ArrayBuffer;
  }

  if (weightData instanceof ArrayBuffer) {
    return weightData;
  }

  if (Array.isArray(weightData)) {
    const totalBytes = weightData.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const merged = new Uint8Array(totalBytes);
    let offset = 0;

    for (const chunk of weightData) {
      merged.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    return merged.buffer;
  }

  return new ArrayBuffer(0);
}

export function getMlAssetsRoot(): string {
  return path.resolve(process.cwd(), env.ML_ASSETS_DIR);
}

export async function prepareModelArtifactPaths(version: string): Promise<{
  modelFilePath: string;
  preprocessingFilePath: string;
}> {
  const root = getMlAssetsRoot();
  const dir = path.join(root, "models", version);
  await mkdir(dir, { recursive: true });
  return {
    modelFilePath: path.join(dir, "model.json"),
    preprocessingFilePath: path.join(dir, "preprocessing.json"),
  };
}

export async function saveTfjsModel(model: tf.LayersModel, filePath: string): Promise<void> {
  let artifactsPayload: tf.io.ModelArtifacts | undefined;

  await model.save(
    tf.io.withSaveHandler(async (artifacts) => {
      artifactsPayload = artifacts;
      const normalizedWeights = normalizeWeightData(artifacts.weightData);
      return {
        modelArtifactsInfo: {
          dateSaved: new Date(),
          modelTopologyType: "JSON",
          modelTopologyBytes: JSON.stringify(artifacts.modelTopology ?? {}).length,
          weightDataBytes: normalizedWeights.byteLength,
        },
      };
    }),
  );

  const artifacts = artifactsPayload;
  if (!artifacts) {
    throw internalError("Failed to serialize ML model artifacts");
  }

  const normalizedWeightData = normalizeWeightData(artifacts.weightData);

  const serialized: SerializedModelArtifacts = {
    modelTopology: artifacts.modelTopology ?? {},
    weightSpecs: (artifacts.weightSpecs ?? []) as tf.io.WeightsManifestEntry[],
    weightDataBase64: Buffer.from(normalizedWeightData).toString("base64"),
    saved_at: new Date().toISOString(),
  };

  await writeFile(filePath, JSON.stringify(serialized, null, 2), "utf8");
}

export async function loadTfjsModel(filePath: string): Promise<tf.LayersModel> {
  const content = await readFile(filePath, "utf8");
  const parsed = JSON.parse(content) as SerializedModelArtifacts;

  const weightBuffer = Buffer.from(parsed.weightDataBase64 ?? "", "base64");
  const weightArrayBuffer = weightBuffer.buffer.slice(
    weightBuffer.byteOffset,
    weightBuffer.byteOffset + weightBuffer.byteLength,
  );

  const model = await tf.loadLayersModel(
    tf.io.fromMemory(
      parsed.modelTopology as tf.io.ModelJSON["modelTopology"],
      parsed.weightSpecs ?? [],
      weightArrayBuffer,
    ),
  );

  return model;
}

export async function savePreprocessingMetadata(
  metadata: MlPreprocessingMetadata,
  filePath: string,
): Promise<void> {
  await writeFile(filePath, JSON.stringify(metadata, null, 2), "utf8");
}

export async function loadPreprocessingMetadata(filePath: string): Promise<MlPreprocessingMetadata> {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as MlPreprocessingMetadata;
}
