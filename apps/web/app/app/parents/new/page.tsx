import { requireViewer } from "@/lib/auth";
import { AddParentWizard } from "@/components/app/add-parent-wizard";

export const metadata = { title: "Add a parent" };

export default async function NewParent() {
  await requireViewer();
  return <AddParentWizard />;
}
