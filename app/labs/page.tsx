import { readLearningMaterial } from "../../controller/learning-material.mjs";
import { LabWorkspace } from "./workspace";
import { AccountGate } from "./account";

export default function LabsPage() {
  return <AccountGate><LabWorkspace labs={readLearningMaterial()} /></AccountGate>;
}
