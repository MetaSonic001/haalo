import { requireViewer } from "@/lib/auth";
import { loadFamily } from "@/lib/data";
import { loadMessages } from "@/lib/care-data";
import { pickParent } from "@/lib/parent";
import { NoParent, PageHeader } from "@/components/app/page-header";
import { MessageCenter } from "@/components/app/care/message-center";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const viewer = await requireViewer();
  const fam = await loadFamily(viewer.id);
  const parent = pickParent(fam, p);
  if (!parent) return <NoParent />;
  const messages = await loadMessages([parent.id]);
  const who = parent.honorific || parent.name;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Messages"
        who={`${parent.name} · ${who}`}
        sub={`Say something to ${who} through Sneha: a note from a grandchild, a question about the house. Sneha says it in their language on the next call and brings back the answer.`}
      />
      <MessageCenter parent={{ id: parent.id, name: parent.name, honorific: parent.honorific }} messages={messages} />
    </div>
  );
}
