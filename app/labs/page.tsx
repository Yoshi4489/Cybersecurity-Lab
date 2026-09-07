import { readLearningMaterial } from "../../controller/learning-material.mjs";
import { LabWorkspace } from "./workspace";

export default function LabsPage() {
  return <LabWorkspace labs={readLearningMaterial()} />;
}
